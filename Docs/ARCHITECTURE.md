# Architecture

Status: Repository-verified baseline as of 2026-08-28.

## Stack

- Frontend: Vite 8, browser ES modules, DOM-based single-page application (`index.html` -> `main.js`). There is no component framework or route framework.
- Mobile: Capacitor 8 with Android and iOS native wrappers around `dist`.
- Backend: Firebase Functions v2 on Node.js 22, CommonJS.
- Data/auth: Firebase Authentication, Firestore, callable Functions, App Check initialization, Capacitor Preferences/Filesystem, and `localStorage`.
- AI: Google Gen AI SDK (`@google/genai`) using the configured Gemini model. Vertex AI is attempted first; an optional Gemini Developer API provider is second.
- Entitlements: Firestore/server account state, RevenueCat, and AdMob server-side verification.
- Hosting: Firebase serves a mobile-only public landing page; separate Vercel/Netlify configurations can serve the full SPA; admin is built separately.

No OpenAI runtime integration was found. A stale CSP permission for `api.openai.com` is dead configuration.

## Runtime ownership

- `main.js`: application state, bootstrap, UI events, request routing, result rendering, profile flow, language, and history UI.
- `aiEngine.js`: client adapter for local personalization and remote callable results.
- `fortunes.js` + `fortunesData.js` + `fortuneSelection.js`: active free curated path.
- `firebaseService.js`: single client Firebase initialization and client/backend contracts.
- `functions/index.js`: callable backend, entitlements, idempotency, AI generation, server history, and admin endpoints.
- `historyStore.js`: authoritative on-device history and merge logic.
- `astrologyCalc.js` + `zodiacData.js`: client astrology calculation.
- `i18n.js`, `languageGuard.js`, `functions/fortuneLocales.js`, and `functions/fortuneLanguage.js`: UI and generation-language support.

## Architectural assessment

Firebase is initialized once per runtime; duplicate initialization was not found. The main architectural problem is overlapping representations and ownership:

- Two active displayed-result paths are intentional by entitlement, but legacy generator/fallback/prompt artifacts obscure the authoritative path.
- User-visible registered history now comes only from canonical `requestId` documents; internal AI novelty memory is private.
- Zodiac catalogs exist independently in UI, astrology, and backend code and have drifted.
- Explicit language selection now persists immediately with a sequence-protected precedence contract over older hydration.

The recovery should keep the current monolithic frontend and Firebase backend. No microservice or framework migration is justified.
