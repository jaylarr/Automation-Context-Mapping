# Start Here: The Whole System in Plain Language

No tech background needed. Read this first.

---

## The big picture

You build automations for clients with **n8n**. Automation work gets messy fast: lots of workflows,
lots of clients, and things break quietly without anyone noticing.

So this workspace gives you three things:

1. **An organized office**, a folder on your computer where everything has its place.
2. **A rulebook and training material for your AI helpers** (Claude, Codex), so they work *your* way, every time.
3. **A control room**, the **Control Center** app, where you see at a glance what's happening with your automations.

---

## Part 1: The office (your workspace folder)

Everything lives in one folder: `Automation Context Mapping`. Think of it as an office building with separate rooms:

| Room (folder) | What it's like | What's in it |
|---|---|---|
| **Documentation** | The **company handbook** | How you work, how things are named, what "done properly" means. The same rules for every client. |
| **Skills** | **Recipe cards** for your AI helpers | Step-by-step know-how, like "how to build an n8n workflow that doesn't break". |
| **n8n workflows** | **Filing cabinets**, one drawer per client project | Each project's workflows, its optional website, and its own notes. |
| **app** | The **control room** | The Control Center dashboard. |
| **scripts** | The **maintenance closet** | Small tools that do chores, like creating a new project folder. |

### Why save workflows in folders if they're already in n8n?

n8n is where your workflows *run*. The folder is where they're *kept safe*. If n8n breaks, gets
updated badly, or you move to a new server, your folder still has every workflow saved as a file you
can import back. It's your backup and your history.

### What's "git"?

Git is like a **"save game" system** for the whole folder. Every "commit" takes a snapshot, so you
can always see what changed and go back if something goes wrong.

---

## Part 2: Your AI helpers' rulebook

When you ask Claude or Codex to help with n8n, they need to know *your* way of doing things.
Otherwise each one improvises.

- **AGENTS.md** is the **rulebook**. It's the first thing an AI helper reads when it opens your
  folder: "secrets never go in workflows", "always test before going live", "ask the owner before
  publishing anything", and so on. It starts with a **checklist** they must follow on every task.
- **Skills** are the **recipe cards**. 18 come from experts (most from the n8n team itself), and 6
  were written for you: starting a new project, estimating a project's size (and asking you: one
  workflow or several?), auditing a project against its documents (suggestions you approve one by
  one), laying out every workflow in numbered sticky-note
  sections, saving a workflow to your folder, and writing client handover documents.
- **Automatic reminders (for Claude):** when Claude starts working in your folder, the rules are loaded
  automatically. Right before it does anything important in n8n (create, change, publish, run), it
  gets a reminder of the relevant rule.
- **Your personal notes:** your own facts, like "no environment variables on my n8n plan", your
  credential names, and your n8n URLs. They go in `AGENTS.local.md`, which stays on your PC (it's
  gitignored), and every AI helper reads it.

**In short:** your AI helpers behave like trained employees who have read your handbook, not random
freelancers.

---

## Part 3: The Control Center (your control room)

The app you installed in Chrome. It's a website that runs **only on your computer**: nobody on the
internet can see it, and all its data stays in a file on your PC.

### The pages

| Page | What it shows you |
|---|---|
| **Overview** | Your "morning glance": how many projects, how many workflow runs today, how many failed, a 14-day chart, and the latest problems. |
| **Projects** | Every client project as a card. Click one to see its workflows and notes. You can **create a new project** here with a simple form. |
| **Workflows** | Everything in your n8n, with a status for each: **New** (no backup yet), **Changed in n8n** (the backup is outdated), or **Up to date**. Pick a project and click **Import** to save a backup file into that project's folder. |
| **Logs** | Three kinds of history (see below). |
| **Docs & skills** | Read your handbook and all the recipe cards (you're here now), with a search box. |
| **Settings** | Your **n8n instances** (add, edit, test, sync), the inbox token, how often to check n8n, and the Restart/Update buttons. |

### The three logs, explained simply

1. **n8n executions:** every time any of your n8n workflows runs, it's an "execution". The app
   **fetches this list from n8n** every 10 minutes (or when you click **Sync now**), so you can see what
   succeeded, what failed, and *why* it failed.
2. **Event inbox:** **messages your workflows send on purpose**, like "Lead qualified ✅" or "HubSpot
   token expired ⚠️". Think of it as a mailbox your automations can drop notes into.
3. **App activity:** a diary of what the Control Center itself did: "synced", "settings changed",
   "someone tried to send a message with the wrong password", and so on.

### Backing up your n8n workflows (the Workflows page)

1. Open **Workflows**. Everything in your n8n is listed (archived ones are hidden unless you tick *Show archived*).
2. Workflows named `[project-slug] …` or tagged with a project slug are matched to that project
   automatically. For the rest (**Unassigned**), pick a project from the dropdown, or click
   *Create project* if it's suggested.
3. Click **Import** on one, or tick several and click **Import selected** (you'll see a
   confirmation first).
4. Later, when you edit a workflow in n8n, it shows **Changed in n8n**. Click **Update** to refresh its backup.

Importing never changes anything in n8n. Test data is stripped out, and a workflow with a password or
key typed directly into a node is skipped until you move that into an n8n credential.

### How it runs by itself

- **At every Windows login**, a hidden helper starts the app in the background. No VS Code, no black
  window, no commands.
- That helper is a **babysitter**: if the app ever crashes, it restarts it automatically. If it
  crashes 5 times in a row, it stops trying, so it doesn't loop forever.
- **Settings → App maintenance** has two buttons:
  - **Restart:** turn it off and on again (about 5 seconds).
  - **Update & rebuild:** used only when the app's code has changed (for example, when a feature is
    added). It builds the new version *while the old one keeps working*, then switches over. If
    anything goes wrong, **nothing breaks**: it keeps the old version.

---

## Part 4: How n8n and the Control Center talk to each other

They talk in **two directions**, and each direction has its own "key":

```
   CONTROL CENTER  ──── "What ran? What failed?" ────▶  n8n
   (uses the API key: like a visitor badge to n8n's records room)

   n8n  ──── "Here's a message for you" ────▶  CONTROL CENTER
   (uses the inbox token: like a password for dropping letters in the mailbox)
```

| | **API key** | **Inbox token** |
|---|---|---|
| **Direction** | App → n8n | n8n → App |
| **Purpose** | Lets the app **read** your n8n run history | Proves a message really came from **your** n8n |
| **Created in** | n8n (Settings → n8n API) | The Control Center (Settings → Copy token) |
| **Stored in** | Pasted into the app's Settings | Pasted into n8n as the credential "Control Center ingest" |
| **If it's wrong** | Sync fails with "401 Unauthorized" | Messages get rejected with "401" |

Both are kept in a private file on your PC (`app/.env.local`). They're never saved in the database,
never shared, and never included in git snapshots.

**Why no ngrok here?** ngrok is the tunnel that lets the *internet* reach your n8n, for client
webhooks. But n8n and the Control Center both live on the **same computer**, so they talk directly.
Going through ngrok would be like mailing a letter to your roommate through the post office.

### Several n8n instances (local, Hostinger, clients' servers…)

The Control Center can watch **several n8n instances at once**.

- **Settings → n8n instances → Add instance:** give it a name, its web address, and an API key
  (created in *that* n8n: Settings → n8n API). Click **Add & test**.
- Each instance shows **connected**, **needs API key**, or **sync failing**, with **Test**,
  **Sync**, **Edit**, **Remove key**, and a trash icon to remove it (always with a confirmation).
  Removing an instance never changes anything in n8n.
- When 2 or more are connected, a **"Showing"** dropdown appears at the bottom of the sidebar:
  *All instances* or just one. Overview, Logs and Workflows follow that choice, and with *All*,
  every run and workflow is labelled with its instance.
- The event inbox still works best with the **local** n8n (same computer). An n8n on the internet
  can't reach your PC without a secure tunnel.

---

## Part 5: The "Report event to Control Center" workflow

### What it is

A **tiny reusable workflow** that does one job: **it delivers a message from any of your workflows to
the Control Center's inbox.**

Think of it as a **mail carrier**. Any of your workflows can hand it a note ("Lead L-1042
qualified!"), and it delivers that note to your control room. You build the mail carrier once, and
every workflow can use it.

It's called a **sub-workflow** because it isn't started by itself (no schedule, no webhook). Other
workflows *call* it, like a phone extension. In n8n it's named
`[shared-utilities] Report event to Control Center`. Import it from
[`app/n8n/report-event-to-control-center.json`](../app/n8n/README.md), which also lists the one
credential it needs.

### Why it's useful

Without it, you only see "workflow ran: success/failed", which is n8n's view. With it, your
workflows can tell you **what actually happened in business terms**:

- ✅ "Invoice #203 sent to Acme"
- ⚠️ "Clearbit rate limit hit, retrying"
- ❌ "Client's Google Sheet is missing the 'Email' column"
- ℹ️ "Processed 214 new leads today"

These show up in **Logs → Event inbox**, on the project's page, and on the Overview, all in one place
for every client.

### How it works, step by step

```
Your workflow ──calls──▶ [1. Receive event] ──▶ [2. Send event to Control Center] ──┬──▶ [3a. Return success]  → {ok: true}
                                                                                   └──▶ [3b. Return failure]  → {ok: false, error: "why"}
```

1. **Receive event:** the "front door". It accepts 5 pieces of information (see the table below).
2. **Send event to Control Center:** packs them into a message and delivers it to the app, showing
   the inbox token (your "Control Center ingest" credential) as proof. If delivery fails (for
   example, the app is restarting), **it tries up to 3 times**, waiting 2 seconds between tries.
3. **Return success or Return failure:** it reports back to your workflow:
   - **Delivered:** `ok: true`, plus the message's number in the inbox.
   - **Not delivered:** `ok: false`, plus the reason.

**The most important design choice: it never crashes your workflow.** If the Control Center is off
or the message is wrong, it just reports "didn't work, here's why" and your client's automation keeps
running. Reporting is a side job; it should never break the main job.

### The 5 fields you fill in

| Field | What it means | Allowed values | Example | Required? |
|---|---|---|---|---|
| **level** | How important or what kind | `info`, `success`, `warn`, `error` (exactly these, lowercase) | `success` | No (default `info`) |
| **message** | The note itself, in plain words | Any text | `Lead L-1042 qualified and added to HubSpot` | **Yes** |
| **project** | Which client project it belongs to | The project's folder name (slug) | `acme-lead-intake` | No, but recommended |
| **workflow** | Which workflow sent it | Any text | `Qualify inbound lead` | No (defaults to the calling workflow's name) |
| **data** | Extra details (optional) | An **object**, meaning `{ ... }` form | `{{ { "leadId": "L-1042", "score": 82 } }}` | No, leave empty |

> **Common mistakes:** putting plain text in `data` (it must be `{ ... }` or empty), or using a
> `level` that isn't one of the four words above.

### How to use it in any workflow

1. In your workflow, click **+** where you want to report something (for example, right after "Add
   lead to HubSpot").
2. Add an **Execute Sub-workflow** node (search "Execute Workflow").
3. **Workflow:** choose `[shared-utilities] Report event to Control Center`.
4. Fill in the fields from the table above.
5. Open **Options**, add **Wait for Sub-Workflow Completion**, and turn it **off**. Now your workflow
   drops the note and moves on immediately, without waiting for delivery.
6. Save. Next time the workflow runs, the note appears in **Logs → Event inbox**.

**Tip for failures:** to report when something goes wrong, turn on the failing node's error output
(its Settings → On Error → "Continue (using error output)"). Then connect that error output to a
Report event node with `level: error` and a message like
`Could not add lead to HubSpot: {{ $json.error.message }}`.

### Good habits

- Write messages a human understands at a glance: "Invoice #203 sent", not "HTTP 200 OK".
- Use `success` for wins, `warn` for "handled but worth knowing", and `error` for "someone needs to
  look at this".
- Always fill in `project`, so events show up on the right project's page.
- Don't put passwords or sensitive personal data in `message` or `data`.

---

## Part 6: Your everyday routine

1. **Turn on your PC.** The Control Center starts by itself.
2. **Open the Control Center app** from the Start menu or taskbar.
3. **Look at the Overview:** any red? Check **Recent failures**.
4. **Building something new?** Ask Claude or Codex. They follow your handbook automatically.
5. **New client?** Go to **Projects → New project** and paste what they asked for (plus their files)
   into **Client brief**. Then copy the prompt from **Start an agent** on the project page into
   Claude or Codex. The agent reads the brief first, so you don't have to explain it again.
6. **App acting weird?** Go to **Settings → Restart**.
7. **A feature was added?** Go to **Settings → Update & rebuild**.

---

## Mini dictionary

| Word | Plain meaning |
|---|---|
| **Workflow** | An automation in n8n: a chain of steps |
| **Node** | One step (box) in a workflow |
| **Execution / run** | One time a workflow ran |
| **Sub-workflow** | A small workflow other workflows can call, like a shared helper |
| **Credential** | A saved login or password in n8n, stored safely and not visible in the workflow |
| **API** | A "service window" programs use to talk to each other |
| **API key / token** | A password for a program, not a person |
| **Webhook** | A web address that starts a workflow when something is sent to it |
| **Publish / activate** | Make a workflow live, so it runs on its own |
| **Slug** | A short name like `acme-lead-intake`: lowercase, dashes, no spaces |
| **JSON** | The text format n8n uses to save workflows and data |
| **Localhost / 127.0.0.1** | "This computer": only you can reach it |
| **Git / commit** | Save-game snapshots of your folder |

---

**Next:** the detailed rules are in the [Documentation index](README.md). The workspace map is
[01: Workspace structure](01-workspace-structure.md).
