---
name: new-automation-project
description: Scaffold a new client automation project in this workspace with the standard folder layout, AGENTS.md, README, and documentation set, and register it in the project registry. Use when the user says "new project", "start a project for <client>", "set up a new automation", "create the project folder", "kick off <client>", or before building the first workflow for a client that has no folder under "n8n workflows/" yet.
---

# New Automation Project

Creates `n8n workflows/<slug>/` from the workspace template, so every project starts with the same
structure and docs. Workspace rules: root `AGENTS.md`, `Documentation/01-workspace-structure.md`,
and `Documentation/03-naming-conventions.md`.

## Non-negotiables

1. **Agree on the slug before creating anything.** Format `<client>-<purpose>`, kebab-case,
   max 40 chars (`acme-lead-intake`, `internal-invoice-reminders`). The slug is used in folder
   names, n8n workflow names, tags, webhook paths, Data Tables, and git tags. It can't be renamed
   cheaply later.
2. **Use the script.** Don't hand-copy files. The script fills placeholders and updates the registry
   consistently.
3. **Never invent client facts.** Instance URLs, credential names, and contacts that the owner hasn't
   given stay as `TODO`.

## Procedure

1. **Gather** (ask only for what's missing):
   - Client name and a one-line purpose
   - Proposed slug. Suggest one and confirm it
   - Does it need a `website/`? (default: keep the folder. Pass `-NoWebsite` if clearly not needed)
2. **Check it doesn't exist:** list `n8n workflows/` and read `n8n workflows/REGISTRY.md` (local-only; may not exist yet).
3. **Dry run first** and show the owner the output:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Name <slug> -Client "<Client>" -Purpose "<one line>" -DryRun
   ```
4. **Create** by running the same command without `-DryRun`.
5. **Fill in** the new `AGENTS.md` with whatever is known (instances, credential names,
   constraints, alert destination). Leave unknowns as `TODO`.
6. **Discovery:** if a client call is next, point the owner to
   `Documentation/templates/discovery-questions.md`, and offer to turn the answers into
   `documentation/discovery.md`, then the specs in `documentation/spec/`.
7. **n8n side:** suggest creating the n8n folder named `<slug>` in the dev instance, and the
   project's `00-error-handler` workflow (Error Trigger → alert) **before** other workflows,
   because every production workflow points at it.
8. **Size before building:** once the brief/spec is clear, run the `n8n-project-sizing` skill.
   Estimate the node count and ask the owner whether to build one workflow or several. Don't build
   before the answer.
9. **Report:** the created path, what's still `TODO`, and the next step (discovery, spec, or sizing).

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Slug with spaces or capitals (`Acme Lead Intake`) | Breaks webhook paths, tags, and CLI use | kebab-case only |
| Creating the folder by hand | Missing docs; registry out of sync | Use `scripts/new-project.ps1` |
| Building workflows before the spec | Rework; scope creep | Discovery → spec → build (`Documentation/02-how-i-work.md`) |
| Putting instance URLs or credential names in the global AGENTS.md | Project facts leak into every project | They go in the project's `AGENTS.md` |
