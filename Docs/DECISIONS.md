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

## D-005 — Missing astrology is neutral

Status: Accepted and implemented.

An absent/invalid zodiac means no zodiac context. It must never default to Aries. This preserves the tested astrology-free iOS behavior.

## D-006 — Name personalization contract

Status: Accepted and implemented.

Transmit only a sanitized optional name, treat it as inert prompt data, and require it exactly once in validated output. Do not transmit raw birth or location fields.

## D-007 — Reflection ownership

Status: Superseded by D-008.

Reflection fields were cross-device for registered users through optional validated fields.

## D-008 — Remove reflection journal from the product

Status: Accepted and implemented.

The result card and history UI do not expose reflection reactions, notes, journal metrics, or saved reflection text. Existing reflection fields remain accepted and preserved only for backward compatibility; no user data is deleted and no new reflection entries are authored.
