# 11 — AI agent workflow

The Control Center uses the n8n public REST API. Agents can work through the API, optional
**official instance-level MCP**, or local workflow JSON. Start with
[the workspace access skill](../Skills/n8n-workspace-access/SKILL.md); select access before loading
transport-specific instructions. MCP is not required to run the app or use the custom skills.

## Before building

Read the project `AGENTS.md` and owner-maintained `client-brief/`, confirm the target installation
and workflow, and agree the spec. New projects and large features need the sizing decision;
small jobs use Trigger / Result / On failure. Search existing workflows through the chosen
method before creating duplicates. No live access means repo-only evidence, not a live audit.

## Build and verify

| Step | API or local JSON | Optional official MCP |
|---|---|---|
| Discover behavior and parameters | Installed-version official node docs/source and verified exports; API schema for payloads | Available SDK reference, node types and resource discovery |
| Plan | Spec, sizing when required, numbered sticky sections | Same |
| Prepare | Edit JSON preserving IDs, connections, coordinates and unrelated settings | Use supported SDK/operations; preserve requested layout |
| Validate | Structural checks, secret scan and version-specific parameter review; disclose gaps | Available `validate_workflow` / `validate_node_config`, plus structural review |
| Save | Authorized documented API create/update; inspect published-target impact first | Authorized available create/update operations; verify draft/live semantics |
| Read back | GET the saved workflow and compare wiring, layout, settings and intended fields | `get_workflow_details` and the same comparison |
| Credentials | Owner verifies exact IDs/types/resources in UI where API discovery is unavailable | Available credential/resource metadata tools, followed by deliberate verification |
| Test | Local mocks, documented installed-version execution mechanisms or UI tests | Supported pinned-data tools; inspect unpinned side effects |
| Inspect results | Read-only execution API with pagination and coverage limits | Available execution search/detail tools |
| Export | Shared exporter with immutable source installation UID | Same exporter; MCP does not replace binding |
| Publish | Separate explicit authorization for the workflow and documented operation | Separate explicit authorization for the workflow and available publish tool |

MCP tool names are not REST endpoints. Do not fabricate SDK validation, credential discovery,
pin-data or history capabilities in API mode. Upstream documentation is not proof of the
installed version. Use [the API procedure](../Skills/n8n-workspace-access/references/API.md).

A successful save proves persistence, not a working automation. Published-target edits may
change live behavior; inspect the actual version/method before claiming an update is draft-only.
When live changes are not authorized, prepare a local file or an explicitly authorized separate
unpublished candidate. Preserve supported fields and report payload fields a method cannot save.

## Authorization and evidence

Read-only inspection and local preparation are appropriate within the requested scope. Remote
writes, production tests, messaging/client writes, publish/unpublish, archive and Git actions
need explicit authorization for their actual effect. Existing explicit approval remains valid;
ask only when the scope or effect is missing or ambiguous. Follow the project's additional rules.

Do not blindly retry an uncertain create, run or restore. Read back/reconcile the result first.
Never infer approval from a read-only connection check. No `$env`/`$vars` in workflows; secrets
belong in n8n credentials, and API keys stay in private configuration.

Label proof as local inspection, structural validation, mock/pinned test, live save verification
or live execution. Report missing checks and history gaps. Export kept changes with CHANGELOG
and affected specs/architecture/handover docs, without claiming untested go-live readiness.

## Skills and hooks

Load the workspace router plus the task skills needed now. In MCP mode also load the official
router; keep vendored skills unchanged. Read files directly when the agent has no Skill tool.
The skill junctions are recreated by `node scripts/link-skills.mjs`.

Claude Code loads `.claude/settings.json`. Session-start hooks point to workspace rules;
PreToolUse guards match configured **MCP** tools, and the export reminder tracks MCP activity.
They do not intercept shell HTTP clients, arbitrary scripts or Codex tool calls. These reminders
are not automatic enforcement for API writes. API agents must use the authorization/read-back
procedure above and their tool permission controls. Do not add broad shell approval prompts or
silently install an MCP connection to compensate.

## Session records

Keep project specs and supported operating instructions current. Preserve the owner's brief.
Store audit reports, approvals, implementation plans and rollout evidence in the external private
history configured by `AGENTS.local.md`; public docs describe behavior without private audit IDs
or report links. End with what changed, which verification ran, and what remains on the owner's side.
