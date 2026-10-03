# Documentation — Index

The global rulebook for every automation project in this workspace. A project's own
`documentation/` folder describes **that project**. This folder describes **how every project is
done**.

> **New here, or not technical?** Start with [00: Start here](00-start-here.md), the whole system in plain language.

## Reading order

| # | Doc | Read it when… |
|---|---|---|
| 00 | [Start here](00-start-here.md) | First, or whenever you want the plain-language overview |
| 01 | [Workspace structure](01-workspace-structure.md) | You need to know where something goes |
| 02 | [How I work](02-how-i-work.md) | Starting any client engagement: the lifecycle from discovery to maintenance |
| 03 | [Naming conventions](03-naming-conventions.md) | Naming a project, file, workflow, node, tag, or credential |
| 04 | [Workflow design standards](04-workflow-design-standards.md) | Designing or reviewing any workflow |
| 05 | [Export & versioning](05-export-and-versioning.md) | Saving workflows to the repo, changelogs, git |
| 06 | [Credentials & security](06-credentials-and-security.md) | Anything involving auth, keys, tokens, client data |
| 07 | [Self-hosted environments](07-self-hosted-environments.md) | Dev/prod instances, deploys, backups, updates |
| 08 | [Testing & QA](08-testing-and-qa.md) | Before anything goes live |
| 09 | [Project documentation standard](09-project-documentation-standard.md) | Writing or updating a project's docs |
| 10 | [Skills system](10-skills-system.md) | Using, adding, updating, or writing skills |
| 11 | [AI agent workflow](11-ai-agent-workflow.md) | An agent builds or edits workflows via API, optional MCP, or local JSON |
| 12 | [Roadmap](12-roadmap.md) | Planning what to build next: features planned for the workspace and the Control Center |

## Templates

Project visual format and agent CLI: [Project visuals](project-visuals.md).

Copy these instead of starting from a blank page. `scripts/new-project.mjs` copies the project
ones automatically.

| Template | Used for |
|---|---|
| [templates/project-README.md](templates/project-README.md) | A project's front page |
| [templates/project-AGENTS.md](templates/project-AGENTS.md) | Project-specific agent context |
| [templates/workflow-spec.md](templates/workflow-spec.md) | One spec per workflow, written **before** building |
| [templates/architecture.md](templates/architecture.md) | How a project's workflows and systems fit together |
| [templates/CHANGELOG.md](templates/CHANGELOG.md) | A project's change history |
| [templates/decision-log.md](templates/decision-log.md) | Why we chose X over Y |
| [templates/handover-sop.md](templates/handover-sop.md) | The client-facing operating guide |
| [templates/discovery-questions.md](templates/discovery-questions.md) | The first client call |

## Changing these docs

These docs are living. When a project teaches us something that should apply everywhere:

1. Update the relevant doc here (keep it short and actionable).
2. If agents need it at decision time, also capture it as a skill ([10-skills-system.md](10-skills-system.md)).
3. If it's a hard rule, add one line to the root [AGENTS.md](../AGENTS.md).
