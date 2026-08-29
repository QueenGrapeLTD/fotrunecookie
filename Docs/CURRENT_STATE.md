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
- Premium-only cookie stages now add a brief opening burst and restrained gold, coral, pink, and cyan sparkle accents. Decorative effects are hidden from accessibility APIs, honor reduced-motion preferences, and do not alter free/rewarded behavior or the approved layout. Root tests: 118/118; Functions tests: 13/13.
- The approved cookie artwork, crack/opening stages, inline preparation copy, and sparkle treatment are now account-neutral. Verified Premium remains a separate entitlement state and is shown by a green `Premium ✓` control; free/rewarded quota, ad-credit, paywall, and generation rules are unchanged.
- The landing viewport now subtracts the measured adaptive native-banner reserve and the active transient-status reserve. This keeps the rewarded CTA and preparation/error copy above the banner without double-counting the platform safe area or adding Premium-only whitespace. Root tests: 120/120; Functions tests: 13/13; production build and native sync pass.
- Android release `1.0.27` (`versionCode 29`) was packaged successfully as a signed App Bundle from the synchronized native project. Emulator captures at 1280×2856 verify the approved universal cookie landing, second-tap crack state, and result presentation without banner/content overlap.

Warnings: the physical verified-premium phone was not visible to ADB during final QA. The final post-fix Android Studio Run screenshot was interrupted by the user's physical Escape input; banner geometry was verified from the live WebView measurements and deterministic layout guards. The emulator Google sign-in `-10` is caused by its local debug signing SHA-1 not being registered in the Firebase Android OAuth client. Store publication remains blocked on a real-device end-to-end run and refreshed Firebase debug OAuth configuration.
