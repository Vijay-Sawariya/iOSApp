# Monthly inventory books (iOS)

Open **More → Monthly Books** as `vsawariya`. The menu, screen, conversion form and every new API endpoint restrict access to that exact username. Other administrators do not gain access by role.

The screen has month/category filters, search, paginated cards and pull-to-refresh. Each card offers PDF viewing when a PDF exists, View Lead when an existing inventory matches its normalized address **and location**, and conversion through the existing inventory form. Converted entries display their status and lead link. There are no upload controls or upload endpoints. Soft Delete remembers the category and existing book identity, hides matching entries across books and prevents the web importer from adding them again. It does not delete any main lead.

Conversion is online-only. The backend locks the book entry, checks the same sale/rent duplicate identities as the web application (including the optional telecaller store), creates the main lead and floor pricing, and marks the entry Converted in one transaction. Retrying an already completed conversion returns its original lead. Names default to title case and Lead Type defaults to Builder. Only user-entered notes are saved; original book notes stay in Monthly Books. Numeric area and area_unit are saved separately in the main leads table.

## Deployment

Deploy `backend/monthly_inventory.py` with the updated `backend/server.py` to the API used by the app. Its MySQL connection must point to the same database as the web application, with the web monthly book, conversion, PDF and 20261011 soft-delete/exclusions migrations already applied (including leads.area_unit). Loading the updated web homepage applies the schema changes idempotently. This feature does not copy books to a separate mobile database or run database migrations from the phone. Existing PDFs are read in chunks and served privately through the authenticated API.

Rebuild/distribute the iOS app with the updated frontend. No new native dependencies are needed; PDF preview uses the existing `react-native-webview`. A frontend-only release cannot provide the new API endpoints.

## Validation

- `cd frontend && npx tsc --noEmit --incremental false`
- `cd frontend && node --test tests/monthly-inventory.cjs`
- `cd backend && python -m unittest test_monthly_inventory -v` (FastAPI, Pydantic, PyMySQL and httpx test dependencies)

Backend tests use isolated fixtures and never connect to production. Before release, verify a real uploaded book PDF and conversion against a staging database using an authenticated iOS device/simulator.


## October 21 status and seller filter update

Monthly book cards have a Status popup with Available, Sold, Hold and Invalid. Unavailable cards have a colored edge and warning; all other card actions remain usable. The API writes inventory_status, status_changed_at and status_changed_by on monthly_inventory_entries. Deploy the matching web schema support and open Monthly Inventory once to initialize these columns before using the mobile status action. Missing columns return a setup error rather than silently losing status changes.

Seller inventory uses icon-only Residential/Commercial markers, an address/phone row, the four Property Type sale/rent filters, and explicit 0–0 budget matching for zero/null/blank prices with no positive floor price. Blank budget bounds remain unrestricted.

### Inventory location and direction

Before deploying the location/direction capture feature, apply
`backend/migrations/20261119_monthly_inventory_location_direction.sql` once to the
shared LMS database. Monthly book cards capture the device's GPS location after
permission and map confirmation; tapping a saved address opens Google Maps.
Both inventory lists offer the eight compass directions, stored as
`building_facing`. Captures are shared between active inventory leads and monthly
entries with the same normalized property address and locality (ignoring case,
spacing, dashes, commas and periods). Empty addresses/localities never match;
different floors and book months at the same property share these building details.
Saving either field from either screen updates that field on all matching records
in the same transaction. Existing captures reconcile automatically when either
list loads, without requiring users to recapture or running a data migration.
Each field resolves independently: the highest-ID lead with a nonblank value wins,
then the newest book month and highest entry ID. Historical conflicting stored
values remain untouched until a new capture replaces that field on all records.
Conversion pre-fills the resolved values in the inventory form. Deploy
`backend/property_capture.py` with `server.py` and `monthly_inventory.py`; the
existing location/direction column migration is still required.


#### Troubleshooting “Not Found” when saving

Location and direction both use `POST /api/monthly-inventory/{entry_id}/details`.
A plain FastAPI `404 {"detail":"Not Found"}` means the running API does not
have this route; rebuilding the phone app cannot add it. Apply the location and
direction migration above and deploy the updated `backend/monthly_inventory.py`
to the API host configured by `EXPO_PUBLIC_BACKEND_URL` (default:
`https://sagar-home-api.onrender.com`). Restart/redeploy the API service and verify
its `/openapi.json` includes the POST details route before retrying on the phone.
The route's own “Inventory entry not found.” response instead means that the
entry was deleted or is no longer available. Missing database columns return
503 after the route is deployed and require the migration, not another app build.

## Shared construction stages

Inventory and Monthly Books cards support nine construction stages and Not specified
to clear a stage. Changes share automatically by normalized address and locality,
including other floors and book months. Focus/refresh reloads changes from web or
other devices. Inventory edits use the existing offline queue; monthly edits are online.
Stage changes preserve price dates and do not change availability.

Deploy the updated backend (`construction_stage.py`, `property_capture.py`,
`monthly_inventory.py`, `server.py`) and rebuild the frontend. Install
`backend/migrations/20261122_construction_stage.sql` once on the shared database,
or load the updated web homepage to install the same columns automatically.
Do not apply the web and iOS copies of the migration twice.
Run `python3 backend/test_construction_stage.py` for isolated validation/sharing checks.
