# Capstone 2: Smart Traffic Aware Route Planner (Oracle database)

This repository has the Oracle database for our project: the tables and the test data.

The files are only text. Nothing exists on your computer until you run them in SQL Developer.

## What you need
- Oracle Database (XE or Free, version 12.2 or newer)
- Oracle SQL Developer

## Step 1: Create the user (once)
1. In SQL Developer, open the **system** connection.
2. Make sure the container is `XEPDB1`. Run: `SELECT USER, sys_context('USERENV','CON_NAME') FROM dual;`
   You should see `SYSTEM` and `XEPDB1`. If it says `CDB$ROOT`, run: `ALTER SESSION SET CONTAINER = XEPDB1;`
3. Run this with **Run Script** (F5):

```sql
BEGIN
  EXECUTE IMMEDIATE 'CREATE USER TrafficPlaner IDENTIFIED BY "Capstone2Pass" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS';
EXCEPTION WHEN OTHERS THEN
  IF SQLCODE = -1920 THEN
    EXECUTE IMMEDIATE 'ALTER USER TrafficPlaner IDENTIFIED BY "Capstone2Pass" ACCOUNT UNLOCK';
  ELSE RAISE;
  END IF;
END;
/
GRANT CONNECT, RESOURCE, CREATE VIEW, CREATE SYNONYM, CREATE MATERIALIZED VIEW, CREATE JOB TO TrafficPlaner;
```

## Step 2: Make a new connection
Click the green plus in SQL Developer and fill in:
- Name: `capstone 2`
- Username: `TrafficPlaner`
- Password: `Capstone2Pass`
- Hostname: `localhost`
- Port: `1521`
- Service name: `XEPDB1`

Click **Test**. It should say "Success". Then click **Save** and **Connect**.

## Step 3: Create the tables and add the data
Use the `capstone 2` connection only. Check with `SELECT USER FROM dual;` (it should say `TRAFFICPLANER`).

1. Open `01_tables.sql` and click **Run Script** (F5).
2. Open `02_data.sql` and click **Run Script** (F5).

Always run `01` first, then `02`. To start again, run `01` and then `02` again.

To check, run: `SELECT table_name FROM user_tables;` (you should see 15 tables).

## Test logins
The password for every user is `Passw0rd!`

| Role | Emails |
|---|---|
| admin | admin@test.com |
| driver | driver1@test.com, driver2@test.com, driver3@test.com |
| parent | parent1@test.com to parent6@test.com |

## Backend connection settings
Put these in the backend `.env` file. Never upload `.env` to GitHub.

```
DB_USER=TrafficPlaner
DB_PASSWORD=Capstone2Pass
DB_CONNECT_STRING=localhost:1521/XEPDB1
```

## Tables
| Table | What it holds |
|---|---|
| USERS, USER_PHONES | admin, driver and parent accounts, with many phones each |
| SCHOOLS, BUSES | schools and their buses |
| STUDENTS | students (each rides one bus) |
| STUDENT_GUARDIANS | which parents belong to which student |
| STUDENT_LOCATIONS | many pickup places per student |
| TRIPS, TRIP_STOPS | one run of a bus, and its stops |
| BUS_ROUTES, BUS_ROUTE_STOPS | every route made for a trip (version 1, 2, 3...) |
| GPS_PINGS | bus positions during a trip |
| INCIDENT_LOGS | accidents and delays |
| AUDIT_LOGS | who did what and when |
| MATRIX_CACHE | short-lived Google answers (empty for now) |

Latitude comes first, then longitude. Dates in the test data are relative to the day you run `02_data.sql`.
