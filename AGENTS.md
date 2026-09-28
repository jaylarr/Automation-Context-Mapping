# AGENTS.md — Automation Workspace

This is a workspace for building **n8n automations** for clients. "The owner" below is the person
who runs it. Owner-specific facts (their name, credential names, instance URLs, plan limits) live in
`AGENTS.local.md` (gitignored). Read it after this file if it exists. These rules apply to every
AI agent (Codex, Cursor, Claude Code, or others) that works here. A project folder can have its own
`AGENTS.md`. That file adds to this one, and it wins where the two conflict.

> Humans: the plain-language overview is [Documentation/00-start-here.md](Documentation/00-start-here.md).
>
> Read this file first. Then open the relevant doc in [Documentation/](Documentation/README.md)
> and the relevant skill from [Skills/INDEX.md](Skills/INDEX.md) **before** you act.

## 0. Start-of-task checklist (MANDATORY, every task, every agent)

Do these in order before your first action. "It's a quick change" is not an exception.

- [ ] **Scope:** identify the project (`n8n workflows/<slug>/`), read its `AGENTS.md`, then its
      `client-brief/` (the client's own request: `brief.md` + `files/`). The brief is **read-only**
      for agents. If there's no project yet and the task is client work, use the
      `new-automation-project` skill.
- [ ] **Skill:** open [Skills/INDEX.md](Skills/INDEX.md) and load `using-n8n-skills-official`, plus
      every skill whose trigger matches the task. Re-load a skill at the moment of decision; having
      read it earlier in the session doesn't count.
- [ ] **Size:** new project (or a feature adding ~10+ nodes)? Load `n8n-project-sizing`: estimate
      the node count, then **ask the owner** whether to build one workflow or several. No building
      until the owner answers.
- [ ] **Sections:** building a new workflow (or adding nodes)? Load `n8n-workflow-sections` and
      plan the sticky-note sections **before** writing any SDK code.
- [ ] **Spec:** the workflow has a spec in `documentation/spec/` (the short template is fine). No
      spec? Write it with the owner before building.
- [ ] **Instance:** before any n8n MCP call that writes or runs something, confirm which instance
      you're connected to (dev, never prod by accident). Single instance: a **published** workflow
      is prod, so ask before updating it ([07](Documentation/07-self-hosted-environments.md)).
- [ ] **Finish:** kept changes are exported (`n8n-workflow-export`), with CHANGELOG and docs updated in
      the same change, and committed in the project's own private repo once the owner OKs it.
      Report what's pending on the owner's side.

Claude Code also gets these injected automatically by hooks (`.claude/settings.json`). Codex and
other agents must follow them from this file.

## 1. Workspace map

| Path | What lives there |
|---|---|
| [`Documentation/`](Documentation/README.md) | Global rules and standards for **all** projects. The source of truth for how we work |
| [`Skills/`](Skills/INDEX.md) | Agent skills (`<name>/SKILL.md`): vendored official/community skills and our own custom ones |
| [`n8n workflows/`](n8n%20workflows/README.md) | One folder per **automation project**, plus a `_template/` to copy from |
| `n8n workflows/<project>/workflows/` | Importable n8n workflow JSON (`01-<name>.json`, `02-<name>.json` …) |
| `n8n workflows/<project>/website/` | Optional web app or site that belongs to the project |
| `n8n workflows/<project>/client-brief/` | What the client asked for, in their words (`brief.md` + `files/`). Written by the owner, often in the Control Center. Agents read it and never edit it |
| `n8n workflows/<project>/documentation/` | That project's spec, architecture, changelog, decisions, and handover (agent-maintained) |
| `scripts/` | Workspace helpers (`new-project.mjs`, `link-skills.mjs`) |
| [`app/`](app/README.md) | **Control Center**: local Next.js + SQLite dashboard (projects, n8n execution logs, event inbox, docs). Reads the folders above; never the source of truth |
| `.agents/skills` | A junction to `Skills/`, so Codex and Cursor auto-discover skills. Don't edit files through it |

Full details: [Documentation/01-workspace-structure.md](Documentation/01-workspace-structure.md).

## 2. Non-negotiables

1. **Load the matching skill before any n8n action.** Designing, configuring a node, writing an
   expression or Code, wiring errors, building an agent: look it up in
   [Skills/INDEX.md](Skills/INDEX.md) and read that `SKILL.md` first. n8n changes faster than
   training data. Trust the skills and the live MCP tools over memory.
2. **Secrets never go in text fields, workflow JSON, docs, or git.** Use the n8n credential system.
   If a secret is pasted in chat, tell the owner to rotate it.
   See [06-credentials-and-security.md](Documentation/06-credentials-and-security.md).
3. **Validate, verify, test, then publish.** Run `validate_workflow`, then `get_workflow_details`
   to check `connections`. Test with pinned data, and publish only after that. Ask before a test
   run that would fire real side effects. See [08-testing-and-qa.md](Documentation/08-testing-and-qa.md).
4. **Every workflow that ships is exported to the repo.** Save a sanitized, importable JSON in the
   project's `workflows/` folder and add a `CHANGELOG.md` entry. Use the `n8n-workflow-export`
   skill. See [05-export-and-versioning.md](Documentation/05-export-and-versioning.md).
5. **Docs are part of the deliverable.** When a workflow changes, update the project's
   `documentation/` in the same change. See
   [09-project-documentation-standard.md](Documentation/09-project-documentation-standard.md).
6. **Ask before acting outward.** Get the owner's explicit approval before publishing or activating
   workflows, running production executions, touching client systems, sending messages,
   committing, or pushing.

## 3. Conventions (short version)

- **Folders and files:** kebab-case, e.g. `n8n workflows/acme-lead-intake/workflows/01-intake-webhook.json`.
- **n8n workflow names:** sentence case, verb first, with a project prefix:
  `[acme-lead-intake] Qualify inbound lead`.
- **Node names:** say what the node does (`Fetch active customers`, not `HTTP Request1`).
- **Tags:** lowercase, 2–4 per workflow: the project slug + a type (`subworkflow`, `tool`, `error-handler`).
- **Canvas sections:** every workflow is laid out as numbered sticky-note sections
  (`## 01 — RECEIVE + FIND` → `## 02 — CHECK + PREPARE` …), with EXCEPTIONS / SETUP notes as
  needed, and every node inside a section. Skill: `n8n-workflow-sections`.
- **Code node is a last resort.** Try an expression first, then an Edit Fields arrow function, then Code (JavaScript).
- **Every production workflow has an error workflow set**, and every webhook API returns structured 4xx/5xx errors.

Full rules: [03-naming-conventions.md](Documentation/03-naming-conventions.md) ·
[04-workflow-design-standards.md](Documentation/04-workflow-design-standards.md)

## 4. How to do common tasks

| Task | Do this |
|---|---|
| Start a new automation project | `new-automation-project` skill (or `node scripts/new-project.mjs --name <kebab-name>`) |
| Size a project: one workflow or several? | `n8n-project-sizing` skill (estimate nodes, then ask the owner) |
| Build or edit a workflow via MCP | [11-ai-agent-workflow.md](Documentation/11-ai-agent-workflow.md) + `using-n8n-skills-official` |
| Save a workflow from n8n into the repo | `n8n-workflow-export` skill |
| Hand a project over to the client | `project-handover-docs` skill |
| Review or audit a project or workflow | `n8n-project-audit` skill (reads the project docs, uses the official `REVIEW_CHECKLIST.md`, asks before changing anything) |
| Self-hosted server work (deploy, backup, update) | `n8n-self-hosting` skill + [07-self-hosted-environments.md](Documentation/07-self-hosted-environments.md) |
| Capture a repeatable lesson as a skill | [10-skills-system.md](Documentation/10-skills-system.md) |
| Change the Control Center app | [app/README.md](app/README.md). Keep the palette/spacing tokens in `app/src/app/globals.css`; run `npm run typecheck` in `app/`, then `scripts/control-center.ps1 update` to rebuild and restart the running app |

## 5. Environment

- **n8n:** self-hosted. Each project records its instance(s) (dev/prod URL, n8n version) in its own
  `AGENTS.md`. Never assume which instance you're connected to. Check first.
- **MCP:** the official n8n instance-level MCP (`get_workflow_sdk_reference`, `search_nodes`,
  `get_node_types`, `validate_workflow`, `create_workflow_from_code`, `update_workflow`, …).
  Tool names drift between versions, so trust the live tool list.
- **OS:** Windows, macOS or Linux. Workspace scripts are Node (`node scripts/<name>.mjs`); the `.ps1`
  files are Windows wrappers. Paths contain spaces (`n8n workflows/`), so always quote them.
- **No n8n env vars / Variables:** not every n8n plan includes them, so never use `$env` or `$vars`
  in workflows. Put config in the workflow, a Data Table, or credentials.
- **The owner's own credentials** (internal work, even on HTTP Request nodes) are listed in
  `AGENTS.local.md`. Client projects use `<Client> <Service> <env>`.
