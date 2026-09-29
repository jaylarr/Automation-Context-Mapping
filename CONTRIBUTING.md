# Contributing

Thanks for helping. This workspace is used for real client work, so changes favor being boring,
safe and well-documented over clever.

## Set up

```bash
git clone https://github.com/jaylarr/n8n-agent-workspace.git
cd n8n-agent-workspace
node scripts/setup.mjs --demo        # checks tools, links skills, local config, demo project
cd app && npm ci && npm run dev      # Control Center with hot reload at http://127.0.0.1:3100
```

Node 20.9+ (22 LTS recommended) and git. Works on Windows, macOS and Linux.

## Before you open a pull request

```bash
cd app
npm run typecheck
npm test
```

CI runs the same checks plus a production build and the workspace scripts on Ubuntu, macOS and
Windows.

## What goes where

| Change | Where | Notes |
|---|---|---|
| How projects are done (rules, standards) | `Documentation/`, one line in `AGENTS.md` if it's a hard rule | `AGENTS.md` is the only full copy of the agent rules; don't duplicate them in hooks |
| Agent know-how for a recurring task | `Skills/<name>/SKILL.md` + a row in `Skills/INDEX.md` | Guide: `Documentation/10-skills-system.md` |
| Vendored skills (`*-official`, community) | Don't edit in place | Update from upstream; see `Documentation/10-skills-system.md` |
| Workflow sanitizing / secret formats | `app/src/lib/sanitize-core.mjs` + its tests | One implementation for the app and the scripts |
| Control Center | `app/` | Keep the tokens in `app/src/app/globals.css`; see `app/README.md` |
| Scripts | `scripts/*.mjs` | Node, no dependencies, cross-platform. `.ps1` files are thin Windows wrappers |

## Rules of the road

- **No real client data or secrets**, anywhere: code, docs, tests, screenshots, examples. Use
  fictional data (see `examples/demo-lead-intake/`). Fake tokens in tests are built at runtime.
- **Docs change with the code.** A feature isn't done until `app/README.md`, the relevant
  `Documentation/` page and `Documentation/12-roadmap.md` (Done list) say so.
- **Plain language** in anything a client or non-technical owner might read.
- **Commit messages:** `<area>: <what changed>` (`workspace:`, `docs:`, `skills:`, `Control Center:`).
