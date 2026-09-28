# 08 — Testing & QA

"Validation passed" means the JSON is well-formed. **It does not mean the workflow works.**

Skills: `n8n-workflow-lifecycle-official` (see `references/TESTING.md`,
`references/VALIDATION_CHECKLIST.md`) · `n8n-debugging-official` when something fails.

## The gate sequence

```
validate_workflow  →  get_workflow_details (check connections)  →  user wires credentials
      →  test with pinned data (happy + edge + failure)  →  UAT with client  →  publish/activate
```

1. **Validate:** `validate_workflow` passes with no errors. Understand every warning.
2. **Verify wiring:** pull the workflow back (`get_workflow_details`) and check the `connections`.
   Validation misses dropped wires, Merge input off-by-one errors, and error outputs that were never wired.
3. **Credentials:** open every credentialed node and confirm the **right** credential (dev vs prod,
   client A vs B) is selected.
4. **Test with pinned data:** `prepare_workflow_pin_data` + `test_workflow` (triggers, credentialed nodes, and
   HTTP nodes get pinned. **Everything else runs for real**: Code, Data Tables, sub-workflow calls).
   **Ask before running** if anything unpinned has side effects.
5. **UAT:** the client runs real-world scenarios in dev, or in prod with a kill switch.
6. **Publish / activate**, and watch the first live executions.

## Test cases every workflow needs

Put them in the workflow's spec (`documentation/spec/NN-<slug>.md`) and tick them off:

| Case | Example |
|---|---|
| **Happy path** | Typical valid input → expected output |
| **Edge inputs** | Empty arrays, missing optional fields, unicode, very long text, 0 / null |
| **Invalid input** | Missing required field → 4xx with a clear message (webhooks) |
| **Upstream failure** | API returns 500 / 429 / timeout → retry, then the error path works |
| **Duplicate input** | The same event twice → no double side effects (idempotency) |
| **Volume** | Realistic max batch size → finishes within time/rate limits |
| **Error workflow** | Force a failure → the alert arrives with a useful message |

## Test data

- Store **fake/anonymized** sample payloads in `assets/samples/` (e.g. `new-lead.valid.json`,
  `new-lead.missing-email.json`). The same files double as pin data.
- Never use real customer data in the repo. Mask it if you copy a real payload's shape.

## QA sign-off (copy into the spec)

- [ ] validate_workflow clean; connections verified
- [ ] Credentials verified per node (correct env and client)
- [ ] All test cases above pass
- [ ] Error workflow fires and alerts correctly
- [ ] Idempotency confirmed
- [ ] Client UAT sign-off (name + date): ______
- [ ] Exported + CHANGELOG + committed
