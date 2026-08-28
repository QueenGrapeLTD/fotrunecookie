# Localization

Status: Recovery implementation baseline as of 2026-08-29.

## Supported locales

The fortune paths support `tr`, `en`, `de`, `fr`, `es`, `it`, `el`, `ko`, `ja`, and `zh`.

## Generation behavior

Selected language affects generation, not only UI:

- The free path selects the corresponding curated language pool.
- The AI request snapshot sends the selected language as `lang`.
- The backend maps `lang` to a locale/cultural profile and instructs Gemini to think and write directly in that locale, avoid translated idioms, and follow locale-specific rhythm and address.
- Server and client guards validate the returned text.

This is not an English-first translation pipeline.

## Recovery status and remaining gaps

- Resolved: explicit language selection persists immediately to the owner-scoped profile and registered cloud profile with sequencing protection; hydration cannot overwrite a newer same-owner selection.
- Resolved: Latin-script guards reject marker-free English for Turkish, German, French, Spanish, and Italian; server/client parity and all ten language fixtures are tested.
- Resolved: in-flight results are rejected if language changes before render/save.
- Resolved: unresolved placeholders and localized frightening accident/death terms are rejected before display.
- Remaining P2: many non-fortune UI/error/auth/purchase/history/accessibility strings remain hard-coded Turkish.
- Remaining P2: independent zodiac catalogs have drifted in localized spellings.
- Remaining P3: a hard-coded Turkish last-resort curated fortune can leak if active/custom content is structurally incomplete.

## Required QA

- Test every supported locale with locale-specific fixtures, not only script detection.
- Confirm a changed language survives restart and auth hydration.
- Confirm an in-flight result cannot render under a different selected language.
- Reject mixed-language output, untranslated idioms, placeholders, and frightening content.
- Real-model cultural naturalness remains a live-evaluation concern; deterministic tests cover the contract, not model distribution.
