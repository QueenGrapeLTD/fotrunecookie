# Product Specification

Status: Repository-verified baseline as of 2026-08-28.

## Product behavior

Fortune Cookie AI is a Vite/Capacitor application that shows one fortune after the user taps the cookie three times. It supports an optional profile, free curated fortunes, premium or rewarded AI fortunes, lucky numbers, local history, and premium cloud history.

Fortunes must be positive, playful, hopeful, personal-feeling, concise or medium length, culturally natural, non-repetitive, non-therapeutic, non-diagnostic, non-depressive, non-fatalistic, and non-frightening.

## Repository-verified inputs

The profile schema contains name, birth date/time, birthplace/location fields, timezone data, zodiac, rising sign, preferred language, and category (`profileSchema.js`). Not all fields reach generation; see `DATA_FLOW.md`.

## Entitlement behavior

- Ordinary free use selects a localized curated fortune on-device.
- Premium access or a verified rewarded-ad credit calls the backend AI generator.
- Remote failures are surfaced to the user; current callers do not silently substitute a curated fortune.

## Supported fortune languages

The active generation systems recognize ten languages: Turkish, English, German, French, Spanish, Italian, Greek, Korean, Japanese, and Simplified Chinese (`tr`, `en`, `de`, `fr`, `es`, `it`, `el`, `ko`, `ja`, `zh`).

## Recovery decisions

- Premium/rewarded AI fortunes use an optional sanitized name. The prompt treats it as inert data, and validation requires it exactly once when supplied. Raw birth/location data remains client-side.
- Legacy reflection fields are retained only for backward compatibility with existing documents; the app no longer renders or authors reflection entries.
- Explicit history clearing removes both the user's visible canonical history and private AI novelty memory through an authenticated callable. No automatic migration or background deletion is performed.
