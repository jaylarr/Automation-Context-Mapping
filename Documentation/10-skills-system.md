# 10 — Skills System

**Skills** are folders with a `SKILL.md` (YAML frontmatter `name` + `description`, then
instructions) plus optional reference files. Agents load a skill when its `description` matches the
task. Docs describe *how we work*. Skills put that knowledge into the agent **at the moment it
needs it**.

The format is the open **Agent Skills** standard, which Codex, Cursor, Claude Code, OpenCode and
others support. The routing table lives in [Skills/INDEX.md](../Skills/INDEX.md).

## Three kinds of skills

| Kind | Source | Folder has | Edit in place? |
|---|---|---|---|
| **Vendored: official** | [n8n-io/skills](https://github.com/n8n-io/skills) (Apache-2.0) | `SKILL.md`, `references/`, `SOURCE.md` | ❌ No, it gets overwritten on update |
| **Vendored: community** | [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills) (MIT), gap-fillers only | `SKILL.md`, refs, `SOURCE.md` | ❌ No |
| **Custom** | Written by us | `SKILL.md`, refs, *no* `SOURCE.md` | ✅ Yes, we own it |

**Why these packs.** The official pack is written for the **official n8n instance-level MCP**,
which is the MCP this workspace uses. The community pack targets the *community* `n8n-mcp`
server, so we only take the skills the official pack doesn't cover (self-hosting, Code Tool,
Python, workflow patterns). Each of those has a `SOURCE.md` that maps its names to our setup.

**Precedence when skills disagree:**
1. The **live MCP tools** (`get_node_types`, the SDK reference) beat every skill on parameter shapes.
2. **Custom** skills and `Documentation/` win on *workspace conventions* (naming, folders, export, docs).
3. **Official** skills win on *n8n behavior and best practice*.
4. **Community** skills fill gaps only.

## How agents find skills

- `.agents/skills/` is a junction to `Skills/`, and Codex and Cursor auto-discover it.
  Run `scripts/link-skills.mjs` after cloning.
- Claude Code reads `.claude/skills/`. The same script creates that junction too. You may also have
  the czlonkowski pack installed globally in `~/.claude/skills`. **Inside this workspace, prefer
  the `*-official` skills** (they match the MCP we use).
- Any agent: [Skills/INDEX.md](../Skills/INDEX.md) says which skill to open for which task.

## When to write a new custom skill

Write one when **any** of these is true:

- You've explained the same procedure to an agent **twice**.
- A project taught a lesson that would have saved hours ("HubSpot's search API caps at 10k results,
  paginate by date instead").
- A client or service has quirks we'll hit again (a `hubspot-integration` skill, a
  `client-acme-conventions` skill).
- A repeatable deliverable exists (export, handover, audit, estimate).

Don't write one for one-off facts. Those go in the project `AGENTS.md` or `decisions.md`.

## How to write a custom skill

```
Skills/<skill-name>/
├── SKILL.md            ← required
└── references/         ← optional, for detail loaded only when needed
    └── <TOPIC>.md
```

`SKILL.md` skeleton:

```markdown
---
name: <skill-name>                      # kebab-case, equals the folder name
description: <What it does>. Use when <concrete triggers: phrases, tools, situations>.
---

# <Title>

## When to use / not use
## Non-negotiables          (rules with no exceptions)
## Procedure                (numbered steps)
## Anti-patterns            (table: mistake → what goes wrong → fix)
## References               (table: file → read when)
```

Guidelines:
- **The description is the trigger.** Put in the words a user or agent would actually say
  ("export", "save workflow to repo", "sanitize JSON"). A vague description means the skill never loads.
- **Keep SKILL.md under ~300 lines.** Push detail into `references/`.
- **Imperative and specific.** "Call `get_workflow_details` and check `connections`" beats
  "make sure it's connected".
- **Explain *why*** for each rule. Agents follow a rule better when they know its reason.
- Name client- or service-specific skills clearly: `service-hubspot`, `client-acme-conventions`.
- After creating one, **add it to [Skills/INDEX.md](../Skills/INDEX.md)** and commit with
  `skills: add <name>`.

## Updating vendored skills

Check quarterly, and after any n8n upgrade:

1. Clone the pack's latest version somewhere temporary.
2. Diff it against our copy (ignore `SOURCE.md`). Read what changed.
3. Replace the skill folders, then update each `SOURCE.md` (commit SHA, date).
4. Re-check [Skills/INDEX.md](../Skills/INDEX.md) for renamed, added, or removed skills.
5. Commit: `skills: update n8n-io/skills to <sha>`.

**Drift signals** (time to update): a skill names an MCP tool that doesn't exist, parameter shapes
differ from `get_node_types`, or n8n's behavior contradicts a skill.
