---
name: n8n-project-sizing
description: "Before building a new automation project, estimate how many n8n nodes the whole project needs, then ASK the owner whether to build it as one single workflow or split it into multiple workflows. Nothing gets built until they answer. Use when a new project or client brief arrives, when asked to \"build\", \"develop\", \"create the automation for\" something that has no workflows yet, after discovery/spec and before architecture, when a new feature will add many nodes to an existing project, or when the user asks \"how big is this\", \"how many nodes\", \"one workflow or several\", \"should I split this\"."
---

# n8n Project Sizing (estimate nodes → ask: one workflow or several?)

Every new project starts with **two steps, in order, before any design or build:**

1. **Estimate** how many nodes the whole project needs, step by step.
2. **Ask the owner** whether to build it as **one single workflow** or **multiple workflows**. Show the
   estimate, both options, and a recommendation.

The decision shapes everything after it: the architecture, the file names (`01-…`, `02-…`), the
canvas sections (`n8n-workflow-sections`), testing, and the handover. Changing it after the build
means a rebuild. *Why ask instead of deciding:* it's a trade-off (simple to hand over vs. easy to
maintain and reuse), and only the owner knows the client, the budget, and how the project will grow.

## When to use / not use

- **Use:** a new project or client brief. The first build in a project that has no workflows yet.
  A change request that adds roughly 10 or more nodes to an existing project.
- **Don't use:** small edits to an existing workflow (a node or two), or a one-off test workflow.
  When unsure, run it. It only takes a minute.

## Non-negotiables

1. **Estimate before designing or building.** No SDK code, no `create_workflow_from_code`, and no
   architecture doc until the estimate is shown and the question is answered.
2. **Always ask, even when the answer looks obvious.** Put the recommendation first, but let the owner
   choose. In Claude Code use `AskUserQuestion`; in other agents ask in chat and **stop** until the owner
   replies.
3. **Give a range, never one number** (e.g. "32–40 nodes"). Early estimates are uncertain; a range
   is honest.
4. **Count working nodes only.** Sticky notes aren't counted in the total. List them separately
   ("+ ~6 sticky notes").
5. **Record the decision** in the project's `documentation/decisions.md` (date, estimate, choice,
   reason) and `documentation/architecture.md` before building.

## Procedure

1. **Read what exists:** the client brief (`client-brief/brief.md` + `files/`), `documentation/discovery.md`, specs in `documentation/spec/`,
   and the project `AGENTS.md`. If the brief is too thin to estimate (trigger, systems, or outputs
   unknown), ask those questions first.
2. **Break the project into steps**, the same way a person would do the job: receive → check →
   look up → decide → save → notify → close. Include the exception paths (not found, duplicate,
   invalid) and every place a failure needs handling.
3. **Count nodes per step** with the counting guide below. Add a **+20% buffer** at the high end for
   the things you always find while building (a result check here, a fallback there).
4. **Sketch both options:**
   - **Single workflow:** one canvas, and roughly how many sections (`n8n-workflow-sections`).
   - **Multiple workflows:** the split, with a name, trigger, and node range for each
     (`01-intake`, `02-process`, `03-notify`, plus shared sub-workflows), and how they connect
     (Execute Workflow, a webhook, or a shared Data Table/DB).
   - **Both options** include the project's `00-error-handler` workflow (3–5 nodes). It's always
     separate, whichever option is chosen, so count it on its own line.
5. **Recommend one** using the guide below, then **ask** (Non-negotiable 2). Use the report format
   below.
6. **Record the answer** (Non-negotiable 5). Update the project `AGENTS.md` workflows table with
   the planned file names.
7. **Continue** to design and build: `n8n-workflow-sections` for each workflow's canvas,
   `n8n-subworkflows-official` if splitting, then the normal build loop
   (`Documentation/11-ai-agent-workflow.md`).
8. **Re-check at the end of the build:** compare the real node count with the estimate. If it went
   past the high end by more than ~30%, tell the owner (it may be worth re-splitting) and add a line to
   `decisions.md`.

## Counting guide (typical native nodes per building block)

| Building block | Nodes | Notes |
|---|---|---|
| Trigger (webhook, form, schedule, app trigger) | 1 | +1 `Respond to Webhook` per distinct response |
| Normalize / clean the input | 1 | Set, or Code if it's complex |
| Validation + branch | 1–2 | +1 per exception reply/ending |
| Lookup (DB / API / sheet) + "found?" check | 2 | |
| Duplicate / idempotency check | 2–3 | lookup + IF (+ register) |
| Create or update a record | 1 each | |
| Status/audit log write | 1 | |
| AI step (LLM call) | 2–4 | the call + model sub-node + validate/fallback (+ output parser) |
| AI agent with tools | 3 + 1 per tool | agent + model + memory + tools |
| Notification per channel (email, Slack, WhatsApp) | 1–2 | +1 result check if it continues on error |
| Loop / batch / pagination | 2–4 | split, loop, aggregate |
| Merge after branches | 1 | |
| File handling (download, convert, upload) | 1 each | |
| Config/settings node at the start | 1 | |
| Final response / completion page | 1 per outcome | |
| Project error handler (`00-error-handler`) | 3–5 | separate workflow, always |

**Calibration** (real workflows built in this workspace, working nodes only):
milestone form → Supabase → email ≈ **14**; project retro with AI summary + wiki + follow-up ≈
**21**; after-hours WhatsApp support with dedup + AI triage + emergency path ≈ **33**.

## Which option to recommend

| Signal | Leans toward |
|---|---|
| ≤ ~25 nodes, one trigger, one straight story | **Single** workflow |
| ~25–45 nodes | Either. Decide on the signals below |
| > ~45 nodes | **Multiple** (one canvas gets hard to read and test; `n8n-workflow-sections` caps a canvas at 6 sections) |
| Several different triggers or schedules (form + nightly job + webhook) | **Multiple**, one per trigger |
| A part is reused in 2+ places, or should be an AI-agent tool | **Multiple**, with a shared sub-workflow |
| Parts fail or retry independently, or run at very different volumes | **Multiple** |
| Client handover simplicity matters most, small team, few changes expected | **Single** |
| A long-running wait (approval, Wait node for days) in the middle | **Multiple**: split at the wait |

Trade-off, in plain words:

- **Single:** easier to see everything at once, easier to hand over, one thing to import and
  activate. It gets crowded and harder to test as it grows.
- **Multiple:** each part is smaller, easier to test, reuse, and fix alone. There are more pieces
  to connect, import, and document, and a failure can hide between workflows unless the error
  handler covers all of them.

## Report format (what to show the owner before asking)

```markdown
## Size estimate — <project name>

| Step | What it does | Nodes |
|---|---|---|
| 1. Receive | Form trigger + clean input | 2 |
| 2. Check | Find customer, found?, duplicate check | 4–5 |
| … | … | … |
| **Total (working nodes)** | | **28–34** (+ ~6 sticky notes) |
| Error handler (`00-error-handler`, separate either way) | | 3–5 |

**Option A — Single workflow:** `01-<name>` with ~5 sections.
**Option B — Multiple workflows:** `01-intake` (10–12) → `02-process` (12–15) → `03-notify` (6–7),
connected by Execute Workflow.

**Recommendation:** <A or B>, because <1–2 reasons from the guide>.
```

Then ask: *"Do you want this as one single workflow, or split into multiple workflows?"*

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Building first, sizing later | A 60-node canvas nobody can read, or a split done as a rebuild | Estimate + ask before any code |
| Deciding silently ("I'll split it, that's best practice") | The owner loses a decision that belongs to them | Always ask (Non-negotiable 2) |
| A single number ("30 nodes") | False precision; trust drops when it's 45 | Range + 20% buffer |
| Counting sticky notes | Inflated estimate | Working nodes only; stickies listed separately |
| Forgetting exception and error paths | Estimate 30–50% too low | Count "not found / duplicate / invalid" + failure handling in step 2 |
| Splitting into many 3-node workflows | Harder to follow than one canvas | Split only on the signals in the table |
| Decision only in chat | Lost next session | `decisions.md` + `architecture.md` |

## References

| File | Read when |
|---|---|
| `n8n-subworkflows-official` | The owner chose multiple workflows: sub-workflow inputs, Execute Workflow, naming |
| `n8n-workflow-sections` | Laying out each workflow's canvas after the decision |
| `Documentation/02-how-i-work.md` §3 Design | Where sizing sits in the project lifecycle |
| `Documentation/templates/workflow-spec.md` | One spec per planned workflow after the split |
