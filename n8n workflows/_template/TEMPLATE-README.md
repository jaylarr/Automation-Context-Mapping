# _template — project skeleton

This is the folder skeleton for every new automation project. **Don't edit or build here.**

Create a project with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Name <client>-<purpose> -Client "<Client name>"
```

or ask your agent to use the `new-automation-project` skill.

The script copies this skeleton, then generates `README.md`, `AGENTS.md`, and
`documentation/*.md` and `client-brief/brief.md` from `Documentation/templates/`, which is the single source for all doc
templates. To change what new projects get, edit those templates, not this folder.

```
<project>/
├── AGENTS.md                  (generated)
├── README.md                  (generated)
├── client-brief/              the client's request (owner writes, agents read only)
│   ├── brief.md               (generated from templates/client-brief.md)
│   └── files/                 what the client sent: emails, PDFs, screenshots
├── workflows/                 importable n8n JSON: 00-error-handler.json, 01-<slug>.json, …
│   └── _archive/              retired workflows (numbers are never reused)
├── website/                   optional web app (delete it if unused: -NoWebsite)
├── documentation/
│   ├── spec/                  one spec per workflow (from templates/workflow-spec.md)
│   ├── architecture.md        (generated)
│   ├── CHANGELOG.md           (generated)
│   ├── decisions.md           (generated)
│   └── handover-sop.md        (generated)
└── assets/samples/            FAKE sample payloads / pin data only
```
