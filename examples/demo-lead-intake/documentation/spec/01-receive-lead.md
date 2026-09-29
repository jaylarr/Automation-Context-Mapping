# Spec — 01 Receive lead

| | |
|---|---|
| **File** | `workflows/01-receive-lead.json` |
| **n8n name** | `[demo-lead-intake] Receive lead` |
| **Status** | built (sample) |
| **Approved by client** | Demo Co (fictional), example only |

## Quick spec (small job: under 10 nodes, one workflow)

| | |
|---|---|
| **Trigger** | Webhook `POST /demo-lead-intake/lead` from the website form |
| **Result** | Valid lead (has an email) → a row in the Leads sheet, and `200 {"ok": true}` back to the form |
| **On failure** | Missing email → `400 {"error": "validation_error"}`; anything else → error workflow alert |

Sample input: [`assets/samples/lead.valid.json`](../../assets/samples/lead.valid.json)
