# Existing workflow report structure

Use these sections, scaled to the workflow. Cover every source and available owner document.
Do not substitute generic advice for findings backed by JSON or document evidence.

## Summary and verdict

What it does, intended outcome, inferred users, whether to use/adapt/rebuild/set aside, and why.
Name the source files/hashes, context reviewed, extraction gaps, audit date and evidence limits.
Static review does not establish working credentials, uptime, correct provider responses or ROI.

## Workflow walkthrough

Triggers → inputs → branches and transformations → storage/API calls → outputs and side effects.
Explain AI models/tools, scheduled behavior, subworkflows and missing artifacts.

## English translation guide

Original label/text → English meaning → role → uncertainty. Keep semantic translation separate
from changes to execution strings. Credentials, IDs and field/API keys remain evidence as supplied.

## Dependency inventory

Node types and counts; external tools/services; databases/storage; HTTP endpoints and methods;
credential types; models; community nodes; referenced workflows; setup/cost drivers.
Record evidence location and confidence. Unknown dynamic endpoints stay unknown.

## Technical findings

Finding ID, severity, evidence, behavior/risk, exact proposed change, effort, verification needed.
Cover correctness, mapping/item handling, reliability, security, portability and complexity.
Distinguish explicit owner requirements from generic recommendations. Explain whether apparent
extra nodes are useful; do not reward reduced node count alone.

## Industry fit and reusable value

Rank plausible industries and concrete buyer problems. For each: current fit, needed adaptation,
reusable modules, data/privacy constraints, operating burden and plausible value.
Mark demand/value estimates as hypotheses rather than verified commercial traction.

## Commercial assessment

Separate technical readiness, product/service positioning, differentiation, support costs,
required providers, and rights/provenance. Assess template, implementation service and managed
service separately where appropriate. Verify original source/license when available; otherwise
resale permission is unknown. List unresolved conditions rather than granting permission.

## Recommendations and owner decision

F# fixes, I# improvements, T# translations, B# industry adaptations, R# rebuild/removal proposals.
Each includes scope, benefit, effort, risk and dependencies. Offer practical next actions and ask
which IDs are approved. Preserve originals; future approved copies are separate versions.
