# Spec — NN {{WORKFLOW_NAME}}

| | |
|---|---|
| **File** | `workflows/NN-<slug>.json` |
| **n8n name** | `[{{PROJECT_SLUG}}] <Verb object>` |
| **Status** | draft / approved / built / live |
| **Approved by client** | name, date |

## Purpose

<!-- What it does and WHY it exists (the manual process it replaces, the pain it removes). -->

## Trigger

- **Type:** webhook / schedule / app event / sub-workflow / manual / chat
- **Details:** path, cron + timezone, event name, caller
- **Auth (webhooks):** header auth / HMAC / basic

## Input

```json
{
  "example": "fake data only"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| | | | |

## Logic (steps)

1. Validate input → reject with 400 if …
2. …
3. …

## Output / side effects

- Writes: …
- Sends: …
- Responds (webhooks): `200 { … }`

## Error behavior

| Failure | Behavior |
|---|---|
| Invalid input | 400 `{ "error": "invalid_input", "message": "…" }` |
| Upstream API down / 429 | Retry ×3 with backoff → 502 + alert |
| Unexpected | Error workflow → alert to … |

## Idempotency

<!-- What happens if the same input arrives twice? Which key is used for dedup/upsert? -->

## Volume and limits

- Expected volume: … per day, peak …
- Rate limits of the systems involved: …

## Out of scope

- 

## Test cases

| # | Case | Input sample | Expected | ✅ |
|---|---|---|---|---|
| 1 | Happy path | `assets/samples/….valid.json` | | |
| 2 | Missing required field | | 400 | |
| 3 | Upstream 500 | | retry → error path | |
| 4 | Duplicate event | | no double side effects | |
| 5 | Error workflow fires | | alert received | |
