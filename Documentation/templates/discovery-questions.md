# Discovery Questions

Use on the first client call. Save the answers as `documentation/discovery.md` in the project.

## The problem
1. What process do you want to automate? Walk me through it step by step, the way it happens today.
2. Who does it, how often, and how long does it take?
3. What goes wrong today? (errors, delays, things that fall through the cracks)
4. What does "done well" look like? How will you know the automation works?

## Systems and data
5. Which tools or apps are involved? (CRM, email, forms, spreadsheets, databases, internal tools)
6. Who owns the accounts? Can we get API or admin access, or a service account?
7. Roughly what volume? (records per day, peak times)
8. Is there personal or sensitive data involved? Any compliance requirements (GDPR, HIPAA…)?
9. Are there existing automations (Zapier, Make, scripts) we'd be replacing or touching?

## Triggers and outputs
10. What should start the automation? (an event, a schedule, a person clicking something)
11. What should happen at the end? Who or what gets notified?
12. What should happen when something fails? Who should be alerted, and how?

## Edge cases
13. What are the weird cases? (duplicates, missing info, cancellations, different languages)
14. Is there anything that must **never** happen automatically (needs a human's approval)?

## Logistics
15. Timeline and deadline. Any hard dates?
16. Who approves the spec and signs off testing?
17. Where should this run: our n8n instance or yours?
18. After launch: who maintains it? Do you want a support/maintenance plan?
