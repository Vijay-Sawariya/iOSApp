# Monthly inventory books (iOS)

Open **More → Monthly Books** as `vsawariya`. The menu, screen, conversion form and every new API endpoint restrict access to that exact username. Other administrators do not gain access by role.

The screen has month/category filters, search, paginated cards and pull-to-refresh. Each card offers PDF viewing when a PDF exists, View Lead when an existing inventory matches its normalized address **and location**, and conversion through the existing inventory form. Converted entries display their status and lead link. There are no upload controls or upload endpoints.

Conversion is online-only. The backend locks the book entry, checks the same sale/rent duplicate identities as the web application (including the optional telecaller store), creates the main lead and floor pricing, and marks the entry Converted in one transaction. Retrying an already completed conversion returns its original lead. Area units and the original book note are retained.

## Deployment

Deploy `backend/monthly_inventory.py` with the updated `backend/server.py` to the API used by the app. Its MySQL connection must point to the same database as the web application, with the web monthly book, conversion and PDF migrations already applied. This feature does not copy books to a separate mobile database or run database migrations from the phone. Existing PDFs are read in chunks and served privately through the authenticated API.

Rebuild/distribute the iOS app with the updated frontend. No new native dependencies are needed; PDF preview uses the existing `react-native-webview`. A frontend-only release cannot provide the new API endpoints.

## Validation

- `cd frontend && npx tsc --noEmit --incremental false`
- `cd frontend && node --test tests/monthly-inventory.cjs`
- `cd backend && python -m unittest test_monthly_inventory -v` (FastAPI, Pydantic, PyMySQL and httpx test dependencies)

Backend tests use isolated fixtures and never connect to production. Before release, verify a real uploaded book PDF and conversion against a staging database using an authenticated iOS device/simulator.
