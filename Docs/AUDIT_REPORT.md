# Audit Report

Status: Completed read-only forensic baseline on 2026-08-28. Production deployment state and production data were not inspected.

## Executive findings

- Static evidence P0: no immediately reproducible app-wide outage. One request-context invariant was classified P0 by the data specialist because an account switch during an in-flight request can cross persistence ownership; production reachability remains unverified, so Lead treats it as highest-priority P1 until behaviorally reproduced.
- Confirmed P1 issue groups: 12 (some findings share one root cause and recovery patch).
- Active displayed-result paths: 2.
- End-user generator bodies including dead legacy: 3.
- Total model/content generation workflows including admin drafting: 4.
- Existing test result before recovery: 79/79 root tests and 5/5 Functions tests passed.

## Exact answer: how the final text is produced

Third tap -> `main.js:crackCookie()` -> entitlement branch.

- Free: `getRandomFortune()` -> localized curated data/non-repeat selector -> local name personalization -> `renderFortuneResult()`.
- Premium/rewarded: remote adapter -> Firebase callable `generateFortune` -> idempotency/quota -> locale prompt -> Gemini candidates -> server validation -> client validation -> `renderFortuneResult()`.

Both assign the displayed text only at `main.js:fortuneQuoteText.textContent`.

## Exact answer: generator count

- 2 active user-facing paths.
- 1 unreachable legacy end-user callable body.
- 1 admin-only draft generator.
- 1 orphan prompt builder and 1 dormant local fallback branch, neither active displayed-result generator.

## Exact answer: data reaching AI

Remote AI receives a sanitized optional name, zodiac, rising sign, category, timezone ID, selected language, and request ID. It does not receive raw birth/location inputs. The server adds private novelty history, local date, recipe, and a UID/request variation key.

## Exact answer: language

Language is used during both curated selection and AI prompt construction. It is not UI-only. Selection now persists with sequencing protection, stale-context results are rejected, and client/server validators cover all ten supported locales with deterministic fixtures.

## Baseline P1 findings and recovery status

1. Resolved: missing zodiac is neutral; iOS no longer receives hidden Aries context.
2. Resolved: optional sanitized name reaches the model as inert data; output may omit it and server/client validation permits the exact value at most once.
3. Resolved: immutable auth/language/profile request context prevents cross-owner or stale-context persistence.
4. Resolved: authenticated generation waits for owner-specific force-fresh hydration.
5. Resolved: profile modal edits use a draft and Save clears/recalculates dependent signs.
6. Resolved: explicit language changes persist immediately with precedence sequencing.
7. Resolved: canonical direct documents are the only visible cloud history; `requestId` dedupes local/cloud/legacy copies.
8. Resolved: authenticated clear-history removes visible and private novelty history independent of premium state.
9. Resolved: premium metadata enrichment uses explicit per-request intent.
10. Superseded: the reflection journal UI and its write path were removed; legacy fields remain compatible and stale history IDs are no longer exposed to a reflection action.
11. Resolved for audited blockers: ten-language guards, placeholder rejection, accident/death safety, exact optional-name use, and rewarded novelty memory are deterministic contracts.
12. Resolved: client curated data has exact 160-message source parity.

Web CSP birthplace resolution and partial completion ordering were resolved. The profile identity-field/rules transition mismatch remains an integration-test candidate. Real-model cultural naturalness and physical-device runtime behavior remain unverified without live evaluation.

## P2 findings

- Duplicate zodiac catalogs across UI, astrology, and backend.
- Stale local custom content can override the approved curated bundle.
- Admin-approved content is not part of live free or premium generation.
- Superseded: reflection journal surfaces were removed from the product; optional legacy fields remain accepted only for existing-record compatibility.
- Separate profile writers and timezone/day-boundary conventions can race or disagree.
- Resolved: alternate Vercel/Netlify CSP now allows the two location APIs.
- App Check enforcement is disabled for several core callables during rollout.

## P3/dead code

Confirmed dead or unreachable artifacts include `legacyGenerateFortune`, `buildFortunePrompt`, `getCurrentHourlyTransit`, application-flow `zodiacElements`, `syncFortuneHistoryToCloud`, `saveFortunesDatabase`, an unused `fortunes` import, and stale OpenAI CSP permission.

These artifacts were not deleted during the audit.

## Recovery order and progress

1. Completed: neutral missing-zodiac behavior and immutable user/language/profile request context.
2. Completed: canonical visible history, clear-history, metadata, stable request IDs, and atomic completion ordering.
3. Completed: profile draft/commit and immediate language persistence.
4. Completed: sanitized name personalization and deterministic validation/non-repetition contracts.
5. Completed: curated data regeneration and exact parity test.
6. Completed for repository-local scope: focused recovery tests plus full root/Functions/build verification.
7. Pending P2/P3 cleanup: decommission dead generators, prompts, overrides, and duplicate catalogs only after the final QA pass and a separate scoped cleanup review.
