# Production security setup

The application now fails closed when security services are not configured.

## Firebase App Check

1. Register the web app in Firebase App Check with reCAPTCHA v3.
2. Put the public site key in `VITE_RECAPTCHA_V3_SITE_KEY`.
3. Register the Android and iOS apps in App Check before distributing native builds.

AI generation, subscription verification and admin callables enforce App Check.
The read-only `getAccountState` callable requires Firebase Auth but deliberately
does not require App Check, so the private server counter can be displayed
reliably without exposing `_usage` documents to the client.

The client calls `getAccountState` by default. Set
`VITE_ACCOUNT_STATE_CALLABLE_ENABLED=false` only while working against a project
where that function has not been deployed yet.

## Secrets

Store server credentials in Secret Manager, never in a committed `.env` file:

```sh
firebase functions:secrets:set GEMINI_API_KEY_SECRET
firebase functions:secrets:set REVENUECAT_SECRET_API_KEY
```

The RevenueCat value must be a secret server API key. The two
`VITE_REVENUECAT_*_API_KEY` values are the platform-specific public SDK keys.

## First admin

Use Application Default Credentials from a trusted workstation, then run:

```sh
cd functions
npm run set-admin -- admin@example.com
```

The user must sign out and in again after the custom claim changes.

## Deployment

```sh
npm run predeploy:check
npx cap sync
firebase deploy --only firestore:rules,functions,hosting
```

Capacitor 8 Android builds require JDK 21. iOS builds require Xcode and an
iOS 15 deployment target.
