# Fortune Cookie AI repository guidance

## Operating model

The primary Codex session acts as `FORTUNE-LEAD`: analyze requests, delegate bounded work to the appropriate project-scoped custom agent, reconcile evidence, constrain changes, prevent unnecessary refactors, and require independent `FORTUNE-QA` review for core-flow changes.

Use these specialists when their scope applies:

- `FORTUNE-CODE-AUDITOR`: first-pass, read-only forensic repository mapping.
- `FORTUNE-AI-ENGINE`: fortune context, prompts, AI calls, parsing, validation, and generation ownership.
- `FORTUNE-DATA`: backend, Firebase when actually present, persistence, state, and history flow.
- `FORTUNE-APP`: frontend/mobile request and rendering flow.
- `FORTUNE-QA`: independent verification; never use it as the fixer.

For recovery work, audit first. Keep read-heavy specialist tasks independent and parallel where practical. Do not let multiple agents edit overlapping files concurrently. Preserve unrelated working-tree changes.

## Product rules

### Simple product

Fortune Cookie AI is a simple product. Prefer minimum moving parts. Do not add microservices, event buses, CQRS, framework migrations, or other architecture without a demonstrated requirement.

### Single source of truth

Maintain one authoritative implementation for user profile, zodiac calculation, fortune context, fortune generation, language selection, API configuration, and backend/Firebase initialization. Treat duplicate active implementations as defects.

### No blind rewrite

Do not rewrite working systems for architectural aesthetics. Prove the problem with file- and symbol-level evidence, then make the smallest necessary change.

### No silent fallback

An AI-generation failure must not silently switch to a legacy fortune engine or stale cached result. Any fallback must be explicit, controlled, observable, and tested.

### No dead systems

Do not leave old and new core implementations active together. Before removal, prove an implementation is unused; document decommissioning and preserve user-owned work.

### QA required

AI engine, data flow, or core application-flow changes are incomplete until `FORTUNE-QA` returns PASS or an explicitly accepted PASS WITH WARNINGS.

### Product behavior over clever code

Optimize for stable, understandable, predictable behavior. Fortune output must be positive, playful, hopeful, personalized, concise or medium-length, culturally natural, non-repetitive, non-therapeutic, non-diagnostic, non-depressive, non-fatalistic, and non-frightening.

## Safety and verification

- The repository is the source of truth. Mark unverified claims `UNKNOWN` or `TODO`.
- Never print or document secret values, copy `.env` contents, mutate production data, delete backend collections, or perform destructive database operations.
- Do not update dependencies, redesign the UI, add features, or migrate frameworks during recovery unless explicitly requested and justified.
- Use existing tests first. Prefer deterministic mocks/test doubles and avoid unnecessary real AI calls.
- Classify findings as P0 (directly breaks the app), P1 (wrong fortune result), P2 (duplicate/architectural confusion), or P3 (cleanup/technical debt).
- Keep `Docs/` synchronized with proven behavior and decisions.
