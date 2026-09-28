# AGENTS.md — {{PROJECT_SLUG}}

Project-specific context. Adds to the root [AGENTS.md](../../AGENTS.md) and overrides it where
they conflict. **Facts and exceptions only. Don't repeat the global rules.**

## Project

- **Client:** {{CLIENT}}
- **Purpose:** {{ONE_LINE_PURPOSE}}
- **Status:** see [README.md](README.md)

## n8n instances

| Env | URL | n8n version | n8n folder | MCP connected? |
|---|---|---|---|---|
| dev | `TODO` | `TODO` | `{{PROJECT_SLUG}}` | `TODO` |
| prod | `TODO` | `TODO` | `{{PROJECT_SLUG}}` | `TODO` |

## Workflows (live IDs)

| File | n8n name | dev ID | prod ID |
|---|---|---|---|
| `00-error-handler.json` | `[{{PROJECT_SLUG}}] Handle workflow errors` | | |

## Credentials used (names only — never values)

| Credential name | Type | Env | Owner |
|---|---|---|---|
| `{{CLIENT}} <Service> dev` | `TODO` | dev | client / us |

## External systems

| System | What we do there | Rate limits / quirks |
|---|---|---|
| | | |

## Constraints and exceptions

<!-- e.g. "Client forbids storing email bodies", "Must run in Europe/Berlin TZ",
     "HubSpot search caps at 10k — paginate by createdAt". -->
- 

## Error alerts go to

- `TODO` (channel / email / person)
