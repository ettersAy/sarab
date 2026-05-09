Read and understand:

* `scripts/claude-worker.sh`
* `scripts/claude-batch.sh`

Then continue building the SARAB web app inspired by those scripts. 

Project:

* Name: SARAB
* Local path: `/srv/dev/sarab`
* GitHub: `https://github.com/ettersAy/sarab`

Important:
You already started building this app previously but failed before completion. The user currently has no clear visibility into where the work stopped.

First:

* Audit the current project state
* Detect what was already implemented
* Detect incomplete/broken phases
* Detect unfinished features/tasks/tests
* Restart from the last stable point instead of rebuilding everything from scratch

Also add continuous mission logging.

Create/update:

```text id="6y1b2w"
mission.log
```

During the mission, continuously append progress notes such as:

* phase started/completed
* important features implemented
* packages installed
* migrations executed
* tests created
* tests fixed
* audits completed
* important architecture decisions
* major bugs/errors encountered
* refactors performed

The log should help the user understand:

* current progress
* where execution stopped if the mission fails
* what was already completed
* what remains to do

Build the project in iterative phases.

## Phase 1 — Build MVP

Create version 1 with the essential features only.
Keep architecture simple, modular, and scalable.

## Phase 2 — Audit

Audit:

* architecture
* code quality
* UX
* maintainability
* missing features
* bad practices
* technical debt

Generate:

* audit reports
* implementation task files
* improvement roadmap

## Phase 3 — Refactor/Fix

Implement the audit tasks and improve the codebase.

## Phase 4 — Playwright Tests

Create Playwright tests covering all important features of this version.

## Phase 5 — Audit Playwright

Audit and refactor the Playwright architecture:

* reusable helpers
* page objects
* maintainability
* flaky tests
* split long files

## Phase 6 — Continuous Fix/Test Cycle

Repeat until stable:

* run tests
* stop on first failure
* fix issues
* audit modified code
* split/refactor long files if needed
* rerun tests

Repeat until zero errors remain.

## Phase 7 — Upgrade Features

Add new features and improve existing ones.

## Phase 8 — Re-Audit

Run a new full audit of:

* architecture
* code quality
* UX
* scalability
* security
* maintainability
* testing

Generate new reports/tasks.

## Phase 9 — Improve Again

Implement the new audit tasks.

Then repeat:

* Playwright tests
* Playwright audit
* continuous run/fix/audit cycle
  until stable.

Important:

* Follow SOLID principles
* Keep files small and focused
* Avoid over-engineering
* Keep architecture extensible
* Prefer modular reusable components/services
* Continuously improve documentation
* Add developer-friendly docs explaining where features/code live
