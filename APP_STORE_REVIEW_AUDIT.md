# Apple App Store Deployment Review (Complete iOS Audit)

**Review date:** 2026-05-13  
**Repository scope:** `frontend` (Expo + React Native, iOS target)  
**Goal:** Readiness check for Apple App Store submission and App Review.

## Executive summary

**Current status: Not submission-ready yet (medium risk).**

The app is close, but there are App Review and compliance risks that should be resolved before uploading a release candidate to App Store Connect:

1. `UIBackgroundModes = fetch` is declared and will require clear functional justification during review.
2. Privacy manifest currently declares **no collected data types** (`NSPrivacyCollectedDataTypes` empty), which can mismatch actual behavior unless App Store Connect privacy answers are completed perfectly.
3. Location configuration may be over-permissioned via Expo plugin config (`locationAlwaysAndWhenInUsePermission`) while iOS native plist only uses when-in-use.
4. Production logging includes auth and notification internals that should be sanitized before release.
5. Versioning is inconsistent across platforms (`ios.buildNumber=11` vs `android.versionCode=1`) and should be managed in a release checklist.

---

## What was reviewed

- iOS app metadata and permission keys: `frontend/ios/SagarHome/Info.plist`
- Apple privacy manifest: `frontend/ios/SagarHome/PrivacyInfo.xcprivacy`
- Expo app config and plugin permissions: `frontend/app.json`
- Notification and location implementation surface:
  - `frontend/services/notificationService.ts`
  - `frontend/app/leads/add.tsx`
  - `frontend/app/leads/edit/[id].tsx`
- API/auth logging surface:
  - `frontend/services/api.ts`
  - `frontend/contexts/AuthContext.tsx`
  - `frontend/contexts/OfflineContext.tsx`

---

## Findings and release impact

## 1) Permissions & capability declarations

### ✅ Good
- `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and `NSLocationWhenInUseUsageDescription` are present with user-facing descriptions.
- ATS is not globally disabled (`NSAllowsArbitraryLoads = false`).
- Non-exempt encryption is explicitly set to false (`ITSAppUsesNonExemptEncryption = false`).

### ⚠️ Needs action
- `UIBackgroundModes` includes `fetch`. Apple may ask for concrete user benefit and behavior details. If not essential, remove before release.
- Face ID usage string exists (`NSFaceIDUsageDescription`), but verify any actual biometric usage path exists. If unused, remove to reduce review questions.

## 2) Privacy manifest / data disclosure

### ✅ Good
- `PrivacyInfo.xcprivacy` exists and includes required-reason API categories (File timestamp, UserDefaults, System boot time, Disk space).
- Tracking is disabled (`NSPrivacyTracking = false`).

### ⚠️ Needs action
- `NSPrivacyCollectedDataTypes` is empty. This is acceptable only if App Store Connect nutrition labels are fully and accurately declared there and app truly avoids SDK-level data collection beyond declared purposes.
- Because the app uses auth, reminders/notifications, location, and backend sync, validate whether identifiers/contact/location/diagnostics are collected or linked.

## 3) Expo plugin configuration consistency

### ⚠️ Needs action
- In `app.json`, `expo-location` plugin still sets `locationAlwaysAndWhenInUsePermission`, which can imply background intent. Align this with actual behavior (prefer when-in-use only unless background location is truly needed).
- Android permissions include `RECORD_AUDIO`; while not directly App Store-related, cross-platform permission minimization is recommended for policy hygiene.

## 4) Runtime behavior and security hygiene

### ⚠️ Needs action
- Many `console.log` statements are present across app contexts/services, including auth token state and notification scheduling details. For production, reduce sensitive/internal logs to avoid leaking operational context in device logs.
- Add explicit startup guard for missing API base URL and user-safe error presentation for reviewer testing flows.

## 5) Release operations and App Review package quality

### ⚠️ Needs action
- Versioning/build sequencing should be standardized for each release (`expo.version`, iOS `buildNumber`, Android `versionCode`).
- Ensure App Review notes include:
  - test account credentials,
  - steps to trigger location/photo flows,
  - explanation for background fetch (if retained),
  - any region/timezone assumptions for reminders.

---

## Must-fix before submission (recommended gate)

- [ ] Remove `UIBackgroundModes/fetch` **or** document and verify real background-fetch user value.
- [ ] Reconcile location permission strategy (when-in-use only vs always) across Expo config and native plist.
- [ ] Finalize privacy nutrition labels in App Store Connect based on actual collected/linked data.
- [ ] Sanitize production logging (auth/session/notification internals).
- [ ] Validate cold-start behavior when backend is unavailable or env is misconfigured.

## Pre-upload validation checklist

- [ ] `eas build -p ios --profile production` succeeds for release config.
- [ ] Install on physical iPhone; verify login, lead add/edit, location capture, image upload, reminders.
- [ ] Confirm all permission prompts occur contextually (not on first launch without action).
- [ ] Confirm privacy policy/support URLs are valid and reachable from App Store metadata.
- [ ] Confirm build number increment for each upload attempt.

---

## Final verdict

**Do not submit to App Store yet.**

Address the must-fix list above, then run one final physical-device smoke test and App Store Connect metadata/privacy reconciliation pass.
