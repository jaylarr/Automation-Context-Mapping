# Source

| Field | Value |
|---|---|
| Origin | **Vendored — community (gap-filler)** |
| Repository | https://github.com/czlonkowski/n8n-skills |
| Path | `skills/n8n-code-tool` |
| Commit | `19cd793f4789e3ef9c657ccf26e097f641a77df0` |
| Commit date | 2026-09-16 |
| License | MIT (see `../_licenses/czlonkowski-n8n-skills-LICENSE-MIT.txt`) |
| Vendored on | 2026-09-27 |
| Targets | the **community n8n-mcp** server |

## Read this before using

This pack was written for the community `n8n-mcp` server, while this workspace uses the
**official** n8n MCP. Its principles hold, but tool and skill names differ:

| This skill mentions | In this workspace use |
|---|---|
| `n8n-code-javascript` | `n8n-code-nodes-official` |
| `n8n-expression-syntax` | `n8n-expressions-official` |
| `n8n-error-handling`, `n8n-subworkflows`, `n8n-agents`, ... | the matching `*-official` skill |
| `n8n_get_workflow`, `get_node`, `n8n_validate_workflow`, ... | `get_workflow_details`, `get_node_types`, `validate_workflow` (official MCP) |

Selected because the official pack has no equivalent topic. See `../INDEX.md`.
Do not edit this skill in place.
