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
