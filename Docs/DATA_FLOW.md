# Data Flow

Status: Recovery implementation baseline as of 2026-08-29.

## Profile and request

`index.html inputs`
-> profile draft in `main.js`
-> committed owner-scoped profile via Capacitor Preferences
-> registered profile at `users/{uid}`
-> force-fresh owner hydration gate
-> immutable `{auth, owner, language, profile}` request context
-> `callGenerateFortuneCloudFunction()`
-> `generateFortune`
-> stale-context revalidation
-> result UI/local history
-> optional canonical registered-user history

## Remote field matrix

| Profile input | Free curated | Remote AI |
| --- | --- | --- |
| Name | May be prepended locally | Sanitized, sent, and required once when supplied |
| Category | Selects local pool | Sent and used |
| Zodiac | Ignored | Sent and used when valid; absent stays neutral |
| Rising sign | Ignored | Sent and used when valid |
| Timezone ID | Ignored | Sent; derives local date |
| Selected language | Selects local pool | Sent as `lang`; prompt and validators use it |
| Birth date/time/place | Only indirect calculations | Raw values not sent |
| Coordinates/offset | Only indirect rising-sign calculation | Not sent |

Lucky numbers are generated after the fortune text and never influence AI generation.

## Persistence

- Profile: owner-scoped local Preferences; registered users sync to `users/{uid}`.
- Local history: `localStorage` plus a Capacitor Documents mirror, capped at 100 per owner.
- Canonical registered-user history: `users/{uid}/fortunes/{requestId}`.
- AI novelty memory: private `_ai_history/{uid}` state, never returned as visible history.
- Free/rewarded visible history: device-local; rewarded AI still uses private novelty memory.

## Recovery status

- Resolved: `requestId` is the stable local/cloud identity and merge preserves richer local metadata while collapsing legacy duplicates.
- Resolved: authenticated clear-history removes canonical and private novelty records independent of premium cache state.
- Resolved: premium metadata enrichment uses explicit per-request persistence intent.
- Legacy reflection/reaction fields may round-trip for compatibility, but no active UI writes or renders them.
- Resolved: historical sharing copies the selected fortune's quote, lucky numbers, and generation metadata without relying on reflection-only identifiers.
- Resolved: completion request state and canonical premium history commit in one batch; novelty memory is written only afterward.
- Resolved: generation waits for owner-specific fresh hydration and is bound to immutable auth/language/profile context.
- Resolved: profile edits are draft-only until Save and dependency changes clear/recalculate zodiac/rising sign.
- Remaining P1 candidate: the profile identity-field/rules transition mismatch needs a focused authenticated integration test.
- Remaining P2: timezone/day-boundary conventions, guest-history ownership on shared devices, and lack of a checked-in emulator/dev-data boundary.

## Compatibility constraints

- Continue reading old direct-history documents with empty metadata.
- Deduplicate existing timestamp-based local IDs by `requestId` where available; do not destructively rewrite them during ordinary app startup.
- Optional legacy reflection fields require no migration and remain accepted so existing documents can still be updated safely.
- Do not mass-recalculate stored rising signs.
