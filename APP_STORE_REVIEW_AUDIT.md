# Apple App Review Readiness Audit (iOS)

Date: 2026-05-13
Scope: `frontend` Expo/React Native iOS app configuration, privacy manifests, and high-risk runtime patterns.

## What I reviewed
- iOS metadata and permissions in `frontend/ios/SagarHome/Info.plist`
- Apple privacy manifest in `frontend/ios/SagarHome/PrivacyInfo.xcprivacy`
- Expo app configuration in `frontend/app.json`
- Network/service layer patterns in `frontend/services/api.ts`

## High-priority risks before App Store submission

1. **Permission overreach risk (reduced in this patch)**
   - Previously requested `Always` location and microphone in iOS Info.plist, which can trigger App Review scrutiny when app flows don’t clearly justify continuous/background location or audio capture.
   - **Action taken:** Removed `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription`, and `NSMicrophoneUsageDescription`.

2. **Background mode declaration requires functional justification**
   - `UIBackgroundModes` contains `fetch`. If background fetch behavior is not user-benefiting and demonstrable, review may flag it.
   - **Recommendation:** Keep only if implemented and documented in review notes; otherwise remove before release.

3. **Privacy Nutrition Labels may be incomplete**
   - `NSPrivacyCollectedDataTypes` is currently empty.
   - **Recommendation:** Ensure App Store Connect privacy answers match actual SDK/runtime collection (auth tokens, analytics, diagnostics, identifiers, location, etc.).

4. **Auth token logging in production**
   - `console.log` statements indicate token presence and auth flow state in `api.ts`.
   - **Recommendation:** Strip sensitive or noisy logs from production builds.

5. **Backend URL safety**
   - API base URL is from environment variable; if unset/misconfigured, requests may fail silently in review testing.
   - **Recommendation:** Add startup validation + fail-fast user-safe error for missing backend URL.

## App Review submission checklist (recommended)

- [ ] Validate all permission prompts are shown only in-context (just-in-time).
- [ ] Confirm review account/demo data is provided in App Review notes.
- [ ] Confirm no placeholder/empty screens in logged-out or offline paths.
- [ ] Verify Privacy Policy URL is accessible and accurate.
- [ ] Verify Terms/Support URLs in metadata.
- [ ] Ensure app/version/build numbers are consistent between Xcode and App Store Connect.
- [ ] Run final archive on physical iPhone and test critical paths: login, lead creation, map/location, photo upload, offline sync.

## Suggested next pass (optional)

- Remove `UIBackgroundModes/fetch` if not strictly needed.
- Add explicit runtime guardrails and user-facing error messages for API outages.
- Add production log sanitization.
