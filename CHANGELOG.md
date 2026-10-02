# Changelog

## [0.2.1] — 2026-10-02

- Add persistent Pause / Resume controls per n8n instance, retaining API keys, identity, preferences and execution history.
- Block paused-instance requests and remote actions, cancel outstanding work, and discard stale results across pause/resume. Other instances keep syncing; Resume restores normal scheduling.
- Keep historical statistics and logs visible while suppressing paused-instance health and recent-failure alerts. n8n workflows and the shared event inbox continue running.
- Make per-workflow Stop tracking record no new executions, statistics, captures or health updates; preserve existing history unless explicit cleanup is selected. Remove the bulk logging-off control.
- Add migration, cancellation and browser coverage, and update the app README and operating guide.

## [0.2.0] — 2026-10-01

- Add a confirmed bulk action to turn off detailed workflow logs in the selected instance scope while preserving existing logs and other preferences.
- Hide workflows with logging off from default Overview statistics and recent failures. Add Show all statistics for minimal observed outcomes without re-enabling detailed logs.
- Make successful and failed chart segments, legend labels and table counts open filtered execution Logs. Daily segments preserve the UTC date; failed includes errors and crashes.
- Link recent failures to their exact execution across instances and pagination, with a subtle one-second highlight and reduced-motion support.
- Document logging controls, statistics visibility and navigation in the app README.
