# Audit report template

Save as `YYYY-MM-DD-<project-slug>-audit.md` in the external private history configured in
`AGENTS.local.md`, and update its index. Never commit the report or link it from public docs.
Use plain language in the summary. Put the technical evidence in the suggestions.
No secrets and no real client data in the report.

```markdown
# Audit — <project name> — YYYY-MM-DD

**Scope:** whole project | <workflow names>
**Instance:** dev | prod (<url>) · read-only
**Sources read:** AGENTS.md, README.md, spec/01-…, architecture.md, decisions.md, CHANGELOG.md,
workflows/*.json, <N> live workflows, executions since YYYY-MM-DD
**Access/evidence:** API | official MCP | local JSON; installed version/capabilities checked;
live read-back time; local/mock/live tests inspected; unavailable checks and history coverage gaps

## Summary

**Health:** 🟢 good | 🟡 needs attention | 🔴 action needed. One or two sentences on why.

| Workflow | Status | Runs (30 d) | Errors | Suggestions |
|---|---|---|---|---|
| `[slug] Qualify inbound lead` | active | 412 | 1.2% | F1, I2, P1 |
| `[slug] TEMP test sender` | inactive | 0 | — | R1 |

## Suggestions

### Fix
**F1 — <short title>** · effort S · risk low · status: proposed
- **What:** <exact change>
- **Why:** <evidence in JSON terms> — breaks <doc / standard>
- **Where:** `<workflow>` → `<node>`

### Improve
**I1 — …**

### Docs
**D1 — …**

### Polish
**P1 — …**

### Remove
**R1 — Archive `[slug] TEMP test sender`** · effort S · risk low · status: proposed
- **Why:** test workflow, inactive, 0 runs in 30 days, not in README/spec.
- **Checked:** no Execute Workflow callers, not an error workflow, no webhook traffic.
- **Lost if archived:** nothing (no own Data Tables). Restorable from n8n archive + `workflows/_archive/`.

## Not findings (context)

- <Deviation explained in decisions.md, and why it's fine>

## Approval log

| ID | Decision | Date | Notes |
|---|---|---|---|
| F1 | applied | YYYY-MM-DD | exported, CHANGELOG updated |
| R1 | declined | YYYY-MM-DD | keep for demo |
```
