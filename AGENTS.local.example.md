# AGENTS.local.md — owner-specific facts (local only, gitignored)

Copy this file to `AGENTS.local.md` and fill it in. It stays on your PC. AI agents read it after
`AGENTS.md`, and the Claude Code session-start hook injects it automatically.

"The owner" in the shared docs is **<your name>**.

## n8n account

- **Plan limits:** e.g. "no n8n env vars / Variables on my plan".
- **Instance(s):** dev/prod URLs, n8n version, how n8n reaches the Control Center
  (e.g. `http://host.docker.internal:3100`).

## Your own credentials

Credential names for internal work. Client projects use `<Client> <Service> <env>`.

| Service | Credential name |
|---|---|
| Gmail | `<You> - Gmail` |
| Sheets | `<You> - Sheets` |
