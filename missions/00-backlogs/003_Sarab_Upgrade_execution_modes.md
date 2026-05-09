# Upgrade SARAB execution modes.

## Important workflow for every phase:

* Add/update Playwright tests when relevant.
* After each code change, audit source code and test code.
* Refactor to follow Single Responsibility Principle.
* Split God Classes/Blob files into focused feature/domain modules.
* Keep writing progress into `mission.log`.

## Phase 00 — MCP environment setup

Before starting implementation, audit and install all useful MCP servers/tools for this type of project.

Investigate and setup MCP servers useful for:

* Playwright/browser automation
* filesystem/project navigation
* git/github workflows
* terminal/command execution
* documentation/code indexing
* database inspection
* logs/debugging
* architecture/code search
* API testing
* JSON/Markdown manipulation
* task automation

Tasks:

* Detect which MCP servers are already installed/configured
* Install/configure missing useful MCP servers
* Validate they work correctly
* Organize MCP configuration cleanly
* Remove broken/redundant MCP configs if needed

Also:

* Create/update documentation explaining available MCP tools
* Explain when each MCP should be used
* Add useful project-specific MCP workflows/shortcuts if relevant
* Update AI instruction docs so future sessions know available MCP capabilities

Audit/refactor MCP configs/scripts if needed:

* split long configs
* improve maintainability
* remove duplication
* keep configuration modular

Add/update tests/check scripts when relevant.

Keep writing progress into `mission.log`.

## Phase 1 — Audit current execution flow

Audit current Claude/API execution, prompt storage, sessions, logs, status handling, and UI controls.

## Phase 2 — Add execution mode model/config

Add support for two execution modes:

* API execution
* Terminal command execution

Store selected mode per prompt/job.

## Phase 3 — Implement terminal command execution

Run terminal prompts from selected project root:

```bash
cd /path/to/project
claude --resume --model deepseek-v4-flash -p "$(cat prompt.md)"
```

Support `.md` prompt files, project root path, logs, status, errors, and session ID save/resume.

## Phase 4 — Add execution mode UI

Add UI selector so the user chooses API or Terminal mode when creating/rerunning a prompt.

## Phase 5 — Support long-running missions

Increase timeout for missions that may take hours.
Keep live/refreshable logs and clear running status.

## Phase 6 — Add Stop action

Add Stop button for running missions.
Ensure process/status/logs are updated safely.

## Phase 7 — Add Resume action

Add Resume button for stopped missions.
Resume using saved session ID + prompt file, continuing from where it stopped when possible.

## Phase 8 — Playwright tests

Add/update tests for:

* API mode
* Terminal mode
* project-root execution
* long-running status
* stop mission
* resume mission
* session ID save/resume
* prompt `.md` file execution

## Phase 9 — Audit/refactor

Audit all changed source and test code.
Split long files, remove duplication, and organize by feature/domain.

## Phase 10 — Final test/fix loop

Run Playwright with stop-on-first-failure.

Repeat:

1. Run tests
2. Fix first failure
3. Audit/refactor changed code
4. Re-run tests
5. Repeat until zero failures

Final output:

* Features implemented
* Files changed
* Tests added/updated
* Refactors performed
* Final test result
* Remaining risks
