---
name: n8n-workflow-technical-audit
description: "Assess supplied n8n workflow JSON for correctness, reliability, security, portability, outdated configuration and over- or under-engineering. Propose evidence-linked fixes without modifying or executing originals."
---

# Static workflow quality assessment

Use with [audit intake](../n8n-workflow-audit-intake/SKILL.md). Apply
[the official review checklist](../n8n-workflow-lifecycle-official/references/REVIEW_CHECKLIST.md)
and load matching official skills for node semantics, expressions, loops, errors, AI or credentials
only when that part of the review needs them. Leave vendored skills and source files untouched.

## Checks

- Graph correctness: duplicate IDs/names, missing connection targets, unreachable branches,
  wrong output indices, disabled nodes, expression references and missing workflow dependencies.
- Data correctness: actual mappings, item pairing after merges, empty-result paths, array vs item
  assumptions, batching/loop completion, pagination, time zones, filtering and output contracts.
- Reliability: structured error paths, retries/backoff, limits/timeouts, idempotency/deduplication,
  persistence and silent failure. Do not equate continue-on-error with a handled failure.
- Security: hardcoded authentication, exposed webhook/form entry points, excessive data retention,
  pinned/static data, outbound destinations, prompt injection, unsafe tools/code and permissions.
  Redact values in reports; name the location/type of a secret rather than reproducing it.
- Portability: credential mappings, Data Table/schema assumptions, filesystem paths, instance IDs,
  models, community packages, external provider requirements and `$env`/`$vars` use. In an imported
  reference these are findings to discuss, not authorization to remove or rewrite them.
- Compatibility: node `typeVersion` is not the installed n8n version. When asserting deprecation
  or newer behavior, verify against version-specific official docs/source and name uncertainty.
  Do not use the owner's live instance as an implied test target for internet JSON.
- Complexity: redundant transforms/calls, repeated logic, unnecessary code, costly fan-out, and
  missing separation/safeguards. Explain retained behavior before recommending node reduction.
  Large workflows may be justified; small workflows may need more nodes for reliability.

## Findings

Every finding names source + node/parameter/connection + observed condition + consequence +
proposed change + effort/risk + verification needed. Rank true defects before polish.
Do not flag absent client documents/specs as errors in this optional-context project type.
Return a practical readiness verdict bounded by static evidence. Mock or live testing needs
separate scoped authorization; no workflow execution occurs during this audit.
