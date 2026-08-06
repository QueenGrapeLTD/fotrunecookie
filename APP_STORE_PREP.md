# App Store Prep

## Current app identity

- App name: Fortune Cookie AI
- Bundle ID: com.fortunecookieai.app
- iOS deployment target: 15.0
- Marketing version: 1.0
- Build number: 7

## Local validation

Run these before creating an archive:

```sh
npm ci
npm --prefix functions ci
npm run admob:functions-env
npm test
npm --prefix functions test
npm run build
npx cap sync ios
npm run mobile:check
npm run appstore:check
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Required account-side setup

- Register `com.fortunecookieai.app` in Apple Developer.
- Select the Apple Developer Team in Xcode and enable automatic signing.
- Create the App Store Connect app record for `Fortune Cookie AI`.
- Add the iOS app with bundle id `com.fortunecookieai.app` in Firebase and replace `ios/App/App/GoogleService-Info.plist`.
- Configure Sign in with Apple and Google sign-in for the same Firebase iOS app.
- Keep the production AdMob app id in `ios/App/App/Info.plist` aligned with the iOS app in AdMob.
- Set production `.env` values, especially Firebase, RevenueCat, rewarded,
  app-open, and adaptive-banner ad unit values for both platforms.
- Free users receive one non-blocking app-open request per process launch and
  a bottom adaptive banner. Verified Premium accounts remove the banner and
  never request the app-open unit. Development builds always use Google's test
  units.
- Run `npm run admob:functions-env` before deploying `adMobRewardCallback`.
- Configure both rewarded ad units to use `https://us-central1-fortunecookieai-prod.cloudfunctions.net/adMobRewardCallback` for server-side verification.
- Complete App Store privacy details and confirm whether App Tracking Transparency is needed for ads.
- Verify required-reason API privacy manifest requirements against the final archive before upload.

## Archive

After the checklist passes, open `ios/App/App.xcworkspace` in Xcode, choose a real iOS device or Any iOS Device destination, then use Product > Archive. Upload the archive from Organizer to App Store Connect.
