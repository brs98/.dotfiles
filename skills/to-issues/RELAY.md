# Relay destinations

- Treat unresolved HITL questions as shaping work, not delivery slices. Return
  them to Wayfinder before creating Relay tickets.
- Keep the proposed-breakdown review, but every accepted Relay slice must be AFK
  and independently reviewable in exactly one repository.
- Invoke `write-factory-ticket` for each accepted slice. Generate its body from
  Relay's current template, copy all binding source decisions into the ticket,
  and validate it with `relay ticket check`.
- Create new delivery issues rather than repurposing Wayfinder decision tickets.
  Do not make delivery issues children of the Wayfinder map or copy
  `wayfinder:*` labels onto them.
- Publish delivery tickets ungated and in Triage. Apply Relay's configured gate
  and Todo state only when the user explicitly asks to enqueue or hand off the
  validated tickets.
- Keep native blocking relations authoritative. At enqueue time, a delivery
  ticket may have at most one open blocker until Relay supports multi-parent
  dependency execution.

Do not use the generic `## What to build` template for a Relay destination; it
does not satisfy `relay.ticket/v1`.
