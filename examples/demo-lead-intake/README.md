# Demo Lead Intake

> Receive website contact-form leads, check them, and store them in a Google Sheet

| | |
|---|---|
| **Slug** | `demo-lead-intake` |
| **Client** | Demo Co (fictional) |
| **Status** | `discovery` |
| **Current version** | 0.1.0 |
| **Started** | 2026-09-29 |
| **n8n instance(s)** | see [AGENTS.md](AGENTS.md) |

<!-- Status values: discovery · scoped · building · testing · live · maintenance · paused · archived -->

## What it does

<!-- 2–4 sentences in plain language: the business problem and what the automation does about it. -->

## Workflows

| # | File | n8n name | Trigger | Purpose |
|---|---|---|---|---|
| 00 | [00-error-handler.json](workflows/00-error-handler.json) | `[demo-lead-intake] Handle workflow errors` | Error Trigger | Alerts on any failure in this project |
| 01 | [01-receive-lead.json](workflows/01-receive-lead.json) | `[demo-lead-intake] Receive lead` | Webhook | Form lead → check email → Leads sheet; 400 when the email is missing |

## Architecture

See [documentation/architecture.md](documentation/architecture.md).

## Docs

- Specs: [documentation/spec/](documentation/spec/)
- Changelog: [documentation/CHANGELOG.md](documentation/CHANGELOG.md)
- Decisions: [documentation/decisions.md](documentation/decisions.md)
- Client handover: [documentation/handover-sop.md](documentation/handover-sop.md)
