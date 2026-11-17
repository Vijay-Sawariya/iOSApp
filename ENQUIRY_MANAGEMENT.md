# Enquiry Management

Open **More → Enquiries** to manage Website and Meta Ad enquiries from the web LMS's `sheet_enquiries` registry. Legacy Inventory continues to use `/legacy-inventory` and its existing tables.

Supported mobile workflows:

- Scoped statistics, name/phone/email/property search, status and employee filters, due/repeat filters, sorting and 27-record pages.
- Enquiry source, campaign, questions/answers, source-change snapshots, repeat enquiries and activity history.
- Assignment/reassignment by administrators and managers; pending follow-ups move to the new employee.
- Qualification and Buyer/Tenant conversion by administrators and `sr agent`, matching the web permission rule. Conversion uses the same MySQL advisory lock as the web workflow, checks Main/Telecaller duplicates, saves provenance and assigns the client atomically. Retrying a completed conversion returns the original lead.
- Search/link an accessible existing Buyer/Tenant without changing its ownership.
- Junk/Invalid and restore; converted enquiries are read-only.
- Follow-ups with a future date/time in Asia/Kolkata, an outcome and remarks. These are ordinary `actions` records and appear in Reminders.
- Administrator sync history. Preview/import opens the existing web admin page, which may require a separate web login. Google credentials and the import implementation remain on the web server.

## Deployment

Deploy the updated Python backend with the mobile build. Both must use the same LMS database as `SagarHomeLMSNewDesign`. This change does not modify production data or execute migrations automatically.

The existing web migrations `database/migrations/20261016_sheet_enquiries.sql` and `database/migrations/20261017_meta_enquiry_text.sql` must already be applied. The web LMS's action/lead repositories must have initialized `actions.entity_type`, `actions.entity_id`, `actions.assigned_to` and `lead_assignments`. Existing web sheet configuration and scheduled imports continue unchanged.

The new `enquiry_management` mobile feature flag controls navigation and API access, honoring the account's `__default__` when no explicit value exists. Staff can access only their assigned enquiries; administrators and managers can access all enquiries. Existing-lead linking requires creator/current-owner permission, matching the web workflow.

## Local verification

```sh
cd backend
python -m unittest test_enquiry_management -v
cd ../frontend
npx tsc --noEmit
npx eslint app/enquiries.tsx 'app/enquiries/[id].tsx' components/EnquiryControls.tsx
```

API tests use an isolated transactional database double with real PyMySQL parameter interpolation. No live database, production import, simulator or device verification is performed by these tests.

## List loading

The mobile list reuses a session-only page for 30 seconds and deduplicates concurrent requests. On reopening, a page up to five minutes old can render immediately while the expired data refreshes. Pull-to-refresh and the refresh button always request live data. Successful enquiry edits and account changes clear the cache; responses started before invalidation cannot repopulate it. Contact details are never persisted to disk by this cache.

The list API aggregates overdue enquiry IDs once, reuses the statistics total for an unfiltered page, and returns only card fields and Q&A. Full source snapshots and qualification data remain on the detail endpoint. Live database timings still require verification after backend deployment.

## Card actions

Enquiry cards match the web action row: Junk/Invalid (or Restore to New), Assignment for managers/admins, Open enquiry and Link existing lead. Assignment and lead linking open dialogs directly on the list. Invalid enquiries disable Open and Link until restored; converted enquiries show only Open and View lead. Successful changes update the card immediately, refresh counts and keep the updated enquiry visible even if it leaves the current filter.


## October 21 parity update

- The list's Follow-up action opens a conversation/history dialog. Outcome and remarks can be saved without a date; only a future date creates a reminder.
- Unassigned enquiries require an active employee in that dialog. Assignment, pending reminder ownership and conversation/reminder creation commit together.
- Selecting an existing lead prefills its current owner. Existing lead ownership is never changed by linking.
- Opening the enquiry list as a manager/admin assigns unassigned repeat-phone enquiries only when all assigned matches agree on one active user; conflicts remain manual.
- Existing enquiry reminders include the enquirer's name and a Linked Enquiry contact panel. Other users' enquiry contact details remain protected.
- Sync runs on the existing production web/cPanel scheduler at 08:00 and 22:30 Asia/Kolkata; the phone does not run the Google import. Configure the web scheduler separately.
- iOS continues using Expo native scheduled notifications, including foreground banners and background delivery for downloaded reminders. New server changes while the app is suspended require APNs/server push or a subsequent app refresh; this release does not provision APNs credentials.

Deploy the Python backend and mobile build together. No production deployment or App Store submission is performed by this change.


## November 17: web parity and new-enquiry push

- More → Enquiries now has Website & Meta Ad and Magic Brick Enquiries tabs. Each tab has separate scoped results, statistics, filters and pagination.
- Both list cards and detail screens offer icon actions for soft deletion, Junk/Invalid and Agent enquiry, including restore actions. The first three actions are red. Classifying a converted enquiry does not modify its Main Lead. Soft deletion cancels only pending/missed enquiry follow-ups and preserves history, receipts and Main Leads. Deleted records are excluded from lists, details, duplicate checks and repeat ownership matching.
- Listing URL is displayed inline, validated as HTTP(S), or shown as Not provided. Magicbricks listing URL and provenance survive explicit conversion. Numeric rupee budgets use the web import snapshot (for example 80,00,000) and existing normalized qualification amounts.
- Missing soft-delete columns are added idempotently before enquiry transactions. Device registration/startup creates `mobile_enquiry_push_devices`. The deployment database user needs CREATE/ALTER permissions for initial setup.
- `enquiry_push.py` runs a server worker about every 15 seconds. It uses a MySQL advisory lock across backend workers, checks feature flags and enquiry visibility, starts new devices at the current watermark, and advances only after accepted Expo tickets. Expired device tokens are removed. Notification bodies are generic; opening an enquiry still requires the authenticated API's current permissions.
- The phone registers an Expo token using the existing EAS project ID after permission is granted. iOS handles foreground/background banners through Expo notifications and deep-links to `/enquiries/[id]`. Registration is refreshed on app activation and removed on logout/account change. No Magicbricks partner endpoint/header/payload changes are needed.

### Deployment and device verification

Deploy the Python backend (including `enquiry_push.py`) and rebuild/install the mobile app together. `expo-notifications` is now included in the Expo plugins; the existing native iOS target already has an `aps-environment` entitlement. A valid Apple push key/provisioning profile must be configured in this EAS project's credentials. Credentials were not read or changed by this task. Build with the project's normal EAS/native process and verify notification permission on a physical iPhone; Expo Go/simulator checks do not prove background delivery.

`ENQUIRY_PUSH_ENABLED=0` disables the server worker. If Expo push security is enabled, configure `EXPO_ACCESS_TOKEN` on the backend. Do not place it in mobile source. Keep the API worker running (an always-on host, not request-only PHP hosting). Database/network or push acceptance failures retry. Delivery is at least once: uncertain network responses may result in a repeated banner. Apple's notification settings, Focus and connectivity affect visible delivery. Push ticket acceptance does not prove APNs delivery.

Acceptance: register a phone; save a unique enquiry through the existing Magicbricks webhook and through the general import; verify the correct tab/card; background/lock the phone and verify both notifications; tap each to open its enquiry; verify staff cannot open another owner's records; test Junk/Agent/restore, deletion, follow-ups and conversion. No production deployment, credentials provisioning, physical-device test or App Store submission was performed.

Local backend regression: `python -m unittest test_enquiry_management test_enquiry_push -q`. Tests use database doubles and a fake push sender, never live notifications or production data.
