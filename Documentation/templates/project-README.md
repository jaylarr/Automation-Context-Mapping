# {{PROJECT_NAME}}

> {{ONE_LINE_PURPOSE}}

| | |
|---|---|
| **Slug** | `{{PROJECT_SLUG}}` |
| **Client** | {{CLIENT}} |
| **Status** | `discovery` |
| **Current version** | 0.1.0 |
| **Started** | {{DATE}} |
| **n8n instance(s)** | see [AGENTS.md](AGENTS.md) |

<!-- Status values: discovery · scoped · building · testing · live · maintenance · paused · archived -->

## What it does

<!-- 2–4 sentences in plain language: the business problem and what the automation does about it. -->

## Workflows

| # | File | n8n name | Trigger | Purpose |
|---|---|---|---|---|
| 00 | [00-error-handler.json](workflows/00-error-handler.json) | `[{{PROJECT_SLUG}}] Handle workflow errors` | Error Trigger | Alerts on any failure in this project |
| 01 | | | | |

## Architecture

See [documentation/architecture.md](documentation/architecture.md).

## Website / app

<!-- Delete this section if the project has no website/. -->
See [website/README.md](website/README.md).

## Docs

- Specs: [documentation/spec/](documentation/spec/)
- Changelog: [documentation/CHANGELOG.md](documentation/CHANGELOG.md)
- Decisions: [documentation/decisions.md](documentation/decisions.md)
- Client handover: [documentation/handover-sop.md](documentation/handover-sop.md)
