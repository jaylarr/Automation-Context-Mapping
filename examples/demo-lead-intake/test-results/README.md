# Test results

Evidence that the workflows were tested: one folder per test run.

```
test-results/
└── YYYY-MM-DD-<workflow-nn>-<short-name>/
    ├── result.md          ← what was tested, outcome, execution ID (template below)
    └── <screenshots, output files, email/text captures>
```

- Name folders like `2026-09-28-01-follow-up-send-mode` (date, workflow number, what was tested).
- Screenshots: `.png`/`.jpg`. Outputs: `.json`, `.txt`, `.csv`, `.pdf`.
- **Mask client PII and never store secrets** (API keys, tokens, full credentials).
- Link the run from the spec's QA sign-off.

## result.md template

```markdown
# <Workflow> — <what was tested>

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Workflow | `NN-name.json` (n8n ID `...`) |
| Instance | dev / prod |
| Execution ID | ... |
| Mode | manual / pinned data / live |
| Outcome | PASS / FAIL |

## Setup
## Test cases
| # | Case | Expected | Actual | Result |
|---|---|---|---|---|
## Evidence
## Notes / follow-ups
```
