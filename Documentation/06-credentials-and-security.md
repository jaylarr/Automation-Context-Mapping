# 06 — Credentials & Security

We handle client systems and client data. One leaked key can end a client relationship.

Skill for build-time decisions: `n8n-credentials-and-security-official`.

## The rules

1. **Secrets live in the n8n credential store. Nowhere else.**
   Not in Set nodes, HTTP header fields, Code nodes, expressions, `$vars`, sticky notes, docs,
   chat, or git. Exported workflow JSON only contains credential **references** (`{ id, name }`).
2. **Use the native credential type** when a node exists. If not, use HTTP Request with a built-in
   auth type (Header Auth, Bearer, Basic, OAuth2, Custom Auth).
3. **One credential per client × service × environment** (`Acme HubSpot prod`). Never reuse a
   client's credential for another client or for internal work.
4. **Least privilege.** Minimal OAuth scopes and read-only keys where possible. Prefer service
   accounts over personal accounts, and **client-owned** accounts over ours.
5. **Credential creation is manual.** Agents tell you the exact credential *type* to create in the
   n8n UI. They never create credentials or handle secret values themselves.
6. **A secret pasted in chat is compromised.** Rotate it once the credential is set up.

## Who owns what

| Item | Owner | Notes |
|---|---|---|
| Client SaaS accounts (CRM, email, etc.) | **Client** | We get delegated access or an API key they issue |
| OAuth apps for client services | Client (preferred) or us | If ours, document it in the project AGENTS.md: it must be handed over or rotated at the end |
| n8n instance(s) | `TODO(owner)`: us, or the client's own server? | Recorded per project |
| Encryption key (`N8N_ENCRYPTION_KEY`) | Whoever runs the instance | **Back it up.** Without it, stored credentials are unrecoverable |

## Webhook security

Every production webhook is authenticated. Pick one:

- **Header Auth** (a shared secret in a header). The simplest option, fine for server-to-server.
- **HMAC signature verification** when the sender supports it (Stripe, GitHub, Shopify…). The best option.
- **Basic Auth** as a fallback.
- Use obscure paths as well, but an obscure path **is not** authentication.

Also:
- Validate payload shape before doing anything with it.
- Return generic error messages to callers. Never echo stack traces or internal IDs.

## Client data (PII)

- Pull only the fields the workflow needs.
- Don't log full payloads containing PII in Data Tables or notifications unless the spec requires it.
- Set execution-data retention in the instance (e.g. prune after N days). Record it in the project
  AGENTS.md.
- The repo contains **fake or anonymized** samples only (`assets/samples/`).

## Local secrets (website/ projects, scripts)

- Use a `.env` file, which is gitignored. Commit a `.env.example` with **keys only, empty values**.
- Deployed secrets live in the host's secret manager (Vercel/Cloudflare/etc.), never in code.

## Offboarding a client / ending a project

- [ ] Hand over, or delete, credentials we created
- [ ] Revoke our access to client systems (API keys, OAuth grants, user seats)
- [ ] Transfer or archive the n8n workflows per contract
- [ ] Remove client data from our instance (Data Tables, execution history)
- [ ] Mark the project `archived` in the registry
