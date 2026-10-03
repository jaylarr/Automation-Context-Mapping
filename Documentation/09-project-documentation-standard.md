# 09 — Project Documentation Standard

Every project in `n8n workflows/<project>/` has the same doc set, so anyone (or any agent) can open
any project and find things in the same place.

## Required files

| File | Audience | Contents | Template |
|---|---|---|---|
| `client-brief/brief.md` (+ `files/`) | Us + agents | The client's request **in their own words**: what they asked for, today's process, the goal, systems, constraints, dated scope updates. **Written by the owner only** (Control Center or an editor). Agents read it first and never edit it | [client-brief.md](templates/client-brief.md) |
| `README.md` | Anyone | What the project does, status, workflows table, how to run and test it, links | [project-README.md](templates/project-README.md) |
| `AGENTS.md` | AI agents | Client, instances, credential names, workflow IDs, constraints, project-specific exceptions | [project-AGENTS.md](templates/project-AGENTS.md) |
| `documentation/spec/NN-<slug>.md` | Us + client | One per workflow: trigger, inputs, outputs, logic, errors, test cases. **Written before building** | [workflow-spec.md](templates/workflow-spec.md) |
| `documentation/architecture.md` | Us | How the workflows, sub-workflows, external systems, and state fit together (with a diagram) | [architecture.md](templates/architecture.md) |
| `documentation/CHANGELOG.md` | Us + client | Every change, versioned | [CHANGELOG.md](templates/CHANGELOG.md) |
| `documentation/decisions.md` | Us | Why we chose X over Y (short ADR-style entries) | [decision-log.md](templates/decision-log.md) |
| `documentation/handover-sop.md` | **Client** | How to operate it: triggers, what to watch, what to do when it fails, who to call | [handover-sop.md](templates/handover-sop.md) |

Optional: `documentation/meeting-notes/YYYY-MM-DD-<topic>.md`,
`documentation/discovery.md`, and `assets/diagrams/`.

`assets/diagrams/overview.json` is an optional agent-maintained project visual, displayed by Control Center. Follow [Project visuals](project-visuals.md) and the matching skill. Update it when an authorized project change alters its meaning; owner briefs/context and audit originals remain read-only. A read-only audit may propose a visual privately, but writing the derived asset needs separate authorization.

## When docs must be updated

| Event | Update |
|---|---|
| Project kickoff | `client-brief/` (owner), README (status `discovery`), AGENTS.md, discovery notes |
| Client changes the scope | A dated entry under "Updates from the client" in `client-brief/brief.md` (owner), then the affected specs |
| Spec approved | `spec/NN-*.md` per workflow; README status `scoped` |
| Architecture decided | `architecture.md`, `decisions.md` |
| Any workflow change | Exported JSON + `CHANGELOG.md` + the affected spec (**same commit**) |
| Go-live | README status `live`, `handover-sop.md`, a registry row in `n8n workflows/REGISTRY.md` |
| Instance or credential change | Project `AGENTS.md` |

## Writing style

- **Short and scannable.** Tables and bullets over paragraphs. Nobody reads walls of text.
- **Explain the *why*.** The *what* is visible in the workflow, the *why* isn't.
- **Client-facing docs** (handover-sop) avoid n8n jargon: "the automation", "the lead form",
  not "the webhook node".
- **Diagrams:** Mermaid in markdown (renders on GitHub and in most editors):

  ```mermaid
  flowchart LR
    Form[Website form] -->|POST| WH[01 Intake webhook]
    WH --> SUB[sub: Enrich company]
    WH --> CRM[(HubSpot)]
    WH -.error.-> ERR[00 Error handler] --> Slack
  ```

- **Dates** are absolute (`2026-09-27`), never "last week".
- **No secrets, no real PII.** Refer to credentials by name only.

## Project status values

Used in the project README and the registry:
`discovery` → `scoped` → `building` → `testing` → `live` → `maintenance` → `archived`
(plus `paused`).
