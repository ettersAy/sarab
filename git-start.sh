#!/usr/bin/env bash

# ==============================================================================
# git-start.sh
# Automates Git workflow: Sync Main -> Fetch Issue -> Create Branch
# Usage: ./git-start.sh <issue_number>
# Example: ./git-start.sh 12
# ==============================================================================

set -euo pipefail

# --- Configuration ---
REPO_OWNER="ettersAy" # Change if needed or detect dynamically
REPO_NAME=""          # Will auto-detect from current directory
BRANCH_PREFIX_MAIN="main"
GH_TOKEN="${GITHUB_TOKEN=:-}" # Ensure GH_TOKEN is set in env

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Helper Functions ---
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- 1. Validation & Setup ---
if [ -z "$1" ]; then
    log_error "Usage: $0 <issue_number>"
fi

ISSUE_NUM="$1"

# Detect Repo Name from current directory or git remote
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    log_error "Not a git repository."
fi

# Try to get repo name from remote URL
REMOTE_URL=$(git config --get remote.origin.url)
if [[ $REMOTE_URL =~ github.com[:/]([^/]+)/([^.]+) ]]; then
    REPO_OWNER="${BASH_REMATCH[1]}"
    REPO_NAME="${BASH_REMATCH[2]}"
else
    log_warn "Could not auto-detect repo owner/name. Using current dir name for repo."
    REPO_NAME=$(basename "$(pwd)")
    # Keep REPO_OWNER as default or prompt if necessary
fi

if [ -z "$GH_TOKEN" ]; then
    log_error "GH_TOKEN environment variable is not set. Please export your GitHub PAT."
fi

# --- 2. Sync Main Branch ---
log_info "Syncing ${BRANCH_PREFIX_MAIN}..."

# Stash any local changes to prevent conflicts during checkout
if ! git diff-index --quiet HEAD --; then
    log_warn "Uncommitted changes detected. Stashing them temporarily..."
    git stash push -m "auto-stash before issue start"
fi

git fetch origin
git checkout "$BRANCH_PREFIX_MAIN"
git pull origin "$BRANCH_PREFIX_MAIN"

# --- 3. Fetch Issue Data ---
log_info "Fetching Issue #${ISSUE_NUM} from ${REPO_OWNER}/${REPO_NAME}..."

API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUM}"

RESPONSE=$(curl -s -H "Authorization: token ${GH_TOKEN}" -H "Accept: application/vnd.github.v3+json" "$API_URL")

# Check for errors
if echo "$RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message')
    log_error "GitHub API Error: $ERROR_MSG"
fi

ISSUE_TITLE=$(echo "$RESPONSE" | jq -r '.title')
ISSUE_STATE=$(echo "$RESPONSE" | jq -r '.state')

if [ "$ISSUE_STATE" == "closed" ]; then
    log_warn "Issue #${ISSUE_NUM} is already closed. Proceeding anyway..."
fi

log_info "Issue Title: '${ISSUE_TITLE}'"

# --- 4. Generate Branch Name (Python Helper) ---
# Using Python for robust string sanitization without external LLM latency/cost.
# Logic: Extract type prefix if present, else default to 'feat', slugify the rest.

BRANCH_NAME=$(python3 << PYEOF
import re
import sys

title = """${ISSUE_TITLE}"""
issue_id = "${ISSUE_NUM}"

# 1. Detect Type Prefix (e.g., [feat], [fix], feat:, fix:)
# Regex looks for standard conventional commit prefixes at the start
type_map = {
    'feat': 'feat', 'feature': 'feat',
    'fix': 'fix', 'bug': 'fix',
    'docs': 'docs',
    'style': 'style',
    'refactor': 'refactor',
    'test': 'test',
    'chore': 'chore'
}

branch_type = 'feat' # Default
clean_title = title

# Check for [type] or type: pattern
match = re.match(r'^\s*\[?(\w+)\]?[:\s]\s*(.*)', title, re.IGNORECASE)
if match:
    potential_type = match.group(1).lower()
    if potential_type in type_map:
        branch_type = type_map[potential_type]
        clean_title = match.group(2)
    else:
        # If prefix isn't a known type, treat whole title as description
        clean_title = title
else:
    clean_title = title

# 2. Slugify the description
# Lowercase
slug = clean_title.lower()
# Replace non-alphanumeric with hyphens
slug = re.sub(r'[^a-z0-9\s-]', '', slug)
# Replace spaces with hyphens
slug = re.sub(r'[\s]+', '-', slug)
# Remove multiple hyphens
slug = re.sub(r'-+', '-', slug)
# Trim hyphens
slug = slug.strip('-')

# Truncate if too long (max 50 chars for slug part)
if len(slug) > 50:
    slug = slug[:50].rstrip('-')

final_branch = f"{branch_type}/{issue_id}-{slug}"
print(final_branch)
PYEOF
)

log_info "Generated Branch: ${BRANCH_NAME}"

# --- 5. Create & Checkout Branch ---
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    log_warn "Branch '${BRANCH_NAME}' already exists. Checking out..."
else
    git checkout -b "$BRANCH_NAME"
    log_info "Branch created and checked out."
fi

# Restore stashed changes if any were stashed
if git stash list | grep -q "auto-stash before issue start"; then
    log_info "Restoring stashed changes..."
    git stash pop
fi

log_info "Ready to code! 🚀"