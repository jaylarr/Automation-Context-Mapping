# Layout and wording examples

These are fictional drafting guides. Apply the exact [format contract](../../../Documentation/project-visuals.md), current project evidence and real source hashes; do not copy these descriptions into an unrelated project.

## Pipeline

Reporting: **Receive data → Prepare summary → Human review**. Use ordered input/process/review stages and adjacent flow edges. A proposed implementation uses `approved-design`, design evidence, planned states and a cited approved architecture/spec. Avoid implying reports are automatically distributed when the source only prepares them.

Recruitment: **Application → CV review → Job matching → Invitation draft → Questionnaire check → Final evaluation → HR review**. This can be the logical applicant journey across multiple executions; say so in the details. Preparing a Gmail draft does not send the invitation. HR retains the hiring decision.

## Branching

Customer engagement: **Customer snapshot → Assess risk → Choose action**, then **Healthy: Record status**, **At-risk: Follow-up draft**, **Urgent: Internal alert draft**. The three outgoing edges from the decision are condition edges with those labels. The preview ends at the decision, with the computed three outcomes count. Cite the saved workflow and architecture; preserve its limits and setup/test state.

Do not call an ordinary chain branching for visual variety. A graph with retries can summarize them in details without drawing a cycle.

## System map

**Incoming form → Prepare summary → Sheet record / Review draft**. Inputs are `input`, one central stage is `process`, and destinations are `storage`/`review`. The preview follows a real path to one destination while the full diagram includes every destination. If a service is both read and written, use distinct clearly labeled stages on the two sides.

An original-source audit uses `audit-source` and static evidence with runtime unverified. Register/hash checks preserve original integrity; the visual is a separately authorized derived asset. Do not combine an approved changed version and an original in one unlabeled summary.

## Precision

- “Prepare an email for review” is supported by draft creation; “Notify the customer” implies sending and needs separate evidence.
- “Recorded controlled live test on YYYY-MM-DD” describes dated proof; “Live” is a current state claim this visual cannot verify.
- “Cited local files are unchanged” describes hashes; it does not certify semantic correctness.
- Use “Unknown” or a clearly planned overview when the evidence cannot support implementation claims. A context-free project may have no useful visual yet.
