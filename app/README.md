# Control Center

A local web app for this automation workspace. It shows projects and their workflows, syncs n8n
execution logs, receives events from workflows, keeps an activity log, and renders the docs and
skills. Everything runs on your machine, and data goes into a local **SQLite** file. There's no
cloud database.

| Page | What it does |
|---|---|
| **Overview** | Key numbers, executions per day (success vs failed), recent failures, events, activity |
| **Projects** | Reads `n8n workflows/<slug>/` live (the folders are the source of truth). Create a project (runs `scripts/new-project.mjs`, optionally with the client's brief and files), change its status and **Edit details** (name, purpose, client, version, started: updates the top of the README and the registry; the rest of the README is left to agents), browse its workflows and docs. Each project has a **Client brief** card: edit `client-brief/brief.md` in place, and add, open, or remove the client's files in `client-brief/files/` (drag and drop, up to 25 MB each). **Start an agent** gives a prompt to paste into Claude Code or Codex so it starts with the project's full context. Each card shows its **backup state** (see Backups below) |
| **Workflows** | Lists every n8n workflow as New / Changed in n8n / Up to date versus the backups in project folders. Import or update them one by one or in bulk (with confirmation): sanitized JSON goes into `n8n workflows/<project>/workflows/`, plus a changelog entry. Auto-matches projects by `[slug]` name or tag; hardcoded secrets are refused. The **⚙ button** on each row opens that workflow's settings (below). The **Needs attention** tab lists alerts and published workflows without an error workflow. Sort (latest / oldest edited, name) and filter by published and imported. The **In n8n** badge on each row shows Published / Not published; click it to publish or unpublish (always confirmed). The list is cached (see below), so the page opens instantly; **Refresh** re-reads n8n |
| **Logs** | Three logs, each with search, filters, pagination, and a **Live** auto-refresh: n8n executions, the event inbox, app activity |
| **Docs & skills** | `AGENTS.md`, `Documentation/`, templates, and every skill, rendered with search |
| **Settings** | **n8n instances** (add/edit/test/sync/remove any number of n8n servers; keys go to `.env.local` as `N8N_API_KEY__<ID>`), auto-sync interval, log retention, event-inbox token, **Backups** (scheduled auto-export, optional auto-commit), **Recently deleted** projects (restore within 30 days), app maintenance, DB info |

## Run it

### As a regular app (recommended)

From the workspace root, run once (any OS):

```bash
node scripts/control-center.mjs install
```

This builds the optimized production version and registers it to start in the background every time
you log in:

| OS | How it runs | Commands |
|---|---|---|
| Windows | Login task "Automation Control Center" with a supervisor (`control-center.mjs` hands over to `control-center.ps1`) | `install` `update` `start` `stop` `restart` `status` `logs` `open` `uninstall` |
| macOS | launchd agent `~/Library/LaunchAgents/com.automation-workspace.control-center.plist` (restarts on crash) | same |
| Linux | systemd user service `automation-control-center.service` (restarts on crash). Run `loginctl enable-linger $USER` once to keep it running while logged out | same |

It's always at **http://127.0.0.1:3100**, with no terminal window and no `npm run dev`. On macOS
and Linux, `update` also builds alongside the running version and rolls back if the new one
doesn't start. The in-app **Restart / Update** buttons below are Windows-only for now; on macOS and
Linux use the terminal commands.

**App window:** open http://127.0.0.1:3100 in Chrome or Edge and click **Install** in the address
bar (or ⋮ → Cast, save and share → Install page as app). You get its own window with a taskbar and
Start-menu icon. Right-click the icon for shortcuts to Logs, Projects, and New project.

**Restart / update without a terminal:** Settings → **App maintenance**.
- **Restart**: about 5 seconds offline, and the page reloads by itself.
- **Update & rebuild**: after code changes. The new version builds while the current one keeps
  running, then swaps in (about 5 seconds offline). A failed build changes nothing, and a new version
  that doesn't start is rolled back automatically.

Both ask for confirmation first. Their output is in the **Maintenance log** on the same card.

The same actions from a terminal (use the full path if you're not in the workspace folder):

| Command (`node scripts/control-center.mjs <action>`) | Does |
|---|---|
| `status` | Is the login task registered, and is the server up? |
| `update` | After code changes or a `git pull`: build alongside, swap, auto-rollback on failure |
| `restart` / `stop` / `start` | Control the background server |
| `logs` | Last 60 lines of `app/data/server.log` |
| `open` | Open the app in your browser |
| `uninstall` | Remove the login task (app files and data are kept) |

The task runs as you (no admin) and has no time limit. It runs a small supervisor that restarts the
server if it exits, with crash-loop protection (it stops after 5 quick failures in a row).

### For development

```powershell
cd app
npm install
npm run dev      # http://127.0.0.1:3100 with hot reload. Stop the background app first (control-center.ps1 stop)
```

> `better-sqlite3` is a native module. If `npm install` reports blocked install scripts and the app
> can't open the database, run `npm approve-scripts better-sqlite3` and reinstall.

## Configuration

**Do it in the app: Settings page.** You don't need to edit any file:

- **n8n instances:** **Add instance** with a name, URL and API key, then **Add & test**. It's live immediately
  with no restart. Connect as many as you like (local, VPS, client servers). With 2+, the sidebar's
  **Showing** switcher filters Overview, Logs and Workflows. Saved keys are never shown again.
- **Webhook event inbox:** **Copy token** puts the inbox token on your clipboard for the n8n credential.
  **Regenerate** makes a new one (then update the n8n credential).

Behind the scenes these are written to `app/.env.local` (gitignored), never to the database. You
can also edit that file by hand:

| Variable | Needed for | Notes |
|---|---|---|
| `N8N_BASE_URL` | Execution sync | e.g. `https://n8n.example.com`, no trailing slash |
| `N8N_API_KEY` | Execution sync | n8n → Settings → n8n API. The app **reads** workflows and executions. Its only writes are **publish / unpublish** (always confirmed), which need the `workflow:activate` / `workflow:deactivate` scopes |
| `INGEST_TOKEN` | Event inbox | A random secret: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `WORKSPACE_ROOT` | optional | Defaults to the folder above `app/` |
| `DATABASE_PATH` | optional | Defaults to `app/data/control-center.db` |
| `CONTROL_CENTER_HOSTS` | optional | Extra host names the app answers to, comma-separated (see Host lock below) |

Secrets live only in `.env.local`, never in the database, and the app never sends a saved key back to
the browser. Non-secret settings (sync interval, retention) are stored in the local database.

## Sending events from n8n

Add an **HTTP Request** node:

- `POST http://<this-machine>:3100/api/events`
- Auth: a **Header Auth** credential with name `x-ingest-token` and value = `INGEST_TOKEN`
- JSON body: `{ "level": "success", "project": "<slug>", "workflow": "<name>", "message": "…", "data": { … } }`

`level` is one of `info`, `success`, `warn`, `error`. Responses: `201` created, `400` invalid input,
`401` bad token, `413` body over 64 KB. The endpoint is write-only.

The app listens on `127.0.0.1`, so only this machine can reach it. If n8n runs elsewhere, start it
with `-H 0.0.0.0` (edit `package.json`) or put a tunnel in front. The token keeps protecting the
endpoint.

**Host lock.** The app has no login, so it only answers requests addressed to `127.0.0.1`,
`localhost`, `[::1]` or `host.docker.internal` (`src/proxy.ts`). Anything else gets `421`. This
stops a web page on another domain from re-pointing its own name at your PC (DNS rebinding) and
driving the app from your browser. Reaching it under another name (a tunnel, a LAN hostname)? Add
that name to `CONTROL_CENTER_HOSTS` in `.env.local` and restart.

## Backups (git)

Every project has its own private git repo (`n8n workflows/<slug>/.git`). The app never pushes:
sending history to a remote stays a manual step.

- **Backup chip** on each project card: `no git`, `not committed`, `N changed`, `no remote`,
  `N unpushed` or `backed up`. Hover it for the details.
- **Backup card** on the project page: **Commit N changes…** lists the changed files and suggests a
  message. If a workflow JSON changed but the CHANGELOG didn't, it asks for a changelog line and adds
  it under [Unreleased] in the same commit. Every file is checked for secrets first (API keys, bearer
  and bot tokens, JWTs, private keys…); one hit and nothing is committed. **Set up git** creates the
  repo when a project has none. Without a remote, the card shows the commands to add a **private** one.
- **New projects** created in the app get a first commit right away.
- **Settings → Backups:** export workflows that changed in n8n every N hours (0 = off), with an
  optional auto-commit of just those files. Only workflows already saved in a project are updated;
  new workflows still go through Import. **Export changed workflows now** runs it once.

## Restore to n8n

On a project page, the **⤒** button on each workflow row sends that saved JSON back to n8n:

- Pick the instance (with several, nothing is preselected). The dialog asks n8n first and says what
  will happen: **update** the workflow with the same id, or **create** it when it's missing (the file
  then gets the new id, so Import and Restore keep matching).
- It's **never published**. If the target is published, restoring can change what runs live, so you
  must type `restore` to confirm.
- It lists the credential names the workflow needs on that instance, and refuses a file with a secret
  typed into a node. Only settings the n8n API accepts are sent (tags aren't).
- Each restore adds a CHANGELOG line and an App activity entry. n8n keeps the replaced version in its
  version history.

## Deleting a project

**Delete** on a project card moves the folder to `n8n workflows/_trash/<slug>--<date>/`, git history
included. **Settings → Recently deleted** restores it (with its registry row and its logs) or deletes
it for good. After 30 days it's deleted automatically, together with its logs, events and executions
in the Control Center. The delete dialog warns when the project has no git remote, unpushed commits,
or uncommitted files, because then the folder is the only copy. n8n itself is never touched.

## Per-workflow settings

Workflows → ⚙ on a row. These settings live only in the Control Center's local database. None of
them change anything in n8n:

| Setting | Effect |
|---|---|
| **What gets logged** | All runs (default) · Errors only · Success only · Stop tracking. Applied at sync, so filtered runs are never stored |
| **Ignore test runs** | Skips runs started by hand from the n8n editor (execution mode `manual`) |
| **Also remove already-logged runs** | One-off cleanup of stored runs that the new setting would no longer log |
| **Keep this workflow's logs for N days** | Overrides the global retention (Settings) for this workflow only |
| **Leave out of Overview stats** | Not counted in executions, success rate, the chart, or recent failures. Its logs stay searchable |
| **Alert if no successful run for N hours** | For scheduled workflows. The clock starts when you set it. Shown on Overview and in the Workflows tab |
| **Alert after N failed runs in a row** | Streak counted from each sync, even for workflows set to "errors only" or "stop tracking" |
| **Notes + runbook link** | Free text (client, owner, what to do when it fails) and an optional link to a doc. Shown under the workflow's alerts on Overview, and as a `note` tag on its row. Never put passwords or keys here |
| **Captured fields** | Keep up to 5 values from a node's output with each logged run (e.g. a message text). The node and field lists load automatically from the workflow's latest run in n8n, with a preview of each value. Read-only: the sync reads n8n's saved run data (`includeData=true`) and stores only the chosen values, cut at 500 characters. Shown and searchable in Logs. Adding or changing fields re-reads older logged runs while n8n still has them. Capped at 25 runs per sync because run data can be large |
| **Snooze alerts** | 24 h / 3 days / 1 week / until a date. Hides the workflow from alerts and recent failures, and it keeps logging |

The dialog also shows whether the workflow has an **error workflow** set in n8n. A published
workflow without one gets a "No error workflow" badge.

**Publish / unpublish in n8n** is in the dialog's "In n8n" section and on each row's status badge,
always behind a confirmation. Unpublishing turns the workflow's triggers off (nothing is deleted);
publishing turns them on. These are the only actions in the app that write to n8n, and each one is
recorded in the activity log. If n8n refuses (e.g. a credential is missing), the dialog shows why.

## Workflow list cache

Reading every workflow from n8n is slow (about 4 MB and 2 s for ~100 workflows), so the Workflows
page keeps the list in memory per instance. It shows the cached copy instantly and, when that copy
is older than 30 s, re-reads n8n in the background for the next visit ("read from n8n … ago" under
the filters). Refresh, publish and unpublish always re-read n8n, and every execution sync refreshes
the cache too. The cache lives only in the running app, so the first visit after a restart loads
from n8n (with a loading skeleton).

## How executions map to projects

A synced execution is linked to a project when its workflow is named `[project-slug] …` (the
workspace naming convention) or tagged with the project slug.

## Design

- Palette: `#000000` · `#1F150C` · `#412D15` · `#E1DCC9`. Dark by default, with a light theme
  toggle (remembered per browser).
- **Viewport-based sizing:** the root font size is `clamp(14px, 0.5vw + 9px, 20px)`, and all
  sizes are in `rem`, so the whole UI scales with the viewport.
- **Even spacing:** one spacing scale (`--s-1` … `--s-7`), and layouts use `gap`.
- Responsive: sidebar on desktop, a compact top bar with a scrollable nav on phones. Tables scroll
  sideways instead of breaking the layout.
- Chart colors were checked for color-blind separation in both themes. Status is always shown as
  an icon plus a label, never color alone.

## Structure

```
app/
├── src/app/            pages (App Router), server actions, /api/events
├── src/components/     UI: sidebar, chart, tables, forms, markdown
├── src/lib/            db (SQLite + migrations), logs, n8n sync, projects (filesystem), docs, settings
├── src/instrumentation.ts   background auto-sync scheduler
└── data/               SQLite file (gitignored)
```

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, better-sqlite3, lucide-react,
react-markdown. `npm run typecheck` checks types. App icons are generated from one SVG by
`node scripts/make-icons.mjs` (in `app/`).
