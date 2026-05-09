Run a complete reflection audit on all SARAB missions you executed.

Goal:
Identify what went wrong, what was repeated, what should be documented, and what should be automated so future AI sessions work faster with fewer errors.

Keep writing progress into `mission.log`.

## Phase 1 — Mission history reconstruction

Review:

* `mission.log`
* git history/diff
* completed mission files
* current codebase state
* docs/instruction files
* tests
* known errors/fixes

Reconstruct:

* missions completed
* failures encountered
* repeated mistakes
* unclear requirements
* missing context
* incomplete work
* time wasted
* commands repeated many times

## Phase 2 — Failure reflection

For every failure or mistake, identify:

* what happened
* root cause
* how it could have been avoided
* what instruction/doc would prevent it next time
* whether a test should have caught it
* whether automation would have avoided it

## Phase 3 — Update AI instructions/docs

Find the md instruction/rules file loaded in every new session.

Update it with concise project-specific guidance:

* known pitfalls
* required workflow
* testing rules
* logging rules
* execution/session rules
* where important code lives
* when to use Playwright
* how to audit/refactor code
* how to avoid past mistakes

Do not add generic advice. Keep it short and useful.

## Phase 4 — Automation reflection

Identify repeated tasks that should be automated, such as:

* running tests
* stop-on-first-failure workflows
* checking logs
* checking SARAB data files
* validating sessions
* validating prompt md files
* inspecting jobs
* starting/stopping missions
* cleanup/debug commands

Create useful shell or Python scripts for repeated tasks.

## Phase 5 — Reflection audit report

Create an md audit report summarizing:

* missions reviewed
* failures found
* repeated actions found
* documentation gaps
* automation opportunities
* scripts created
* instruction updates made
* remaining risks

## Phase 6 — Generate backlog tasks

Create improvement task files under:

```text
missions/00-backlogs
```

Use the same format/style as:

```text
missions/02-done/002_upgrade_sarab_add_prjects_feature.md
```

Each backlog task should include:

* goal
* context
* problem
* implementation steps
* testing expectations
* audit/refactor expectations
* acceptance criteria

## Phase 7 — Implement quick wins

If any improvement is small and clearly safe:

* implement it immediately
* update docs/instructions
* add/update tests if relevant
* audit changed code
* keep files small and focused

## Phase 8 — Validate

Run relevant checks/tests.
If errors appear:

1. Stop on first failure
2. Fix root cause
3. Audit/refactor changed code
4. Re-run
5. Repeat until stable

Final output:

* Reflection report path
* Instructions/docs updated
* Scripts created
* Backlog task files created
* Tests/checks run
* Remaining recommendations
