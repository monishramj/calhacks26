# spacetimedb

**Owner:** ws/state (C2) · **Gates:** G3, G8 backend · **Spec:** §9, §17 "Commands and adapter", §20 G3

The one authoritative local backend: reports, incidents, relations, proposals, jobs, review events, scenario state. It provides reducers and subscriptions.

- **No model calls inside reducers.** The coordinator runs models and submits results through reducers (§9).
- Approval validates the run, every referenced revision, `inputSignature`, and source ownership atomically. Repeated `commandId`s return the recorded result. Workers can't approve.
- Future scenario truth is never in a client-visible table.
- Pin the server/client pair after preflight. Generated client bindings are committed by ws/state only.
- Indexes only where the actual queue, incident-source, identity, and job lookups need them. No event-sourcing framework or distributed queue (§17).
