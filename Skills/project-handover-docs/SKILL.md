---
name: project-handover-docs
description: Generate or refresh the client-facing handover and operating guide (handover-sop.md) plus the architecture doc for an automation project, from its workflow JSON files, specs, and AGENTS.md. Use when the user says "handover", "hand over to the client", "write the SOP", "operating guide", "client documentation", "document this project", "go-live docs", or when a project moves to status live.
---

# Project Handover Docs

Produces `documentation/handover-sop.md` (for the **client**) and refreshes
`documentation/architecture.md` (for **us**) from what's actually in the project. Standard:
`Documentation/09-project-documentation-standard.md`. Templates: `Documentation/templates/`.

## Non-negotiables

1. **Derive from the source, don't invent.** Triggers, schedules, webhook paths, systems, and error
   behavior come from the workflow JSON in `workflows/` and the specs. Anything you can't find
   (support contact, response time, warranty terms) becomes a visible `TODO` for the owner.
2. **No secrets, no internal-only details in the client doc.** Credential *names* and services are
   fine. IDs, tokens, internal notes, and pricing are not.
3. **Plain language in the SOP.** The reader is a non-technical client. Say "the automation",
   "the website form", "your CRM", not "webhook node", "Execute Workflow", "JSON".

## Procedure

1. **Read** the project `AGENTS.md`, `README.md`, every `documentation/spec/*.md`, and every
   `workflows/*.json`.
2. **Extract per workflow** (from the JSON):
   - Trigger: node type + parameters (webhook `path` + `httpMethod`, schedule rule + timezone from
     `settings.timezone`, app trigger event)
   - External systems touched: node types + credential **names**
   - Error behavior: `settings.errorWorkflow`, nodes with `onError`, `retryOnFail`
   - Sub-workflow calls (`executeWorkflow` nodes) → the call graph
3. **Refresh `architecture.md`:** the workflows table, the Mermaid diagram of the call graph and
   external systems, the state/storage table (Data Tables used), and the known limits from the
   specs.
4. **Write `handover-sop.md`** from `Documentation/templates/handover-sop.md`:
   - "How it starts": one row per client-visible automation (skip the internal sub-workflows and
     the error handler)
   - "When something goes wrong": use the error behavior and alert destination from AGENTS.md
   - "Accounts and access": one row per external service/credential, with the owner
   - Version = the latest CHANGELOG release. Date = today (absolute date)
5. **List the TODOs** you couldn't fill, and ask the owner for them in one message.
6. **Offer next steps:** README status → `live`, a CHANGELOG release entry, and a git tag
   `<slug>/vX.Y.Z` (don't commit or tag without being asked).

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Copying node names/jargon into the SOP | The client can't use it | Translate to business terms |
| Guessing the schedule or timezone | The client expects runs at the wrong time | Read the trigger + `settings.timezone`; else TODO |
| Documenting the error handler and sub-workflows as "automations" | Confuses the client | Internal plumbing goes in architecture.md only |
| Writing the SOP once and never again | The doc drifts from reality | Re-run this skill on every MINOR/MAJOR release |
