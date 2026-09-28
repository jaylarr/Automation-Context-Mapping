# Automation Workspace

A home base for building, versioning, and documenting **n8n automations** for clients.
It covers workflows, the web apps that go with them, the docs, and the agent skills that keep the
work consistent.

```
Automation Context Mapping/
├── AGENTS.md            ← rules every AI agent follows (CLAUDE.md just points here)
├── Documentation/       ← how we work: standards for ALL projects
├── Skills/              ← agent skills: vendored (official/community) + our own custom ones
├── n8n workflows/       ← one folder per automation project (+ _template/)
│   └── <project>/
│       ├── workflows/       importable n8n JSON
│       ├── website/         optional web app
│       └── documentation/   project docs
├── app/                 ← Control Center: local dashboard (Next.js + SQLite)
└── scripts/             ← new-project.mjs, init-project-repo.mjs, link-skills.mjs,
                           control-center.mjs (+ .ps1 on Windows), hooks/ (Claude Code guardrails)
```

## Requirements

- **Windows, macOS or Linux.** The scripts are Node (`scripts/*.mjs`); the `.ps1` files are Windows
  shortcuts to the same scripts
- **Node.js 20.9+** (Claude Code hooks, Control Center) and **git**
- A **self-hosted n8n** with the official **instance-level MCP** enabled (Settings → MCP), connected
  to your agent
- An AI coding agent: **Claude Code** (rules + skills + hooks), or Codex / Cursor (rules + skills)

## Quick start

**First time on a machine.** Link the skills. This is required for Claude Code, Codex and Cursor
alike, since the skill folders they read are links, not part of the repo:

```powershell
node scripts/link-skills.mjs
```

Then copy `AGENTS.local.example.md` to `AGENTS.local.md` and fill in your name, credential names,
and n8n URLs. Agents read it, and it never leaves your PC.

**Claude Code:** open the session in this folder and accept the project hooks when asked. They
inject the rules at session start, force a confirmation before publishing or production runs, and
remind the agent to export workflows it changed. If you also have n8n skills installed globally
(`~/.claude/skills`), disable duplicates of the ones in `Skills/`. Two routers confuse the agent.

The `Documentation/` files contain `TODO(owner)` markers (rates, instances, backup schedule).
They're yours to fill in; agents are told never to invent them.

**New automation project:**

```powershell
node scripts/new-project.mjs --name acme-lead-intake --client "Acme Co"
```

Or just ask your agent to *"start a new automation project for …"*. The `new-automation-project`
skill handles it.

**Control Center (local dashboard):**

```powershell
copy app\.env.example app\.env.local      # then fill in the values
node scripts/control-center.mjs install
```

It then runs in the background from every login at http://127.0.0.1:3100 (Windows: a login task;
macOS: a launchd agent; Linux: a systemd user service). Install it as an app
from Chrome/Edge for its own window. After code changes: `node scripts/control-center.mjs update`.
See [app/README.md](app/README.md).

## What stays local

The repo is public, so these are gitignored and never pushed:

- `n8n workflows/<project>/` (all client projects) and `n8n workflows/REGISTRY.md`
- `AGENTS.local.md` (your personal facts)
- `app/.env.local` and `app/data/` (the Control Center's database, logs, and tokens)

Instead, each project gets its **own private git repo** (`n8n workflows/<project>/.git`, created
by `new-project.mjs`; add one to an existing project with `node scripts/init-project-repo.mjs --name <slug>`).
It's local until you add a remote, and a remote must be a **private** repo.

## Where to read next

| If you want to… | Read |
|---|---|
| Understand the whole system | [Documentation/README.md](Documentation/README.md) |
| Know the rules agents follow | [AGENTS.md](AGENTS.md) |
| See which skill to use when | [Skills/INDEX.md](Skills/INDEX.md) |
| See all projects and their status | `n8n workflows/REGISTRY.md` (local-only), or the Control Center |

## License

[MIT](LICENSE) for this workspace. Vendored skills keep their own licenses (Apache-2.0 for the
official n8n-io skills, MIT for the community pack). See [Skills/_licenses/](Skills/_licenses/).
