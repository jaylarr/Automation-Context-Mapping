# Project visuals

Control Center reads an optional `assets/diagrams/overview.json` in each project. One shared renderer displays a dedicated, expandable **How it works** section inside opened regular and workflow-audit projects. Visuals do not appear on cards in the Projects list. Agents maintain the JSON, without changing application code for each project. Refresh/navigation reads new data; an already open page does not automatically regenerate or reload it.

Visuals summarize major business stages, rather than reproduce every n8n node. They describe a planned design, saved workflows, an audit original or a reviewed version. They are never live execution/publication indicators. Source hashes detect changed local evidence; they do not prove the interpretation is correct.

## Agent procedure

Load [project-visuals](../Skills/project-visuals/SKILL.md), read the project's own guidance and evidence, choose a supported layout and prepare a candidate outside the project repository. Get source descriptors and check the existing visual revision before writing:

```text
node scripts/project-visuals.mjs sources --project <slug> --file documentation/architecture.md --file workflows/01-main.json
node scripts/project-visuals.mjs check --project <slug>
node scripts/project-visuals.mjs validate --project <slug> --input <absolute-private-candidate.json>
node scripts/project-visuals.mjs write --project <slug> --input <absolute-private-candidate.json> --expected-revision <sha256-or-missing>
node scripts/project-visuals.mjs check --all --include-archived
```

`sources`, `validate` and `check` are read-only. `write` needs task authorization for the derived asset; it validates sources again and uses a cooperative lock, expected revision and atomic promotion. `missing` is the expected revision for first creation. A conflict or invalid candidate leaves the existing asset intact. A substantive no-op preserves its original generation timestamp. Do not bypass a lock: after a crash, first verify that no writer remains before manually removing `assets/diagrams/.project-visual-write.lock`.

CLI output is structured JSON, with no source file contents. Exit codes: 0 valid/current/missing; 2 invalid/unsupported saved assets; 3 stale/unavailable source checks; 1 command/write errors. A source validation conflict can also return 3. `--workspace <directory>` is available for disposable test workspaces. The CLI never calls n8n, executes workflow code or commits files.

Normal asset creation/update and its scoped CHANGELOG entry require authorization. A read-only workflow audit remains limited to private reports; it may propose a visual there. Generating its project JSON is a separately authorized derived-asset task. Neither permits original/context edits or live actions.

## Version 1 format

Use UTF-8 JSON (two-space indentation plus trailing newline), up to 64 KiB. Unknown keys are rejected. Required root fields:

| Field | Contract |
|---|---|
| `schemaVersion` | Exactly `1`; newer versions are reported unsupported. |
| `projectSlug`, `projectKind` | Actual folder slug (kebab-case, at most 40 chars); kind `automation` or `workflow-audit`. |
| `title`, `summary` | Plain text, 1–70 and 1–200 characters respectively. |
| `layout` | `pipeline`, `branching`, or `system-map`. |
| `basis` | Automation: `saved-workflows`, `approved-design`, or `client-brief`; audit: `audit-source` or `reviewed-version`. Brief-only concepts must cite `client-brief/brief.md`, use design evidence, and label unbuilt stages planned. |
| `generatedAt` | ISO timestamp with an explicit offset or `Z`, recording generation rather than test success. |
| `evidence` | `{level, note, recordedAt}`; note 1–240 chars. Levels: `design`, `static`, `mock`, `controlled-live`, `production`. Date is null for design/static, otherwise documented `YYYY-MM-DD`. Approved design requires design evidence; original audits require static evidence. |
| `sources` | 1–16 unique `{id, path, sha256}` descriptors. IDs kebab-case, max 40 chars; path canonical project-relative; SHA-256 is exact file bytes, 64 lowercase hex chars. |
| `preview` | `{stageIds: [...]}`: 2–4 unique IDs on a directly connected path. Branch previews run from the root through the decision. |
| `stages` | 2–16 stage objects, with tighter layout limits below. |
| `edges` | 1–24 edge objects. |

Each stage has `{id, label, detail, icon, role, state, sourceIds}`. Label/detail limits are 48/280 chars. IDs are unique kebab-case up to 40 chars. Roles: `input`, `process`, `decision`, `storage`, `output`, `review`. States: `present`, `planned`, `conditional`, `unknown` (presence in the described source/design, not runtime state). `sourceIds` cites 1–4 existing unique source IDs.

Icon keys: `form`, `webhook`, `file`, `search`, `ai`, `database`, `sheet`, `mail`, `decision`, `check`, `alert`, `person`, `clock`, `report`, `folder`, `review`. These select finite application icons; no URL, component name, HTML, SVG, CSS or script fields are supported. Text renders literally.

Each edge has `{from, to, kind, label?}`. Endpoints must exist and differ. Kind: `flow`, `condition`, `exception`. Optional labels are 1–48 chars; condition labels are required. Duplicate relations and graph cycles are rejected. All stages must be connected within the supported layout.

| Layout | Constraints |
|---|---|
| Pipeline | 2–8 ordered stages, exactly the adjacent flow chain, no decision stage. |
| Branching | A DAG with one root and at least one decision with two labeled condition outcomes; at most six depth levels, four stages per level and 16 total. Convergence is supported. |
| System map | 3–12 stages, at least one input, exactly one central process and at least one storage/output/review destination. Edges connect inputs → process → destinations. |

Group retries and secondary exceptions into detail text rather than add unsupported cycles. Short project labels and meaningful grouping make the layouts readable. See [fictional examples](../Skills/project-visuals/references/examples.md).

## Sources and protection

Automation sources: README, AGENTS, `client-brief/brief.md`, Markdown under `documentation/`, JSON under `workflows/` except `*.raw.json`, and `test-results/<run>/result.md`. Saved-workflow summaries require a saved workflow reference; approved-design summaries require an approved architecture/spec source. Brief-only concepts use `client-brief` and planned stages. Empty template briefs do not justify a diagram.

Audit sources: README, AGENTS, `audit-project.json`, `context/README.md`, registered checked extracts in `context/files/`, project Markdown documentation, and originals/versions explicitly registered in the audit manifest. Originals/versions/extracts must also match their registered hashes. Cite originals for `audit-source`, approved registered versions for `reviewed-version`. Never mix modified and original behavior without declaring the basis.

Briefs and project instructions establish requirements and constraints, not runtime proof. Mock/live/production levels need a referenced documented result that supports the date and scope. The validator enforces source shape/presence; the generating agent must check meaning. Rendered wording says **Recorded evidence**, not currently running.

Source reads are capped at 10 MiB per workflow JSON, 2 MiB per text/metadata file and 20 MiB aggregate. Paths cannot escape the project, traverse directories, address hidden/private storage, use URLs, drives/UNC paths or linked project/asset/source directories. Credentials, databases, website code, attachment originals and private reports are excluded. Manifests are scanned for secrets before display/save. Do not put real applicant/customer content, mail addresses or private service identifiers in summaries.

The Projects list does not load visual assets. Detail pages and CLI checks verify source fingerprints. Missing assets show a compact prompt option inside the opened project; invalid assets do not render. Unsupported versions are not rewritten. Changed/missing/oversized evidence is clearly marked without automatically repairing or changing project files. Visual updates do not alter the existing project sort timestamp.

## Tests and operation

```text
cd app
node --test src/lib/project-visuals.test.mjs
npm run typecheck
npm test
npm run build
```

From the root, run `node scripts/check-skills.mjs` and `node scripts/project-visuals-browser-tests.mjs --artifacts <private-or-temporary-directory>` for isolated browser fixtures. Add `--project-samples` to copy the CRM, HR and finance visual sources into that disposable workspace for local UI checks. Provider networking is disabled, and owner project folders are read-only during browser checks. These checks provide local evidence, not native n8n proof. Follow the normal operating guide and approval rules when promoting an application build. Later data-only visual updates need only validation/readback and a page refresh.

Removing a derived visual restores the missing state; source docs/workflows remain intact. Older app versions ignore these optional assets. Arbitrary illustrations, new layout types, live overlays, background generation and image APIs require their own scoped application work.
