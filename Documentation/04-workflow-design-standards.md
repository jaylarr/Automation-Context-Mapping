# 04 — Workflow Design Standards

The bar every workflow must clear before it ships. Each section links to the skill that holds the
detailed rules. **Load that skill when you're doing that thing.**

## 1. The standard shape

```
Trigger → Validate input → Process (enrich / transform / decide) → Output (write / notify / respond)
             │ invalid                        │ error                        │ error
             └──► 4xx response / reject       └──────► error path ───────────┘
                                                        (+ workflow-level error workflow)
```

- **Validate early.** Reject bad input at the door with a clear reason. Don't let it crash five nodes later.
- **One workflow, one job.** If you'd need "and" to describe it, consider splitting it.

## 2. Error handling (non-negotiable for anything unattended)

Skill: `n8n-error-handling-official`

- **Every production workflow has an error workflow set** (Settings → Error workflow). Each project
  has `00-error-handler.json`: an Error Trigger that notifies the right person with the workflow
  name, the failed node, the error message, and an execution link.
- **Webhook APIs:** every fallible node has its error output wired, every path ends at a
  `Respond to Webhook`, and status codes match the cause (4xx = the caller's fault, 5xx = ours). Error
  bodies look like `{ "error": "<id>", "message": "<human text>" }`.
- **Network calls** (HTTP, third-party APIs) have `retryOnFail` enabled, with a backoff that suits
  the service's rate limits.
- An internal one-off that you watch run can use looser handling. Anything a client or downstream
  system depends on cannot.

## 3. Reuse via sub-workflows

Skill: `n8n-subworkflows-official`

- **Search before you build.** Something may already do it (`search_workflows({ tags: ['subworkflow'] })`).
- Extract a sub-workflow for **reuse, isolation, testing, or agent tools**. To tidy the canvas, use
  node groups instead.
- The Execute Workflow Trigger uses **"Define Below" typed inputs**, not passthrough (the only
  exception is binary input).
- Default to **stateless** (input → output). When a sub-workflow is stateful, make that deliberate
  and put it in the name.

## 4. Data handling

Skills: `n8n-expressions-official`, `n8n-code-nodes-official`, `n8n-loops-official`,
`n8n-binary-and-data-official`, `n8n-data-tables-official`

- **Transform order:** expression → Edit Fields arrow function → Code node (JavaScript) as a last
  resort. The Code node needs a note explaining why an expression couldn't do the job.
- **Reference by node name** (`$('Fetch order').item.json.id`) over `$json` when the source isn't
  the direct parent.
- **No Set node feeding only one consumer.** Inline the expression instead.
- **Per-item iteration is automatic.** Use `executeOnce` for once-per-run nodes. Use Loop Over Items
  only for explicit batching or rate control. Prefer the HTTP node's built-in pagination.
- **Dates** use Luxon in expressions, not the DateTime node.
- **State** across runs goes in Data Tables (small/medium) or the client's DB (large).

## 5. Idempotency and duplicates

A workflow may run twice on the same input (retries, duplicate webhooks, manual re-runs). Design for it:

- Use **upserts** keyed on an external ID instead of blind inserts.
- Keep a **dedup record** (Data Table with the external ID + processed timestamp) for anything that
  sends messages or charges money.
- Anything that sends email, SMS, or payments must be safe to re-run, or must refuse to re-run.

## 6. AI / LLM steps

Skills: `n8n-agents-official`, `n8n-code-tool`

- Choose the lightest node that does the job: Text Classifier / Information Extractor / Basic LLM
  Chain before a full Agent.
- Tool names and descriptions are part of the prompt, so write them like API docs.
- Structured output: output parser **with autoFix**.
- Human-in-the-loop for anything irreversible that an LLM decided (sending to clients, deleting, paying).
- Log the prompts and outputs you'd need to debug a bad answer. Don't log PII you don't need.

## 7. Security

Skill: `n8n-credentials-and-security-official` · Doc: [06-credentials-and-security.md](06-credentials-and-security.md)

- Secrets only in credentials. Webhooks are authenticated (header auth / basic / HMAC signature).
- Minimal scopes on OAuth apps and API keys.

## 8. Readability

Skill: `n8n-workflow-lifecycle-official`

- A workflow **description** (2–4 sentences): what it does **and why it exists**.
- **Sticky-note sections on every workflow** (skill: `n8n-workflow-sections`, loaded at the start
  of every new build). The canvas reads as numbered sections, laid out as a **Row** (left → right)
  or a **Column** (top → bottom, for 5–6 sections or long sections), `## 01 — RECEIVE + FIND`,
  `## 02 — CHECK + PREPARE` …, each with 2–3 plain-language blocks (**What happens here:**,
  **System check:**, **If something goes wrong:** …). Normal exceptions go in an `## EXCEPTIONS`
  note beside the main flow (below a Row, right of a Column). `## SETUP BEFORE GO-LIVE` / `## DEMO BOUNDARY` notes are added when
  placeholders or demo shortcuts exist. Every node sits inside exactly one section.
- **Sticky palette** (`color` integer):
  | Note | Color |
  |---|---|
  | Main sections, in order | 5 blue → 6 purple → 4 green → 3 red, then repeat |
  | EXCEPTIONS | 2 brown |
  | SETUP BEFORE GO-LIVE | 1 yellow (default) |
  | DEMO BOUNDARY | 7 gray |
  | Warning callout inside a section (`### ⚠ …`) | 3 red, small |
- **Node groups** are optional (only when the owner asks). The sticky sections are the house standard,
  and they override the official skill's "stickies annotate, don't group" guidance.
- **Node notes** on any non-obvious configuration or workaround.

## 9. Performance and limits

- Remember that fan-out branches run **sequentially**. For real parallelism, use sub-workflows with
  `mode: each` + `waitForSubWorkflow: false`.
- Know each API's rate limit and put it in the spec. Batch and wait accordingly.
- Large datasets: paginate and process in batches. Don't load everything into one execution.

## Pre-ship checklist (short)

- [ ] The spec exists and matches what was built
- [ ] Error workflow set; fallible nodes handled; retries on network calls
- [ ] No secrets outside credentials; webhooks authenticated
- [ ] Nodes named; description written; groups/stickies where needed
- [ ] Idempotent (or safely non-repeatable)
- [ ] Passed [08-testing-and-qa.md](08-testing-and-qa.md)
- [ ] Exported, CHANGELOG updated, committed
