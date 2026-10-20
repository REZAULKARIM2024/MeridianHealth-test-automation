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
No generated output is committed here yet, and none of the existing 77 tests were written by the agent.
This section will list accepted cases (and how many were rejected) once a reviewed run exists.
