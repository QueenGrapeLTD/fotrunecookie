# Fortune Engine

Status: Repository-verified baseline as of 2026-08-28.

## Final displayed-text path

All normal requests converge at `main.js:renderFortuneResult()`, which assigns `fortuneQuoteText.textContent`.

Three taps call `crackCookie()` through `main.js:registerCookieTap()`. `crackCookie()` verifies account state and selects one of two active paths.

### Free curated path

`main.js:crackCookie`
-> `fortunes.js:getRandomFortune`
-> localized `fortunesData.js` or a legacy local custom override
-> `fortuneSelection.js:chooseNonRepeatingFortune`
-> `aiEngine.js:generatePersonalizedAIFortune`
-> `main.js:renderFortuneResult`

The name can be prepended locally. Zodiac and rising sign do not influence curated selection.

### Premium/rewarded AI path

`main.js:crackCookie`
-> `aiEngine.js:fetchRemoteAIPrediction(requireRemote: true)`
-> `firebaseService.js:callGenerateFortuneCloudFunction`
-> callable `functions/index.js:exports.generateFortune`
-> quota/idempotency reservation
-> `buildLocalizedFortunePrompt`
-> Gemini provider loop
-> server validation
-> completion/history writes
-> client safety/language validation
-> `main.js:renderFortuneResult`

The active AI prompt owner is `functions/index.js:buildLocalizedFortunePrompt`.

## Implementation count

- 2 active end-user displayed-result paths: free curated and remote AI.
- 3 end-user generator bodies when the unreachable `legacyGenerateFortune` is counted.
- 4 total generation workflows when admin-only `adminGenerateFortuneDrafts` is counted.
- `buildFortunePrompt` is an orphan prompt helper, not a complete generator.
- `fetchRemoteAIPrediction` contains a dormant local fallback branch, but both current UI callers pass `requireRemote: true`.

## Remote context

The wire request includes a sanitized optional name, zodiac, rising sign, category, timezone ID, selected language, and request ID. The server also derives local date, private recent AI novelty history, a randomized recipe, and a UID/request-derived variation key.

The wire request omits raw birth date/time, birthplace, country/city/region, coordinates, and timezone offset. Birth data matters only through locally derived zodiac/rising sign; on iOS both are deliberately removed and the server uses neutral, non-astrological context.

## Recovery status

- Resolved: absent/invalid zodiac remains unavailable; neutral requests do not infer Aries or any sign.
- Resolved: the optional sanitized name reaches the active prompt and is enforced exactly once by server/client validation.
- Resolved: premium and rewarded AI share private non-repetition memory without exposing it as user-visible history.
- Resolved: Latin-language guards reject marker-free English for non-English Latin locales; ten-language fixtures and the curated library are tested.
- Resolved: `fortunesData.js` has exact 160-message parity with its declared source.
- Resolved: client/server validators reject unresolved placeholders and frightening accident/death terms across all ten languages.
- Remaining P2/P3: inactive legacy generator, orphan prompt helper, dormant optional fallback, and legacy local content override remain until decommissioning tests approve removal.

## Target authority

Keep entitlement routing, but make ownership explicit:

`Validated request snapshot -> one curated selector OR one server AI generator -> validated result -> one render/save contract`

Remove legacy/dead implementations only after behavior tests prove they have no callers.
