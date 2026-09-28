# 12: Roadmap (planned features)

Features we plan to add to the workspace and the Control Center, but haven't built yet. Nothing in
sections A–D exists today. When a feature ships, move it to **Done** at the bottom with the date,
and update the docs that describe it (for example [00: Start here](00-start-here.md) or
[app/README.md](../app/README.md)).

Each item has: the **problem** it solves, the **idea**, and **notes** for whoever builds it.

**Priority:** P1 = next up · P2 = worth doing soon · P3 = later / only if needed.

---

## A. Git source control (free alternative to n8n's paid feature)

n8n's built-in source control (push, pull, and dev → prod environments) needs a Business or
Enterprise plan. Today the workspace covers the **backup + history** half for free: the Control
Center exports sanitized workflow JSON into each project folder, and each project has its own git
repo. The steps below close the rest of the gap.

### A1. "Commit" button (P1) — done 2026-09-29, see Done

- **Problem:** after **Import** / **Update** on the Workflows page, you still have to open a
  terminal (or ask an agent) to commit the changed files.
- **Idea:** a **Commit** button next to Import that commits the project's changed files in that
  project's own repo, with an automatic message like
  `export: 01-intake-webhook (n8n updatedAt 2026-10-02 14:31)`. It shows a confirmation listing the
  files first.
- **Notes:**
  - Commit only inside `n8n workflows/<project>/` (the project's own repo), never the workspace repo.
  - Never push automatically. Pushing stays a separate, explicit action (see A2).
  - Also add the CHANGELOG entry the export standard requires
    ([05: Export & versioning](05-export-and-versioning.md)), or refuse to commit without one.
  - Log every commit in **App activity**.

### A2. "Push" button (P2)

- **Problem:** backups only live on this PC until someone pushes.
- **Idea:** a **Push** button per project, shown only when the project repo has a remote. Shows how
  many commits are waiting to go out.
- **Notes:** uses the git credentials already on the machine. The app never stores GitHub tokens.

### A3. Scheduled auto-export (P2) — done 2026-09-29, see Done

- **Problem:** backups depend on someone clicking Import. A workflow edited in n8n and never
  exported can be lost.
- **Idea:** an optional setting "Auto-export changed workflows every N hours" for workflows that
  already belong to a project. It runs the same sanitizer as Import, and can optionally auto-commit
  (A1), but never auto-push.
- **Notes:** a workflow that fails sanitizing (a secret typed into a node) is skipped and reported
  in the Overview, the same way Import handles it today.

### A4. "Restore to n8n" (the pull half) (P2) — done 2026-09-29, see Done

- **Problem:** the app only **reads** from n8n. Restoring an older version means importing the JSON
  by hand in the n8n UI.
- **Idea:** on a project's workflow list (or from git history), a **Restore to n8n** button that
  sends a saved JSON back through the n8n API: update the existing workflow, or create it if it's
  missing.
- **Notes:**
  - Always confirm first, and show which instance it will write to.
  - Never publish/activate on restore. The owner publishes by hand after checking it.
  - Credentials are re-linked by name. Warn when a credential name doesn't exist on the target
    instance.
  - Refuse to write to an instance marked as production unless the owner confirms twice.

### A5. Dev → prod promotion (P3)

- **Problem:** with separate dev and prod instances, moving a finished workflow to prod is manual.
- **Idea:** "Promote to prod": take the committed JSON from dev (A1) and restore it on the prod
  instance (A4), then log it in the project CHANGELOG.
- **Notes:** only useful once projects run a real dev/prod split
  ([07: Self-hosted environments](07-self-hosted-environments.md)). Builds on A1 + A4.

---

## B. Monitoring and alerts

### B1. Push alerts on failures (P1)

- **Problem:** failures only show up when someone opens the dashboard. If a client workflow breaks
  at night, nobody knows until morning (or until the client notices).
- **Idea:** send an alert (email and/or Slack/Telegram) when a workflow fails, with the project,
  workflow, error message, and a link to the execution. Include a cooldown so a failure loop doesn't
  send 100 messages.
- **Notes:** two options, not exclusive:
  1. An n8n **error workflow** template in `shared-utilities` that each instance uses (works even
     when this PC is off). The simplest and most reliable option.
  2. The Control Center sends the alert after each sync (only works while the app is running).

### B2. Heartbeat / missed-run checks (P2)

- **Problem:** a scheduled workflow that silently stops running produces no error at all.
- **Idea:** per workflow, an optional "expected to run at least every X". If no execution arrives in
  time, raise an alert (B1).

### B3. Instance health (P3)

- **Problem:** an unreachable instance just shows "sync failing".
- **Idea:** show the instance version, last successful contact, and alert when an instance has been
  unreachable for longer than a set time.

---

## C. Agency / team use

Today the Control Center is local-only and single-user, which is fine for a solo builder. These items
matter once there's a team or client-facing reporting.

### C1. Hosted mode (P2)

- **Problem:** the app only runs while this PC is on, and remote n8n instances can't reach the event
  inbox without a tunnel.
- **Idea:** a documented way to run the Control Center on a small server (Docker image + reverse
  proxy with HTTPS), so it syncs 24/7 and any instance can send events to it.
- **Notes:** requires C2 (login) first. Keep SQLite; it's plenty for this size.

### C2. Login and roles (P2)

- **Problem:** anyone who can reach the app sees everything. Fine on localhost, not on a server.
- **Idea:** simple sign-in with roles: **owner** (everything), **builder** (projects and workflows,
  no settings), and later **client** (C4).

### C3. Cross-platform setup (P3) — scripts + auto-start done 2026-09-29, see Done; Docker still open

- **Problem:** the scripts and the auto-start helper are Windows/PowerShell only.
- **Idea:** a Docker-based setup (also used by C1), plus shell versions of `new-project` and
  `init-project-repo` for macOS/Linux teammates.

### C4. Client reports and status page (P3)

- **Problem:** clients can't see that their automations are working, which makes a monthly
  retainer harder to justify.
- **Idea:** per project, a monthly report (runs, failures, fixes, business events like "214 leads
  processed", and optionally estimated time saved), exported as PDF or a read-only link. Optionally
  a simple status page per client.
- **Notes:** strip anything sensitive. Clients see their own project only.

---

## D. Workspace maintenance

### D1. Skill and MCP drift check (P2)

- **Problem:** n8n and its MCP tools change often. Skills that name old tools or old parameters
  quietly go stale.
- **Idea:** a script (or Control Center page) that compares the tool names mentioned in `Skills/`
  against the live MCP tool list and flags mismatches, plus a reminder to re-check vendored skills
  against their upstream sources.

### D2. Lightweight mode for small jobs (P3)

- **Problem:** a 5-node job still goes through the full spec → sizing → sections → export → docs
  process.
- **Idea:** a documented "small job" path (for example, under ~10 nodes and no client system writes)
  with a one-page spec and a shorter checklist.

### D3. "Edit raw README" escape hatch (P3)

- **Problem:** the project page edits only the README's title, purpose line and info table (see
  Done). Anything else still needs an editor or an agent.
- **Idea:** an **Edit raw** button with a plain Markdown editor and a warning that agents maintain
  the rest of the README (workflow list, links), so hand edits may be overwritten.

---

## Done

| Date | Feature |
|---|---|
| 2026-09-29 | **Restore to n8n (A4).** Per-workflow button on the project page: updates the workflow with the same id or creates it (and writes the new id into the file), never publishes, extra typed confirmation when the target is published, credential names listed, secret check, CHANGELOG line. |
| 2026-09-29 | **macOS + Linux.** `new-project`, `init-project-repo` and `link-skills` are Node scripts (`scripts/*.mjs`; the `.ps1` files are Windows wrappers); the app calls them with Node. `scripts/control-center.mjs` installs the Control Center as a launchd agent (macOS) or systemd user service (Linux), with a safe `update` + rollback. CI runs the scripts on Ubuntu, macOS and Windows. In-app Restart/Update stays Windows-only. |
| 2026-09-29 | **Backups (A1 + A3).** Backup chip on every project card, a Backup card with **Commit** (secret check, CHANGELOG line when workflows changed, never pushes) and **Set up git**, a first commit for projects created in the app, and scheduled auto-export with optional auto-commit (Settings → Backups). Secret patterns now also catch Telegram bot tokens, JWTs, Google and Stripe keys, Slack webhooks and private keys. |
| 2026-09-28 | **Recoverable project delete.** Delete moves the project to `n8n workflows/_trash/` for 30 days; **Settings → Recently deleted** restores or purges it. The dialog warns when the project has no remote, unpushed commits, or uncommitted files. |
| 2026-09-28 | **Host lock (DNS-rebinding guard).** `app/src/proxy.ts` answers only requests addressed to this machine; extra names via `CONTROL_CENTER_HOSTS`. |
| 2026-09-28 | **CI + fresh-clone fix.** GitHub Actions builds the Control Center on Ubuntu, macOS and Windows from a clean checkout. |
| 2026-09-28 | **Project details form.** The project page edits the README's name, purpose, client, status, version and started date (**Edit details** + the Status dropdown). Hand-written variants such as `\| Stage \| … \|` or non-bold labels are read and rewritten to the template format, and a save that doesn't stick shows an error instead of "saved". The rest of the README stays with agents. |
