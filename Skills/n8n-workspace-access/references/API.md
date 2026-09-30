# Public API procedure

Use this for API-based agent work. The app already has its own server-side API client;
this guide does not add agent HTTP-write tools or permission enforcement.

1. Resolve the intended instance and immutable installation UID from project records and
   Control Center Settings. Verify the URL and workflow identity by a read-only request.
   Keep the key in private configuration, never command arguments, console output or notes.
2. Consult the installed version's documented API/schema. Start with the official
   [authentication guide](https://docs.n8n.io/connect/n8n-api/authentication) and
   [public API source](https://github.com/n8n-io/n8n/tree/master/packages/cli/src/public-api).
   Current upstream source is a reference, not proof that the installed version supports an endpoint.
3. Use server-side requests to `<base-url>/api/v1`, with `X-N8N-API-KEY` from private
   configuration. Inspect permissions, pagination and timeouts. Follow returned cursors when
   listing workflows/executions; disclose truncated history, permissions and missing records.
4. For a change, fetch the exact current JSON and published state. Prepare a local comparison
   of the requested change. Use only fields accepted by that version's create/update schema;
   GET metadata and saved exports are not automatically valid write payloads. Separate tags,
   description and other unsupported fields rather than silently dropping intended changes.
5. Validate locally: JSON shape, unique node IDs/names, connection targets, expressions,
   credential references, sections, supported settings and absence of hardcoded secrets.
   Check exact node parameters against version-specific node docs/source or a verified export;
   never invent a node-type discovery or credential-list endpoint. The owner may need to
   verify credentials/resources in the n8n UI. Local checks do not replace runtime testing.
6. Before mutation, confirm existing authorization covers the actual target and effect.
   Updates to a published target can be live changes. Prefer a separate unpublished candidate
   when live edits have not been authorized. Creating that candidate is itself a remote write.
7. After an authorized save, GET the target again and compare IDs, wiring, coordinates,
   settings and intended behavior fields. An uncertain response requires read-only
   reconciliation, not blind retries. Check the actual published state separately.
8. Tests use supported documented mechanisms or the n8n UI. Do not invent REST equivalents
   for MCP SDK validation or pinned-data tools. Real webhooks, execution retries, subworkflow
   calls and credentialed actions can produce effects; use mocks/local fixtures when appropriate
   and get explicit authorization for live effects. Export verified changes using the source UID.

On 401/403, report the permission problem without printing response bodies containing private
data. On missing endpoints, establish the installed version/capability rather than trying private
editor endpoints or changing transport to bypass authorization.
