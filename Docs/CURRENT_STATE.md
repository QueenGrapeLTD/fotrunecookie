# Current State

Updated: 2026-08-29.

- Project-scoped custom agent roles: configured in `.codex/agents/`.
- Repository operating rules: configured in `AGENTS.md`.
- Forensic runtime map: complete.
- Active displayed-result paths: 2.
- End-user generator bodies including dead legacy: 3.
- Total generation workflows including admin drafting: 4.
- Remote AI fields: sanitized optional name, zodiac, rising sign, category, timezone ID, language, and request ID; raw birth/location data are omitted.
- Language: used during generation, immediately persisted, protected against stale hydration, and behaviorally guarded for all ten supported locales.
- Firebase initialization: one client instance and one Functions runtime instance; no duplicate initialization found.
- Confirmed audit P0/P1 recovery groups: implemented and documented in `AUDIT_REPORT.md`.
- Baseline before recovery: 79 root + 5 Functions tests passing. Final recovery suite: 103 root + 5 Functions tests passing, plus production and hosting builds.
- Production data/deployment inspection: not performed.
- P0/P1 implementation: applied in three bounded specialist packages plus the final AI validator correction.
- Independent QA: PASS WITH WARNINGS. All 12 acceptance tests pass in deterministic repository-local scope.

Warnings: real-model cultural naturalness, browser/physical-device integration, and the authenticated profile identity/rules transition were not exercised. Staged App Check rollout and documented P2/P3 cleanup remain outside this bounded recovery pass.
