---
name: n8n-workflow-sections
description: Lay out every n8n workflow as numbered, plain-language sections using sticky notes (01 — RECEIVE + FIND, 02 — CHECK + PREPARE …), plus EXCEPTIONS / SETUP / DEMO BOUNDARY notes, so anyone (the owner, a client) can read the canvas in order. Two layouts: Row (sections left → right) or Column (sections stacked top → bottom). Load at the very START of creating any new n8n workflow, before writing SDK code, and whenever adding nodes to an existing workflow. Triggers on "new workflow", "build a workflow", "create_workflow_from_code", "update_workflow" that adds/moves nodes, "sticky note", "section", "organize the canvas", "lay out", "make it readable", "visually organized", or tidying an existing workflow.
---

# n8n Workflow Sections (sticky-note layout)

Every workflow in this workspace is **visually sectioned with sticky notes**. The canvas reads like
a short story: `01 — RECEIVE + FIND` → `02 — CHECK + PREPARE` → `03 — SAVE BUSINESS UPDATE` →
`04 — INFORM + CLOSE`, laid out as a **Row** (left → right) or a **Column** (top → bottom), see
[Layouts](#layouts-row-or-column). Normal exceptions sit in their own note beside the main flow.
Setup and demo caveats sit in their own notes too. Each note explains its part in
plain business language, so a client can follow the workflow without knowing n8n.

**Workspace convention, overrides the official skill.** `n8n-workflow-lifecycle-official` says
"sticky notes annotate, don't group" and prefers node groups. In this workspace, **sticky-note
sections are the standard** (workspace conventions win, see `Skills/INDEX.md` → Precedence).
Only use node groups when the owner asks for them.

## When to use

- **Start of every new workflow, before writing any SDK code.** Plan the sections first, then build.
  Planning sections this way also tends to produce a cleaner design.
- Adding nodes to an existing workflow: every new node goes into a section (resize it, or add one).
- Tidying or reviewing an existing workflow that has no sections.

Tiny workflows (≤ 4 nodes) still get **one** section note (`01 — <WHAT IT DOES>`).

## Non-negotiables

1. **Every non-sticky node sits inside exactly one section note.** A node on bare canvas, or
   straddling two notes, is a defect. *Why:* the notes are the map, and a node outside them is invisible to
   the reader.
2. **Main sections are numbered in execution order and follow one layout**: Row (left → right,
   same `y` and `height`) or Column (top → bottom, same `x` and `width`), see
   [Layouts](#layouts-row-or-column). Never mix the two in one workflow. Title format is `## NN — VERB + VERB`: two digits, an em dash (`—`),
   UPPERCASE, 1–3 short words per side, joined with `+` (`01 — INTAKE + CHECK`,
   `03 — COMPANY WIKI`, `05 — SAVE + RESPOND`). *Why:* the numbers give the reading order at a
   glance, even zoomed out.
3. **3 to 6 main sections.** Fewer means a section is doing too much. More means the workflow
   should probably be split. Raise it with the owner (`n8n-project-sizing`) rather than splitting silently.
4. **Body = 2–3 labelled blocks in plain business language.** No node types, no expressions, no
   jargon ("The workflow finds the matching project", not "Supabase getAll with eq filter").
   *Why:* the client reads these.
5. **Normal business exceptions (not found / invalid / duplicate / already done) go in an
   `## EXCEPTIONS` note beside the main flow** (below the row in Row layout, to the right of the
   column in Column layout), and their nodes sit inside it. Errors that get
   retried or continue (onError) stay in their main section, and that section's
   "If something goes wrong:" block explains them.
6. **Setup and demo notes are separate, titled without a number**: `## SETUP BEFORE GO-LIVE`
   (credentials to select, placeholders to replace, SQL to run) and `## DEMO BOUNDARY` (what's
   simulated vs production). Add them whenever placeholders, demo shortcuts, or manual setup
   exist. *Why:* this is what the client needs before go-live, and it has to be visible on the canvas.
7. **No secrets, no real client PII** in sticky content (see `06-credentials-and-security.md`).
   Placeholder names like `YOUR_GOOGLE_DOC_ID` are fine.
8. **Verify the layout after every create/update** (step 6 below). n8n auto-lays-out nodes, so
   never assume the result.

## Palette (sticky `color` integer)

| Note | `color` | Renders as |
|---|---|---|
| Main sections, in order | `5`, `6`, `4`, `3`, then repeat `5`, `6`… | blue, purple, green, red |
| `## EXCEPTIONS` | `2` | brown / orange |
| `## SETUP BEFORE GO-LIVE` | `1` (or omit) | yellow (default) |
| `## DEMO BOUNDARY` | `7` | gray |

The section colors only tell neighbouring sections apart. They don't mean anything, so red
here is **not** a warning. A warning about one fragile node gets a small extra callout note
(color `3`) inside its section, titled `### ⚠ <point>`.

## Layouts: Row or Column

**Row** (the reference workflows): sections side by side, read left → right.

```
[01 — RECEIVE] [02 — CHECK] [03 — SAVE] [04 — CLOSE]
[EXCEPTIONS ........................] [SETUP / DEMO]
```

**Column**: sections stacked, read top → bottom. Inside each section the nodes still flow
left → right, and the last node of one section connects down to the first node of the next.

```
[01 — RECEIVE .......................]   [SETUP BEFORE GO-LIVE]
[02 — CHECK + PREPARE ...............]   [EXCEPTIONS          ]
[03 — SAVE BUSINESS UPDATE ..........]   [DEMO BOUNDARY       ]
[04 — INFORM + CLOSE ................]
```

| Situation | Use |
|---|---|
| 3–4 sections, each short (≤ ~5 nodes wide) | **Row** (default) |
| 5–6 sections, or the row would be wider than ~4,000 px | **Column** |
| Sections with many nodes in a line, or 3+ branch rows | **Column** (each section gets a wide band) |
| The owner asked for one, or nearby workflows in the project use one | That one (match the project) |

State the chosen layout in the section outline (Procedure step 1), e.g. *"Layout: Column,
5 sections"*, so the owner can switch it before the build.

**Column geometry:**
- All main sections share `x` and `width` (the widest section's content + ~120 px). Each section's
  `height` fits its own content (header ~240 px + node rows), so heights may differ.
- Vertical gap between sections: 48 px. Section N+1 starts at `y = yN + heightN + 48`.
- Side column on the right at `x = mainX + mainWidth + 48`: SETUP at the top, then EXCEPTIONS
  (top-aligned with the first section that branches into it), then DEMO BOUNDARY. Same 48 px gaps.
- n8n's auto-layout always spreads nodes left → right, so **a Column layout needs repositioning
  after every create/update**: `setNodePosition` for every node and sticky, plus `/width` and
  `/height` on each sticky (max 100 operations per `update_workflow`, so batch big workflows).

## Section body vocabulary

Pick 2–3 labels per section, whichever fit. Each label goes on its own line, followed by 1–2
short sentences. Use a trailing double space + `\n` for line breaks.

| Label | Use for |
|---|---|
| `**What happens here:**` | Always first. What this step does, in business terms |
| `**System check:**` / `**What the system checks:**` | Validation, lookups, dedup, retries |
| `**Why this matters:**` | Ordering or design choice the reader might question |
| `**If something goes wrong:**` / `**If logging fails:**` | What happens on failure (stop safely, fallback, record for follow-up) |
| `**Safety:**` / `**Safety rule:**` | AI guardrails, "never override X" |
| `**Business rule:**` | Thresholds and policy ("Ratings of 3 or below need follow-up") |
| `**What happens next:**` / `**Then:**` | Hand-off to the next section, or the branch outcomes (bullets OK) |
| `**Final outcome:**` | Last section only: what the user/customer ends up with |
| `**Important:**` | One caveat that must not be missed |

## Procedure

1. **Plan the sections before any SDK code.** Write the story as 3–6 steps, then list the nodes per
   section, which nodes are exceptions, whether setup/demo notes are needed, and the **layout**
   (Row or Column, see [Layouts](#layouts-row-or-column)). Show this
   outline to the owner together with the build plan, as part of the plan approval
   (`Documentation/02-how-i-work.md`).
2. **Name nodes to match** (`Documentation/03-naming-conventions.md`). Section titles and node names
   should tell the same story.
3. **Build the stickies in the SDK code** with `sticky(content, [nodes…], { color })`. The node
   array **sizes and anchors** the note around those nodes. It does **not** add them, so every node
   and every sticky must still be passed to `workflow(...).add(...)`. For the templates and a full
   example, see [references/TEMPLATES.md](references/TEMPLATES.md).
4. **Validate** (`validate_workflow`) as usual. Stickies don't affect execution.
5. **Create/update**, then **verify the layout** with `get_workflow_details`. For every
   `n8n-nodes-base.stickyNote` take `position` [x, y] + `parameters.width/height`, then check:
   - every non-sticky node's `position` falls inside exactly one section rectangle
     (x between `sx` and `sx + width − 100`, y between `sy + 180` and `sy + height − 100`, so it
     doesn't cover the heading text);
   - **Row:** main sections share one `y` and `height`, don't overlap, and increase in `x` in
     numeric order (gap ~16–48 px);
   - **Column:** main sections share one `x` and `width`, don't overlap, and increase in `y` in
     numeric order (gap ~48 px), and nodes inside each section run left → right;
   - the EXCEPTIONS / SETUP / DEMO notes don't overlap the main sections.
6. **Fix any misfit** with `update_workflow`: `setNodePosition` for nodes and stickies, and
   `setNodeParameter` (`/width`, `/height`) for sticky size. Then call `get_workflow_details` again
   to confirm, because auto-layout can move things. Geometry cheat-sheet (matches the reference workflows):
   - sticky header block ≈ 200–260 px tall, so place node rows at `sy + 240` … `sy + height − 120`;
   - ~220–260 px horizontal spacing between nodes, ~130–160 px between branch rows;
   - section `height` 430–560 (720 if it holds three branch rows), `width` = content + ~120 px;
   - Row: EXCEPTIONS row at `y = mainY + mainHeight + 48`; SETUP either above the main row
     (`y = mainY − setupHeight − 24`) or in the lower row next to DEMO BOUNDARY;
   - Column: see "Column geometry" in [Layouts](#layouts-row-or-column).
7. **Keep sections current on every later edit.** When a node is added, removed, or changes
   behaviour, update the section note's text and size in the same `update_workflow` call, and
   renumber if a section is inserted. Then re-verify (step 5).
8. **Export** as usual (`n8n-workflow-export`). Sticky notes are part of the workflow JSON and are
   kept.

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Adding stickies after the build "if there's time" | Sections never get added, or get bolted onto a messy layout | Plan sections at step 1 |
| Node outside any section / half on two | The reader loses the thread; it looks unfinished | Move the node or resize the note (steps 5–6) |
| Body written in n8n jargon (`IF node checks $json.id notEmpty`) | The client can't read it | Business language: "Unknown projects are stopped" |
| Exception nodes mixed into the main flow | The happy path is hard to see | EXCEPTIONS note beside the flow, nodes inside it |
| A 6-section Row that's 6,000 px wide | You have to scroll sideways to read it | Column layout |
| Row and Column mixed in one workflow | No reading order | One layout per workflow |
| Column layout left to auto-layout | Nodes end up in one long line, outside their bands | Reposition every node after create/update (Column geometry) |
| One giant section / ten tiny ones | No story | 3–6 sections; split a long workflow into sub-workflows |
| Random colors, or red used to mean "warning" on a section | Mixed signals | The palette table above; warnings get a small `### ⚠` callout |
| Unnumbered or lowercase titles, `-` instead of `—` | Inconsistent across projects | `## NN — VERB + VERB` |
| Section text left stale after an edit | The canvas lies about what runs | Update the note in the same `update_workflow` |
| Trusting SDK positions without checking | Auto-layout leaves nodes outside notes | Verify with `get_workflow_details` every time |

## References

| File | Read when |
|---|---|
| [references/TEMPLATES.md](references/TEMPLATES.md) | Writing the sticky contents or the SDK code: copy-ready templates, a full SDK example, and the three reference workflows these rules come from |
| `n8n-workflow-lifecycle-official` → Readability | Descriptions and node notes (still apply). Its sticky/group rule is overridden here |
| `Documentation/04-workflow-design-standards.md` §8 | The workspace readability standard this skill implements |
