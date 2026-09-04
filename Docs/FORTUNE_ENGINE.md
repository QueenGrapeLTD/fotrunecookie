# Fortune Engine

Status: Repository-verified baseline as of 2026-09-04.

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
-> independent structured Gemini quality judgment
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

The wire request always includes a sanitized optional name, category, selected language, and request ID. The profile UI keeps astrological personalization collapsed and optional by default. If `astrologyOptIn !== true`, the adapter sends zodiac, rising sign, and timezone ID as empty strings; the request still follows the normal premium/rewarded AI path with neutral, non-astrological context.

With explicit opt-in, the wire may additionally include a Sun sign derived from a valid birth date, a rising sign that was either calculated from complete inputs or manually selected, and a timezone ID used to derive the local date. `risingSource` records `calculated` or `manual` provenance in the profile but is not sent to generation. The wire always omits raw birth date/time, birthplace, country/city/region, coordinates, and timezone offset. Android, iOS, and web follow the same contract.

This is not a full natal chart. The active prompt can use broad Sun/rising themes implicitly, but it receives no houses, degrees, aspects, Moon sign, planetary positions, or transits. The server also derives private recent AI novelty history, a randomized recipe, and a UID/request-derived variation key.

## Recovery status

- Resolved: absent/invalid zodiac remains unavailable; neutral requests do not infer Aries or any sign.
- Resolved: `astrologyOptIn` defaults to false and must be the exact boolean `true`; empty profiles and legacy records containing astrology fields do not silently opt in.
- Resolved: rising-sign provenance is explicit in the stored profile (`manual` or `calculated`) without expanding the AI wire contract.
- Resolved: the optional sanitized name reaches the active prompt as inert data. A fortune may omit it; if used, server/client validation allows the exact name at most once.
- Resolved: premium and rewarded AI share private non-repetition memory without exposing it as user-visible history.
- Resolved: Latin-language guards reject marker-free English for non-English Latin locales; ten-language fixtures and the curated library are tested.
- Resolved: `fortunesData.js` has exact 160-message parity with its declared source.
- Resolved: client/server validators reject unresolved placeholders and frightening accident/death terms across all ten languages.
- Resolved: stock positive words and blanket grammatical-negation matching are no longer hard delivery requirements. Length, language, placeholder, fear, discouraging/gloomy premise, question, directive, sharing-bait and novelty gates remain deterministic; semantic positive tone is judged in context. No failed candidate is delivered through a weaker "best safe" bypass.
- Resolved: Turkish negative-aorist scanning excludes only the already-sanitized exact personal-name token, so surnames such as Yılmaz remain usable while negative verbs in the message body are still rejected. Locale-specific "impossible" outcomes remain discouraging in all ten languages.
- Resolved: prompt and judge share three authentic Fortune Cookie archetypes: a hopeful near-future possibility, a lucky present-direction observation, or a playful recognition with warm surprise. The judge receives only candidate, language/locale and optional sanitized expected name; its structured result is never displayed.
- Resolved: generation is limited to three attempts. Each generation has an 8-second total model deadline and each judge call a 4-second deadline, keeping the worst planned model budget at 36 seconds, below the client's 42-second and callable's 45-second hard limits so entitlement release can run. Malformed/rejected candidates still follow the observable release plus `unavailable` path.
- Resolved: the prompt targets at most 160 Unicode characters without asking the model to pad shorter natural messages. Delivery accepts a validated result up to the hard 200-character ceiling. Hard safety, language, directive, sharing-bait and novelty gates still run before the semantic judge; this separation prevents a safe original result from failing merely because the model modestly overshoots its generation target.
- Resolved: exhausted quality attempts return an observable `quality-exhausted` error detail, distinct from provider unavailability. Local rejection logs expose delivery-length, language, directive and sharing-bait decisions without logging the private candidate text.
- Resolved: premium client retries retain the same context-bound `requestId` across aborted, unavailable, network and client-timeout outcomes. A later retry can recover an idempotently completed server result without reserving another premium use; success and terminal/context-changing outcomes clear it. Rewarded/free routing is unchanged.
- Remaining P2/P3: inactive legacy generator, orphan prompt helper, dormant optional fallback, and legacy local content override remain until decommissioning tests approve removal.

## Target authority

Keep entitlement routing, but make ownership explicit:

`Validated request snapshot -> one curated selector OR one server AI generator -> validated result -> one render/save contract`

Remove legacy/dead implementations only after behavior tests prove they have no callers.
