# AGENTS.md — {{PROJECT_SLUG}}

Project-specific context. Adds to the root [AGENTS.md](../../AGENTS.md) and overrides it where
they conflict. **Facts and exceptions only. Don't repeat the global rules.**

## Start here (agents)

1. Read [client-brief/brief.md](client-brief/brief.md) and every file in `client-brief/files/`.
   That's the client's request in their own words, and the source for discovery, specs, and sizing.
   **Read-only:** never edit anything in `client-brief/`. If it looks wrong or outdated, tell the owner.
2. Read [README.md](README.md) (status), then `documentation/` and `workflows/` to see what exists.
3. Before acting, tell the owner the stage the project is at and the next step
   (discovery → spec → sizing → build → test → publish).

## Project

- **Client:** {{CLIENT}}
- **Purpose:** {{ONE_LINE_PURPOSE}}
- **Status:** see [README.md](README.md)

## n8n instances

| Env | URL | n8n version | n8n folder (if supported) | Access (API / optional MCP / local JSON) |
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
