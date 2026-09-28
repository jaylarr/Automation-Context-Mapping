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
└── scripts/             ← new-project.ps1, init-project-repo.ps1, link-skills.ps1,
                           control-center.ps1, hooks/ (Claude Code guardrails)
```

## Requirements

- **Windows** with Windows PowerShell 5.1+ (the scripts are PowerShell; macOS/Linux aren't supported yet)
- **Node.js 20.9+** (Claude Code hooks, Control Center) and **git**
- A **self-hosted n8n** with the official **instance-level MCP** enabled (Settings → MCP), connected
  to your agent
- An AI coding agent: **Claude Code** (rules + skills + hooks), or Codex / Cursor (rules + skills)

## Quick start

**First time on a machine.** Link the skills. This is required for Claude Code, Codex and Cursor
alike, since the skill folders they read are links, not part of the repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/link-skills.ps1
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
powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Name acme-lead-intake -Client "Acme Co"
```

Or just ask your agent to *"start a new automation project for …"*. The `new-automation-project`
skill handles it.

**Control Center (local dashboard):**

```powershell
copy app\.env.example app\.env.local      # then fill in the values
powershell -ExecutionPolicy Bypass -File scripts/control-center.ps1 install
```

It then runs in the background from every login at http://127.0.0.1:3100. Install it as an app
from Chrome/Edge for its own window. After code changes: `scripts/control-center.ps1 update`.
See [app/README.md](app/README.md).

## What stays local

The repo is public, so these are gitignored and never pushed:

- `n8n workflows/<project>/` (all client projects) and `n8n workflows/REGISTRY.md`
- `AGENTS.local.md` (your personal facts)
- `app/.env.local` and `app/data/` (the Control Center's database, logs, and tokens)

Instead, each project gets its **own private git repo** (`n8n workflows/<project>/.git`, created
by `new-project.ps1`; add one to an existing project with `scripts/init-project-repo.ps1 -Name <slug>`).
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
