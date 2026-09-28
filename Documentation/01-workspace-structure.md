# 01 — Workspace Structure

## The full map

```
Automation Context Mapping/                 ← MAIN FOLDER (git repo)
├── AGENTS.md                               ← agent rules (auto-read by Codex/Cursor/etc.)
├── CLAUDE.md                               ← "@AGENTS.md" so Claude Code reads the same rules
├── README.md
├── .gitignore
├── .agents/skills  → Skills/               ← junction (gitignored), made by scripts/link-skills.mjs
├── app/                                    ← Control Center (local Next.js + SQLite dashboard)
│   └── data/                               ← SQLite file (gitignored)
├── scripts/
│   ├── new-project.mjs                     ← scaffold a project from _template
│   └── link-skills.mjs                     ← (re)create the .agents/skills junction
├── Documentation/                          ← GLOBAL docs (this folder)
│   └── templates/
├── Skills/
│   ├── INDEX.md                            ← which skill for which task
│   ├── _licenses/                          ← licenses of vendored packs
│   └── <skill-name>/SKILL.md (+ SOURCE.md if vendored)
└── n8n workflows/
    ├── README.md                           ← explainer (public)
    ├── REGISTRY.md                         ← project registry (local-only, gitignored)
    ├── _template/                          ← copied for every new project
    └── <project-slug>/                     ← ONE folder per automation project
        ├── AGENTS.md                       ← project-specific agent context
        ├── README.md                       ← project front page
        ├── client-brief/                   ← the client's request, written by the owner (agents: read-only)
        │   ├── brief.md                    ← their words: what they asked for, today's process, goal
        │   └── files/                      ← what they sent: emails, PDFs, screenshots, example sheets
        ├── workflows/                      ← importable n8n JSON only
        │   ├── 01-<workflow-slug>.json
        │   ├── 02-<workflow-slug>.json
        │   └── subworkflows/               ← optional, when there are many
        ├── website/                        ← optional: web app/site for this project
        ├── documentation/
        │   ├── spec/                       ← one spec per workflow
        │   ├── architecture.md
        │   ├── CHANGELOG.md
        │   ├── decisions.md
        │   └── handover-sop.md
        ├── test-results/                   ← one folder per test run: result.md + screenshots/outputs
        └── assets/                         ← optional: diagrams, sample payloads (no real client PII)
```

## What goes where: decision rules

| You have… | Put it in… |
|---|---|
| A rule that applies to every project | `Documentation/` (+ one line in root `AGENTS.md` if it's a hard rule) |
| What the client asked for (their brief, emails, PDFs, screenshots) | `n8n workflows/<project>/client-brief/` (`brief.md` + `files/`). The owner writes it, in the Control Center or an editor. Agents read it and never edit it. Too sensitive for git? Put it in `files/private/` (gitignored) |
| A fact about one project (client, instance URL, credentials used) | `n8n workflows/<project>/AGENTS.md` |
| A workflow exported from n8n | `n8n workflows/<project>/workflows/NN-<slug>.json` |
| A sub-workflow shared by **several projects** | The project that owns it, noted in the other projects' `architecture.md`. If it becomes truly generic, create a `n8n workflows/shared-utilities/` project |
| Frontend/backend code that belongs to a project | `n8n workflows/<project>/website/` (it can have its own `package.json`, `README.md`, `AGENTS.md`) |
| Sample webhook payloads / test fixtures | `n8n workflows/<project>/assets/samples/`, with **fake or anonymized data only** |
| A reusable procedure agents should follow | `Skills/<skill-name>/SKILL.md` |
| Logs, execution history, app settings | The Control Center's local SQLite (`app/data/`), never the repo |
| Scratch files, raw exports, secrets | **Nowhere in this repo.** Raw exports are `*.raw.json` and gitignored |

## Nested AGENTS.md

Agents read the `AGENTS.md` closest to the file they're working on, plus the ones above it:

```
AGENTS.md                                   ← global rules
└── n8n workflows/acme-lead-intake/AGENTS.md    ← adds: client, instances, credentials, constraints
    └── website/AGENTS.md                   ← (optional) adds: stack, build/run commands
```

A lower file **adds to** or **overrides** a higher one for its folder. Keep project files short:
facts and exceptions only. Don't repeat the global rules there.

## Why `.agents/skills` is a junction

Codex, Cursor, and other agents that follow the Agent Skills standard auto-discover skills at
`.agents/skills/<name>/SKILL.md`. We keep the real files in the human-friendly `Skills/` folder.
`.agents/skills` is a Windows directory junction pointing at it. That gives one copy of the files
and two paths to reach them. The junction is gitignored, so after cloning run:

```powershell
node scripts/link-skills.mjs
```
