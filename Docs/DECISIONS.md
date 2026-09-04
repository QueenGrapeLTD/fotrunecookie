# Decisions

## D-001 — Recovery before redesign

Status: Accepted.

Map and prove current behavior before production changes. Preserve working behavior and apply only bounded P0/P1 fixes after audit.

## D-002 — Project-scoped agent configuration

Status: Accepted.

Use supported `.codex/agents/*.toml` custom agents plus root `AGENTS.md`. No project skill is added initially because the roles and durable repository rules do not require a separate reusable workflow package.

## D-003 — Preserve entitlement routing

Status: Accepted.

The free curated path and premium/rewarded remote-AI path are different product tiers, not automatically a duplicate to collapse into one runtime function. Their shared request/result contracts should be authoritative, while dead legacy generators and silent fallback branches should be decommissioned after tests.

## D-004 — Canonical visible cloud history

Status: Accepted and implemented.

Use `users/{uid}/fortunes/{requestId}` as the only user-visible cloud history. Keep `_ai_history/{uid}` internal to AI novelty and never merge it directly into the UI.

## D-005 — Astrology is explicit, optional, and neutral by default

Status: Accepted and implemented.

The astrology section is collapsed by default on every platform. Only the exact boolean `astrologyOptIn: true` allows derived Sun sign, derived or manually selected rising sign, and timezone ID into the AI request. Missing/invalid data, an empty section, or a legacy record without explicit opt-in remains neutral, never defaults to Aries, and still receives ordinary AI generation.

Raw birth date/time, birthplace, country/city/region, coordinates, timezone offset, and `risingSource` never cross the generation boundary. `risingSource` is profile provenance only and must be `manual`, `calculated`, or empty. iOS follows the same contract as Android and web. This feature provides broad thematic personalization, not houses, degrees, aspects, Moon sign, planetary positions, transits, or any other full natal-chart interpretation.

## D-006 — Name personalization contract

Status: Accepted and implemented.

Transmit only a sanitized optional name and treat it as inert prompt data. A result may omit it; if present, the exact sanitized name may occur at most once. This avoids forced, repetitive address while preserving injection and duplication controls. Do not transmit raw birth or location fields.

## D-009 — Bounded premium AI recovery

Status: Accepted and implemented.

Use three candidate attempts with 8-second generation and 4-second judge deadlines (36 seconds maximum), below the 42-second client and 45-second callable hard limits. Preserve quota release on failure, and reuse one context-bound premium `requestId` for retryable client failures so a completed idempotent result can be recovered without another reservation.

## D-007 — Reflection ownership

Status: Superseded by D-008.

Reflection fields were cross-device for registered users through optional validated fields.

## D-008 — Remove reflection journal from the product

Status: Accepted and implemented.

The result card and history UI do not expose reflection reactions, notes, journal metrics, or saved reflection text. Existing reflection fields remain accepted and preserved only for backward compatibility; no user data is deleted and no new reflection entries are authored.
