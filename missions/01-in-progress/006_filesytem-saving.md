Implement filesystem-backed persistence for projects, tickets, and prompts.

Context:
- Current issue: after stopping `npm run dev` and starting it again, the project list becomes empty and users must recreate projects.
- Root goal: project, ticket, and prompt data must persist on disk and reload automatically when the app starts.
- Base project storage path: `/srv/dev/sarab/projects`

Important workflow:
- Preserve existing behavior unless it conflicts with persistence.
- Add/update tests when relevant.
- Add/update Playwright tests for project/ticket/prompt persistence flows.
- After each code change, audit source code and test code.
- Refactor to follow Single Responsibility Principle.
- Split God Classes/Blob files into focused feature/domain modules.
- Organize code by feature/domain, not generic type folders.
- Keep progress in `mission.log`.

## Phase 1 — Discovery
Audit the current project, ticket, and prompt data flow:
- Where projects are created, listed, updated, deleted, and loaded.
- Where tickets are created and stored.
- Where prompts are created and stored.
- Current in-memory state, API routes, services, models, UI flows, and tests.
- Existing filesystem/data/log conventions under `/srv/dev/sarab`.

Identify the cleanest persistence architecture before changing code.

## Phase 2 — Project filesystem persistence
Implement project creation using the filesystem:

- When a user creates a new project, create a folder under:

  `/srv/dev/sarab/projects/[project-name]`

- If `/srv/dev/sarab/projects` does not exist, create it safely.
- If the project folder already exists, do not overwrite it. Return/show a clear user-facing error such as: `Project folder already exists`.
- Use safe folder names:
  - Trim whitespace.
  - Reject empty names.
  - Prevent path traversal.
  - Normalize or slugify names if the existing app already uses slugs.
- On app/server startup or project list load, scan `/srv/dev/sarab/projects` and rebuild the project list from existing folders.
- The project list must not depend only on volatile memory.

## Phase 3 — Ticket markdown persistence
Persist every new ticket as a markdown file under:

`/srv/dev/sarab/projects/[project-name]/tickets/backlog/[ticket-title].md`

Requirements:
- Create missing directories automatically.
- Use safe filenames based on the ticket title.
- Avoid accidental overwrites. If a ticket filename already exists, add a stable suffix or use an ID-based filename.
- Store ticket metadata and content in a clear markdown format.
- Support reading/parsing the markdown files back into ticket objects.
- Do not blindly copy the example format if a better structured format is already used in the codebase.
- Keep compatibility with this general structure:

```md
Title: Change all for to modal popup
Kanban Status: backlog
Model: default
Project: Sarab
Session: 42c78fe8-0a55-4224-a86a-ffeb47feeab0
Attempt: 3 / 3
Tags: kanban
Created: 2026-05-09 09:07
Started: 2026-05-09 09:07
Completed: 2026-05-09 09:20
Error: none
Log: /srv/dev/sarab/data/logs/a9ed9621.log
========================================
Content:
[content of the user ticket]
````

Also implement loading tickets from markdown files:

* Load backlog tickets from `tickets/backlog`.
* Preserve status from metadata when available.
* Handle malformed markdown safely with clear errors/logging.
* Do not crash the app because of one bad ticket file.

## Phase 4 — Prompt markdown persistence

Implement the same filesystem-backed approach for prompts:

* Save newly created prompts as `.md` files under the relevant project folder.

* Choose a clear folder structure, for example:

  `/srv/dev/sarab/projects/[project-name]/prompts/[prompt-title].md`

  or use the existing project convention if one already exists.

* Store prompt metadata and content in a parseable markdown format.

* Load prompts from markdown files when opening a project or starting the app.

* Use safe filenames, prevent overwrites, and handle malformed prompt files gracefully.

## Phase 5 — UI/API integration

Update the UI and API so persistence feels automatic:

* Project list loads existing project folders automatically.
* New project creation immediately creates the folder and updates the UI.
* Duplicate project folder errors are shown clearly to the user.
* Tickets remain visible after stopping and restarting `npm run dev`.
* Prompts remain visible after stopping and restarting `npm run dev`.
* Add loading, empty, success, and error states where needed.

## Phase 6 — Tests

Add/update relevant tests:

* Unit tests for:

  * Safe project folder creation.
  * Duplicate project folder detection.
  * Markdown serialization/parsing for tickets.
  * Markdown serialization/parsing for prompts.
  * Safe filename/path handling.
  * Malformed markdown handling.

* Integration tests for:

  * Creating a project creates the correct folder.
  * Reloading projects from `/srv/dev/sarab/projects`.
  * Creating a ticket writes a markdown file.
  * Loading tickets from markdown files.
  * Creating/loading prompts from markdown files.

* Playwright tests for:

  * Create project → stop/reload app simulation or refresh → project still appears.
  * Create ticket → refresh/reload → ticket still appears in backlog.
  * Duplicate project creation shows a clear error.
  * Create prompt → refresh/reload → prompt still appears.

## Phase 7 — Audit/refactor

Audit source code and test code:

* Split filesystem persistence into focused services/modules.
* Keep parsing/serialization separate from UI/API logic.
* Keep project, ticket, and prompt persistence responsibilities separated.
* Remove duplication.
* Ensure code follows Single Responsibility Principle.
* Organize by feature/domain.

## Phase 8 — Documentation

Update relevant docs with:

* Project filesystem layout.
* Ticket markdown format.
* Prompt markdown format.
* Startup/loading behavior.
* Error handling rules.
* Any migration notes from old volatile state.

## Phase 9 — Final test/fix loop

Run tests with stop-on-first-failure.

Repeat:

1. Run tests
2. Fix the first failure
3. Audit/refactor changed source and test code
4. Re-run tests
5. Repeat until zero failures

Final output:

* Root cause of the data loss
* Persistence architecture implemented
* Files changed
* Project/ticket/prompt filesystem structure
* Tests added/updated
* Playwright coverage added
* Refactors performed
* Documentation updated
* Final test result
* Remaining risks/backlog

