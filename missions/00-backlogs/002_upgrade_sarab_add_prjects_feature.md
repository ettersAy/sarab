# Upgrade SARAB.

Project:

* Name: SARAB
* Path: `/srv/dev/sarab`
* GitHub: `https://github.com/ettersAy/sarab`

Important:

* Continue from the current state, do not rebuild from scratch.
* First audit what already exists and restart from the last stable point.
* Keep writing progress into `mission.log` during the mission: phases, packages installed, features implemented, bugs, fixes, tests, audits, and phase completion.

Context / current problems:

* Claude session used to run a prompt is lost. Retrieve Claude session IDs and save them.
* After a prompt is created, the user cannot view details or edit it. Add detail, edit, restart, and rerun controls.
* Users can start simple standalone prompts not linked to a project. Keep this option.
* Users should also be able to start a prompt from an old Claude session.
* Add AI prompt improvement: user writes a prompt, clicks a button/list action, SARAB calls api DeepSeek to reformulate/correct/improve it. Use the API key from `.zshrc` env var `ANTHROPIC_AUTH_TOKEN`. 

New feature: Projects

* User can create projects.
* Each project has a name and local root path.
* When a project is selected, Claude commands must run from that project root.
* Project prompts are linked to the project.
* Save every Claude session ID returned by executions.
* By default, new project prompts should resume the latest saved session.
* User can choose to resume an older session or start a new session.
* Use `claude --resume` when resuming a session.

## Phase 1 — Discovery

Audit existing SARAB code, current features, DB/schema, Claude execution flow, UI, tests, and docs. Identify what is implemented, broken, or missing. Log findings in `mission.log`.

## Phase 2 — Data model

Design/update models for:

* projects
* prompts
* executions
* Claude sessions
* prompt versions/history if useful
* execution logs/status

Add migrations/schema updates safely.

## Phase 3 — Claude session handling

Implement reliable session ID capture and storage. Ensure executions can start:

* standalone new session
* standalone old session
* project latest session
* project selected old session
* project new session

## Phase 4 — Project management

Implement project CRUD:

* create/edit/delete/list projects
* validate local root path
* show project details
* show related prompts, sessions, and executions

## Phase 5 — Prompt management

Improve prompt UX:

* view prompt details
* edit prompt before execution
* restart/rerun prompt
* duplicate prompt
* view status, logs, result, errors, session used
* choose execution mode/session

## Phase 6 — DeepSeek prompt improvement

Add “Improve prompt” action:

* reformulate/correct/improve user prompt
* keep result editable before saving/running
* handle API errors cleanly
* document env/config requirements

## Phase 7 — Execution architecture

Refactor Claude execution if needed:

* clean service boundaries
* project-root execution
* standalone execution
* resume/new session logic
* logs/status tracking
* long-running execution support
* clear errors and recovery

## Phase 8 — UI/UX upgrade

Improve the interface:

* dashboard
* project pages
* prompt detail/edit pages
* execution history
* session selector
* logs/result viewer
* clear empty/loading/error states

## Phase 9 — Audit/refactor

Audit new code for SOLID, single responsibility, maintainability, security, and long files. Refactor and split files/services/components where needed.

## Phase 10 — Documentation

Update docs:

* app architecture
* Claude execution flow
* sessions/resume behavior
* projects
* prompt lifecycle
* DeepSeek prompt improvement
* where to change code

## Phase 11 — Playwright tests

Add Playwright tests for:

* project CRUD
* standalone prompt
* project prompt
* edit/rerun prompt
* resume old session
* start new session
* improve prompt action
* execution logs/status
* error states

## Phase 12 — Test/fix loop

Repeat until stable:

1. Run tests with stop-on-first-failure
2. Fix the error
3. Audit/refactor changed code
4. Split long files if needed
5. Re-run tests
6. Repeat until zero failures

Final output:

* Summary of implemented features
* Files changed
* Session handling explanation
* Tests added
* Final test result
* Remaining risks/technical debt
## Phase 13 — Settings feature discovery

Audit current configuration handling and identify where app settings should live:

* AI providers
* default provider/model
* API keys/env vars
* Claude CLI options
* execution defaults
* timeout/retry options
* prompt improvement settings

## Phase 14 — Settings data model

Design/update storage for settings:

* multiple AI providers
* provider name/type
* base URL
* API key env var name
* default model
* enabled/disabled status
* default provider flag
* execution options
* prompt improvement provider/model

## Phase 15 — Settings UI

Create a Settings screen where the user can:

* add/edit/delete AI providers
* enable/disable providers
* select default provider
* select default model
* configure API key env var name
* configure base URL if needed
* configure Claude CLI command/options
* configure default timeout/retry behavior
* configure prompt improvement provider/model

## Phase 16 — Provider integration

Refactor AI provider usage to read from Settings instead of hardcoded values.
Ensure DeepSeek prompt improvement uses the selected/default provider when configured.

## Phase 17 — Validation and safety

Add validation for:

* missing API key env vars
* invalid base URL
* missing default model
* duplicate provider names
* deleted provider used by prompts
* unavailable provider/model

## Phase 18 — Documentation

Document:

* how Settings works
* how to add a provider
* how env vars are resolved
* how default provider/model are selected
* how Claude/DeepSeek config is used

## Phase 19 — Playwright tests

Add tests for:

* Settings page loads
* add/edit/delete provider
* select default provider/model
* validation errors
* prompt improvement uses configured provider
* prompt execution still works after settings changes

## Phase 20 — Audit/test loop

Audit/refactor Settings code, split long files, then run tests with stop-on-first-failure and repeat fix/audit/test until zero failures.
