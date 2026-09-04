# Social-provider name handling

Verified against `firebaseService.js` and installed `@capacitor-firebase/authentication` 8.2.x native source.

- Google sign-in uses the native credential bridge on mobile and Firebase popup on web. Firebase `getAdditionalUserInfo(result).profile.given_name/family_name` supplies explicit components when available. Multiword surnames are retained intact.
- Native Apple requests full name and email. With `skipNativeAuth`, the installed iOS handler returns its first-consent name as `nativeResult.user.displayName`; it does not expose separate name components. Its handler only constructs this display name when both given and family names are present. A missing Apple name therefore remains unknown, rather than being invented.
- Native Apple copies a supplied name into Firebase only if the Firebase name is empty. A social-sign-in completion barrier ensures the auth observer does not hydrate/save the profile before this one-time name is copied.
- Existing cloud display names and their saved components survive repeat login without provider names. Editing a full display name clears obsolete separate components; a surname is never guessed from the final word of a display name.
- This does not retroactively infer or repair old ambiguous first/last components. The user-visible full display name remains authoritative.

Verification: deterministic provider-shape, repeat-login, edited-name, and first-consent hydration-race tests in `test_provider_names.js`; existing auth configuration tests pass. No real account login, production data access, or account mutation was performed. Physical Google sign-in and first-consent Apple sign-in remain device verification items.

2026-09-05 verification: independent FORTUNE-QA returned PASS WITH WARNINGS (live provider sign-in and legacy split-name repair remain outside this verification). All 144 client tests passed. Vite build, Capacitor Android sync and debug APK build passed; the APK was installed and launched on Pixel_10_Pro / emulator-5554. This is local verification, not a store publication.

Local Android Studio JBR workaround: this machine's Unix-domain loopback initialization failed. For the Gradle process only, `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\nonexistent-fortune-java-sockets` makes the JVM use its TCP fallback. No global Java or OS settings were changed.
