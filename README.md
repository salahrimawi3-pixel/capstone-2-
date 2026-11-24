# SmartRoute Capstone 2

React and Leaflet frontend, Node.js and Express API, Oracle database, and optional Google Routes traffic estimates. The project uses the team's Capstone Oracle schema and test data.

## 1. Set up Oracle

Use Oracle XE or Oracle Database Free and connect with SQL Developer. Create or use a dedicated Capstone schema in your pluggable database. The common service names are `XEPDB1` for XE and `FREEPDB1` for Oracle Free. Use the actual service name from your installation.

- **Existing Capstone schema:** Run only `database/03_api_fields.sql` once as the Capstone user. It adds the trip timing offset, route plan key and routing source fields.
- **New Capstone schema:** Run `database/01_tables.sql`, `database/02_data.sql`, and `database/03_api_fields.sql` in that order. Use **Run Script (F5)**. The first script drops and recreates the Capstone tables, so reserve it for a new or disposable schema.

If you need to create the Capstone user, run the following as an administrator connected to the PDB. Choose your own password and use it in the Node configuration.

```sql
CREATE USER TrafficPlaner IDENTIFIED BY "ReplaceWithYourLocalPassword";
GRANT CREATE SESSION, CREATE TABLE TO TrafficPlaner;
ALTER USER TrafficPlaner QUOTA 100M ON USERS;
```

## 2. Start Node

Install Node.js 22.12+ or a newer supported LTS version. Open the extracted project in VS Code, then open PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
npm ci
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Edit `backend/.env`. Set `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, and paste the generated value into `SESSION_SECRET`. Leave `GOOGLE_ROUTES_API_KEY` blank to run with estimated routes.

```powershell
npm start
```

Open http://127.0.0.1:3000/api/health. A successful response confirms that Node can query Oracle.

## 3. Start React

Open a second terminal from the extracted project folder:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open the URL printed by Vite (typically http://localhost:5173). The frontend forwards `/api` requests to the local Node server. For a single-port setup, run `npm run build` in the frontend with `VITE_API_BASE_URL=/api` configured, then open http://127.0.0.1:3000 while Node is running.

## 4. Test a trip

The sample accounts use the shared demo password `Passw0rd!`. Use them only with the local seeded database.

| Role | Sample account |
| --- | --- |
| Administrator | `admin@test.com` |
| Driver for bus 1 | `driver1@test.com` |
| Driver for bus 2 | `driver2@test.com` |
| Parent for Ali and Hadi | `parent1@test.com` |
| Parent for Rami | `parent3@test.com` |

The seed includes an active ride for driver 1 and a planned ride for driver 2. For a fresh same-day end-to-end walkthrough immediately after seeding:

1. Sign in as admin, open **Trips & routes**, choose bus **2**, and use today's date. Keep at least Rami selected.
2. Generate the route, compare manual and optimized orders, then choose **Save & assign trip**. Saving a new plan for the same planned morning trip adds a route version. A trip that has started or closed cannot be replaced.
3. Sign in as **driver2**, choose **Start Trip**, mark Rami picked up, then finish the trip.
4. Sign in as **parent3**, select **Rami**, and view his trip status. You can also use separate browser profiles for simultaneous role sessions.

In the current schema the school serves as the bus start and finish. The driver dashboard prioritizes an active morning trip, then the next planned morning trip. Starting a trip requires today's date in Amman.

## Traffic and maps

With a server-side key for Google Routes API, Node uses the traffic-aware travel-time matrix. It constructs a nearest-neighbor route, improves it with 2-opt, and requests a road polyline for the optimized order. It calculates traffic at request time. A blank key uses distance and duration estimates from Haversine without contacting Google.

The map uses Leaflet for pickup markers and waypoint lines. To display Google's road polyline on a Google map, configure a separate website-restricted Maps JavaScript API key in `frontend/.env.local`. The **Open in Google Maps** directions link works without a frontend key. Automated GPS tracking and in-trip traffic re-routing are future work. The implemented route versions record updates to a planned trip.

## Verification

From the project root, after installing both sets of dependencies:

```powershell
node tests/integration.mjs
```

The integration test exercises the real frontend HTTP client and Node application with an in-memory SQL test adapter. It checks seeded sign-in, CRUD, trip assignment and versions, idempotent saves, role restrictions, pickups, and completion. It also tests Google matrix batching using mocked Google responses. Your live Oracle and Google connections are verified separately on your machine.

The API uses an in-memory session store and a 20-minute route preview cache for local development. Saved trips and pickups live in Oracle and persist across Node restarts. Sessions and unsaved previews expire when the server restarts.
