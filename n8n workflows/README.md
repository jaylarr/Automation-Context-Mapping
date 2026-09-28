# Automation Projects

One folder per project. Create new ones with `scripts/new-project.ps1` or the
`new-automation-project` skill. Each project copies `_template/`.

**Projects are local-only.** Everything in this folder except `_template/` and this README is
gitignored, so client work never reaches the public repo. Back projects up separately (a private
repo or cloud drive).

The project list with statuses lives in `REGISTRY.md` next to this file. `scripts/new-project.ps1`
creates it on first use, and the Control Center reads it. It's gitignored too.
