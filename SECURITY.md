# Security

## What this workspace is (and isn't)

- **The Control Center is a local, single-user app.** It has no login by design. It listens only on
  `127.0.0.1:3100` and answers only requests addressed to this machine (a host-name lock blocks
  DNS-rebinding attacks from web pages). Don't expose it to a network or the internet. If you put
  it behind a tunnel anyway, add the tunnel's host name to `CONTROL_CENTER_HOSTS` and protect it
  with the tunnel's own authentication.
- **Secrets stay out of files.** n8n credentials hold API keys and tokens. The app stores its own
  keys only in `app/.env.local` (gitignored, file mode 600). Workflow exports, commits, the client
  brief and test results are scanned for common secret formats and refused when one is found
  (`app/src/lib/sanitize-core.mjs`).
- **Client work never goes into this repo.** `n8n workflows/*` (except the template) is gitignored;
  each project has its own private repo. `AGENTS.local.md` (your name, URLs, credential names) is
  gitignored too.
- **What the app writes to n8n:** publish/unpublish and "Restore to n8n", each only after an
  explicit, confirmed click. Everything else is read-only.
- **Local data:** `app/data/control-center.db` holds synced execution metadata and any "captured
  fields" you configure, which can include client data. Keep `app/data/` out of cloud-synced folders.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce
it, and what it could affect. You'll get a reply within a week.

## If you leaked a secret

Rotate it at the provider first (removing it from git doesn't make it safe again), then remove it
from the file and history. Test fixtures in this repo build fake tokens at runtime, so real-looking
strings never need to be committed.
