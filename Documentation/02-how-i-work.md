# 02 — How I Work

The lifecycle every automation engagement follows, from first call to ongoing maintenance.
Each phase has an **exit gate**. Don't start the next phase until the gate is met.

> ✏️ **Personal details to fill in.** The sections marked `TODO(owner)` are yours to complete
> (rates, tools, communication style). Agents: never invent values for these. Ask.

```
1 DISCOVERY → 2 SCOPE → 3 DESIGN → 4 BUILD → 5 TEST → 6 DEPLOY → 7 HANDOVER → 8 MAINTAIN
     ↑___________________ change request loops back to 2 ___________________|
```

---

## 1. Discovery: understand the real problem

- Run the call with [templates/discovery-questions.md](templates/discovery-questions.md).
- Map the **current manual process** step by step: who does what, in which tool, how often, and
  what goes wrong.
- Collect: systems and accounts involved, data volumes, triggers (events or schedule), and edge cases.
- Identify **who owns each credential** on the client side.

**Exit gate:** the current process is written down, and the client agrees it's accurate.

## 2. Scope: agree on what gets built

- Write a **workflow-spec** per workflow ([templates/workflow-spec.md](templates/workflow-spec.md)):
  trigger, inputs, outputs, success criteria, error behavior, and what's out of scope.
- Estimate effort. Flag risks (rate limits, missing APIs, data quality).
- `TODO(owner)`: pricing model (fixed / hourly / retainer), deposit terms, revision rounds included.

**Exit gate:** the client has approved the specs in writing. A scope change after this point is a
change request (it loops back here).

## 3. Design: architecture before nodes

- Create the project: `scripts/new-project.ps1` or the `new-automation-project` skill.
- **Size it first** (`n8n-project-sizing` skill): estimate the node count for the whole project,
  then decide with the owner whether it's **one workflow or several**. Record the choice in
  `documentation/decisions.md`.
- Draw the architecture in `documentation/architecture.md`: which workflows exist, how they call
  each other (sub-workflows), which systems they touch, and where state lives (Data Tables or a DB).
- Apply [04-workflow-design-standards.md](04-workflow-design-standards.md): error handling plan,
  sub-workflow boundaries, idempotency.
- Record every non-obvious choice in `documentation/decisions.md`.

**Exit gate:** the size estimate and the one-vs-several decision are recorded, the architecture doc
and decisions exist, and every workflow has a spec.

## 4. Build: in the dev instance, never in prod

- Build in the **dev** n8n instance ([07-self-hosted-environments.md](07-self-hosted-environments.md)).
- AI-assisted builds follow [11-ai-agent-workflow.md](11-ai-agent-workflow.md).
- Commit early and often: export → sanitize → commit ([05-export-and-versioning.md](05-export-and-versioning.md)).

**Exit gate:** every workflow in the spec exists, passes validation, and is exported to `workflows/`.

## 5. Test: prove it works, including when it fails

- Run the [08-testing-and-qa.md](08-testing-and-qa.md) checklist: happy path, edge cases, failure
  paths, and the error workflow firing.
- Client UAT (user acceptance testing) with realistic data.

**Exit gate:** the QA checklist is fully ticked and the client has signed off UAT.

## 6. Deploy: controlled go-live

- Import the exported JSON into **prod**, bind the prod credentials, and set the error workflow.
- Activate during a window when you can watch the first executions.
- Tag the release in git: `<project-slug>/v1.0.0`.

**Exit gate:** the first real executions succeeded and were checked by hand.

## 7. Handover: the client can run it without me

- Run a project audit first (`n8n-project-audit` skill) and apply the approved fixes, so the client
  gets a clean, documented project.
- Generate `documentation/handover-sop.md` (`project-handover-docs` skill).
- Walk the client through it. Confirm who gets error alerts.
- `TODO(owner)`: handover format (Loom video? live call? PDF?), and the warranty period.

**Exit gate:** the client has confirmed the handover. The project registry status is `live`.

## 8. Maintain: keep it alive

- Watch the error workflow alerts. Review executions `TODO(owner): weekly / monthly?`.
- Every change, however small, goes through export → CHANGELOG → commit.
- Before n8n upgrades, test in dev first.
- Audit each live project now and then (`n8n-project-audit`). It's read-only and only suggests.
  Changes happen after the owner approves them.
- `TODO(owner)`: maintenance retainer terms, response-time commitments.

---

## Working principles

1. **Understand before building.** One clarifying question is cheaper than a rebuild.
2. **Boring and reliable beats clever.** Native nodes > HTTP Request > Code node.
3. **Fail loudly.** A silent failure is worse than a crash.
4. **The repo is the source of truth**, not the n8n instance. If it's not exported and committed, it doesn't exist.
5. **Document for the person after me**, who may be me in 6 months.
6. **Client data is sacred.** Least access, no real PII in the repo, and delete what we don't need.

## Communication

- `TODO(owner)`: channels (email / Slack / WhatsApp), update cadence, working hours, and time zone.
