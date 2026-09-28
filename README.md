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
└── scripts/             ← new-project.ps1, link-skills.ps1
```

## Quick start

**First time on a machine.** Link the skills so Codex and Cursor can discover them:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/link-skills.ps1
```

Then copy `AGENTS.local.example.md` to `AGENTS.local.md` and fill in your name, credential names,
and n8n URLs. Agents read it, and it never leaves your PC.

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

Back projects up in a private repo or drive.

## Where to read next

| If you want to… | Read |
|---|---|
| Understand the whole system | [Documentation/README.md](Documentation/README.md) |
| Know the rules agents follow | [AGENTS.md](AGENTS.md) |
| See which skill to use when | [Skills/INDEX.md](Skills/INDEX.md) |
| See all projects and their status | `n8n workflows/REGISTRY.md` (local-only), or the Control Center |
