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

## Premium presentation recovery — 2026-08-29

- The verified-premium landing presentation now follows the approved art-director composition with separate intact, second-tap crack, and opening/loading artwork.
- Premium-only presentation state owns its inline copy and status card; free and rewarded entitlement, quota, ad-credit, paywall, and fortune-selection branches are unchanged.
- The unintended reflection popup remains absent from the active result flow.
- The result presentation uses the approved larger Japanese grandmother artwork, double-bordered message card, compact lucky-number tiles, and minimal restart/story actions.
- Native staging is synchronized for Android and iOS. Root tests: 117/117. Functions tests: 13/13. Production build, mobile configuration check, and App Store blocker check pass.
- Independent `FORTUNE-QA`: PASS WITH WARNINGS. Emulator idle/crack/opening/result screenshots were visually verified and did not overlap.

Warning: the physical verified-premium phone was not visible to ADB during final QA. Premium presentation was exercised through the debuggable emulator DOM without changing account, billing, entitlement, or quota data. Store publication remains blocked on one real premium-device end-to-end run.
