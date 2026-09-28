# Workflows

Importable n8n workflow JSON files. They're sanitized: no secrets, no real pinned data.

- Naming: `NN-<slug>.json`. `00-error-handler.json` is reserved for the project's error workflow.
- Export and sanitize with the `n8n-workflow-export` skill (see `Documentation/05-export-and-versioning.md`).
- Import order: sub-workflows first, then callers, then set the error workflow on each.
