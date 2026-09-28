# n8n workflows for the Control Center

Import these into your n8n instance (**Workflows → Import from File**).

| File | What it does |
|---|---|
| `report-event-to-control-center.json` | Sub-workflow that sends an event (level, message, project, workflow, data) to the Control Center's event inbox. Call it from any workflow with an Execute Workflow node, with "Wait for Sub-Workflow Completion" off. It returns `{ok, eventId}` or `{ok: false, error}` and never throws. |

After importing:

1. Create an n8n credential of type **Header Auth** named `Control Center ingest`. Set Name to
   `x-ingest-token` and Value to the token from the Control Center's **Settings → Webhook event
   inbox**. Select it on the "Send event to Control Center" node.
2. The URL is `http://host.docker.internal:3100/api/events`, which works when n8n runs in Docker on
   the same PC as the app. Change it if your setup differs.
