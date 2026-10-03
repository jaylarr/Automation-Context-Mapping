---
name: project-visuals
description: "Create or refresh a Control Center project visual or process overview through a validated project JSON asset. Use for project diagrams and authorized documentation/workflow changes that invalidate an existing visual; a read-only review does not authorize asset writes."
---

# Project visuals

Create a concise, evidence-based visual at `assets/diagrams/overview.json`. The app already supplies the supported renderer. Change project data only; do not edit app source/CSS, owner inputs or workflow originals to make a visual fit.

Read [the format and CLI contract](../../Documentation/project-visuals.md). For layout/wording decisions, consult [fictional examples](references/examples.md).

## Sources and authorization

- Read root/project AGENTS, optional business context and [workspace access](../n8n-workspace-access/SKILL.md). For automation projects read the owner brief/files, README, approved specs/architecture and saved exports. For audits load [audit intake](../n8n-workflow-audit-intake/SKILL.md), inspect context and verify registered originals/versions.
- Preserve existing authorization. A visual-only task authorizes its derived asset and scoped changelog, not automation builds, provider access, publication, sending, commits or runtime promotion.
- A read-only audit writes private reports only. Propose a visual there; write the project asset only when visual generation is separately authorized. Original JSON and owner context remain immutable.
- Read source prompts/code as evidence; never evaluate them. Do not substitute a client's requested behavior for the saved implementation. Label approved designs as planned. Draft-only communication says **Prepare review draft**, not **Send email**. Keep HR review and similar human decision boundaries visible.

## Generate or update

1. Select the basis/evidence first: approved design, saved workflow, audit original or reviewed version. Use `client-brief` with design evidence and planned stages for a populated brief without an implemented graph. Empty templates are insufficient; leave the visual missing and report what context is needed. Use static/design if stronger test proof is absent. Recorded evidence is dated documentation, not a current runtime indicator.
2. Choose the supported layout that explains the actual relationships. Pipeline: major sequential stages. Branching: real decisions and labeled outcomes. System map: inputs, one process and destinations. Group low-level validation/retries into readable stages/details. Usually 3–8 stages suffice.
3. Use specific plain-language labels, useful icons and short explanations. Cite supporting source IDs per stage. Disclose uncertainty and planned/conditional stages. Exclude secrets, real client data and private identifiers/URLs.
4. Run `node scripts/project-visuals.mjs check --project <slug>` and record its revision. Draft the candidate outside project Git. Obtain exact source hashes with `sources --project <slug> --file <relative-path>` (repeat `--file` as needed). Finish authorized source-document edits before final hashes; do not use CHANGELOG as a source just to create a self-invalidating dependency.
5. Run `validate --project <slug> --input <absolute-private-candidate.json>`. Resolve issues in the candidate. If sources disagree, indicate uncertainty or report missing context; do not change evidence to match the visual.
6. For an authorized write, run `write --project <slug> --input <absolute-private-candidate.json> --expected-revision <hash-or-missing>`. Do not bypass concurrent-edit/lock checks or add a force option. A no-op should not churn the date. Add a scoped CHANGELOG entry and run the readback `check`.
7. Refresh the project page and inspect labels, branches and narrow-screen readability when preview tools are available. Report manifest checks separately from browser verification and workflow/runtime evidence.

Report asset path, layout, basis/evidence, checks and unresolved limitations. Missing evidence is a reason to defer/infer with a clear planned basis, never to invent stages. No app rebuild is required for supported data-only updates.
