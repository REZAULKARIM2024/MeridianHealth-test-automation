# AI-assisted test design

Draft test cases are generated from user stories with the
[qa-test-case-agent](https://github.com/REZAULKARIM2024/qa-test-case-agent), then
**reviewed by a person** before any of them become Playwright tests.

## How to run
1. Add a repository secret `ANTHROPIC_API_KEY` (Settings -> Secrets and variables -> Actions).
2. Actions -> "AI test design (manual)" -> Run workflow.
3. Download the `ai-draft-test-cases` artifact: per story, a CSV, a JSON file and (when the story has
   acceptance criteria) a coverage report.

## Process
- Stories in `stories/` carry acceptance criteria written from the behaviour the API actually implements.
- The agent drafts positive, negative, edge and boundary cases and links each to a criterion.
- A human reads the draft, drops wrong or duplicate cases, then turns the keepers into Playwright tests.
- Nothing is committed or run automatically; the agent's version is pinned in the workflow.

## Status
- **Agent run: not done yet.** The workflow works up to the Anthropic call, but the account had no API credit, so
  the `qa-test-case-agent` has produced no output here and no test is claimed to come from it.
- **Claude-drafted, human-reviewed cases: done.** Claude drafted cases directly from the two stories (no agent),
  they were checked against the API code, and the ones not already covered became `tests/story-criteria.spec.ts`
  (7 tests, tagged BOOK-n / RX-n by criterion; all pass on Chromium locally and in CI).
- Already covered elsewhere and therefore not duplicated: login required to book (SEC-03/04/05/06).
- Not covered yet: the Rx upload itself (only the `rxConfirmed` flag is exercised through the API).
- Once the agent has run, its output can be compared with these hand-reviewed cases here.
