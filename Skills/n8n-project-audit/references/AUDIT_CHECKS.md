# Audit checks (Phase 2)

Project-level checks on top of the official per-workflow `REVIEW_CHECKLIST.md`. Each hit becomes a
suggestion (`F`/`I`/`P`/`D`/`R`) with evidence.

## 1. Per-workflow review (official)

Walk `Skills/n8n-workflow-lifecycle-official/references/REVIEW_CHECKLIST.md` for every workflow in
scope. Map its tiers: MUST FIX → `F`, SHOULD FIX → `I`, NICE TO HAVE → `P`.

## 2. Workspace standards

| Check | Standard | Typical ID |
|---|---|---|
| Hardcoded secret in a parameter, header, Code, URL, or sticky | `06-credentials-and-security.md` | F |
| `$env` or `$vars` used anywhere | AGENTS.md §5 (the plan has no env vars) | F |
| Production workflow without `settings.errorWorkflow` | `04-workflow-design-standards.md` | F (active) / I |
| Webhook API without structured 4xx/5xx responses | `04` + `n8n-error-handling-official` | I |
| Credential names don't follow `<Client> <Service> <env>` (or the owner's own names on internal work) | `03-naming-conventions.md` | P |
| Workflow name not `[slug] Verb object`; tags missing or not 2–4 lowercase | `03-naming-conventions.md` | P |
| Default node names (`HTTP Request1`, `If`, `Code`) | `03-naming-conventions.md` | P |
| No sticky-note sections, a node outside a section, stale section text, wrong palette | `n8n-workflow-sections` | P |
| Code node doing what an expression or Edit Fields could do | `n8n-code-nodes-official` | I / P |
| Missing workflow `description` (what + why) | `n8n-workflow-lifecycle-official` | P |

## 3. Docs vs reality

| Check | How | Typical ID |
|---|---|---|
| Spec says X, workflow does Y (trigger, outputs, error behavior, out-of-scope items built) | spec vs `get_workflow_details` | F if the behavior is wrong, D if the spec is outdated. **Ask which is true** |
| Repo export differs from live (drift) | compare the repo JSON nodes/connections/parameters with live (ignore stripped fields: pinData, meta, versionId, active, timestamps) | D |
| Live workflow with no export in `workflows/` | list vs repo | D |
| README workflows table / project AGENTS IDs wrong, missing, or `TODO` | tables vs live IDs | D |
| CHANGELOG has no entry for changes visible in the live version history | `get_workflow_details` updatedAt vs the last CHANGELOG date | D |
| `architecture.md` missing, or doesn't show how the workflows connect | doc vs the Execute Workflow / webhook links found | D |
| A decision in `decisions.md` that the workflow no longer follows | decisions vs live | F / D, ask |

## 4. Health from executions (last ~30 days)

| Signal | Typical ID |
|---|---|
| Error rate > ~5%, or the same node failing repeatedly | F / I, with the failing node and error message |
| Retries hiding a flaky dependency (success only after retries) | I |
| Very slow runs vs the others (timeouts, large payloads) | I |
| Active workflow with zero runs when the spec expects regular runs | F (a trigger may be broken) / R (no longer used), ask |

## 5. Is it still needed? (removal and simplification)

| Signal | Typical ID |
|---|---|
| `TEMP`, `test`, `copy`, `old`, `v2` in the name | R |
| Inactive, no executions in 30+ days, not referenced by any doc as current | R |
| Two workflows doing the same job (same trigger + near-identical nodes) | R (keep one) or I (merge) |
| Sub-workflow nobody calls (no `Execute Workflow` referencing its ID) | R |
| Superseded by a newer workflow (CHANGELOG/decisions says so) | R |
| Disabled nodes, dead branches (outputs never connected, IF branches that can't happen), unused Set fields | I |
| Several nodes that one node can replace | I / P |
| One workflow past ~45 nodes, or several tiny workflows that are always used together | I (split or merge, see `n8n-project-sizing`) |

Always run the **Removal checks** in SKILL.md before proposing an `R`.
