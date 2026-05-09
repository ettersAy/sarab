Continue upgrading SARAB with a project chatbot for quick questions.

Goal:
Add a chatbot that lets the user ask simple questions about a selected project. The chatbot must call the configured AI API and include the project documentation/context defined in Project Settings.

Important workflow for every phase:

* Add/update Playwright tests when relevant.
* After each code change, audit source code and test code.
* Refactor to follow Single Responsibility Principle.
* Split God Classes/Blob files into focused feature/domain modules.
* Keep writing progress into `mission.log`.

## Phase 1 — Discovery

Audit current project settings, AI provider settings, documentation/context selection, and project pages.
Identify where the chatbot should fit in the UI.

## Phase 2 — Chatbot data model

Add storage for:

* project chat conversations
* chat messages
* selected project
* AI provider/model used
* docs/context used
* timestamps
* errors/status

## Phase 3 — Context loading

Use the documentation files defined in Project Settings as chatbot context.
Support:

* enabled/disabled docs
* ordered docs
* missing file validation
* safe file reading
* context size limits
* clear error if docs are missing or too large

## Phase 4 — AI question answering

Implement AI API call for quick project questions.
The request should include:

* user question
* selected project docs/context
* project metadata
* chatbot instruction prompt/template from project settings if available

The response should be short, clear, and project-specific.

## Phase 5 — Chatbot UI

Add a clean chatbot interface:

* select project
* ask question
* view answer
* view previous messages
* loading/error states
* retry failed answer
* clear conversation
* copy answer
* show which docs/context were used

## Phase 6 — Project settings integration

Extend Project Settings if needed:

* chatbot system prompt
* chatbot enabled/disabled docs
* default chatbot provider/model
* max context size
* answer style preference
* include/exclude documentation files

## Phase 7 — Smart UX helpers

Add useful actions:

* “Ask about this project”
* “Explain this feature”
* “Where is this implemented?”
* “How do I change this?”
* “Generate implementation hint”
* “Summarize project docs”

Keep all AI answers informational only; do not execute missions from chatbot unless explicitly converted into a prompt/ticket.

## Phase 8 — Security and reliability

Audit:

* path validation
* file access safety
* API errors
* missing provider/model
* missing docs
* huge context handling
* sensitive env/API key exposure
* rate/error handling

## Phase 9 — Documentation

Update docs:

* chatbot architecture
* project docs/context flow
* Project Settings chatbot options
* where chatbot code lives
* how to add new chatbot tools/actions

## Phase 10 — Playwright tests

Add/update tests for:

* chatbot page opens
* ask question
* answer displayed
* project docs are used
* missing docs error
* provider/model config error
* retry
* clear conversation
* copy answer if implemented

## Phase 11 — Audit/refactor

Audit all chatbot source code and test code.
Split long files, remove duplication, improve abstractions, and organize by feature/domain.

## Phase 12 — Final test/fix loop

Run Playwright with stop-on-first-failure.

Repeat:

1. Run tests
2. Fix first failure
3. Audit/refactor changed code
4. Split long files if needed
5. Re-run tests
6. Repeat until zero failures

Final output:

* Chatbot features implemented
* Files changed
* Project settings added/updated
* Tests added/updated
* Refactors performed
* Final test result
* Remaining risks/backlog
