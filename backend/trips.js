import { buses, drivers, expect, first, identifier, parents, schools, students } from './records.js';

const status = { PLANNED: 'idle', IN_PROGRESS: 'active', COMPLETED: 'done' };
const minutes = seconds => (seconds ?? 0) / 60;
const km = meters => (meters ?? 0) / 1000;
export const ammanDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
}).format();

export async function findTrip(db, scope, id) {
  return first(db, `SELECT t.*, TO_CHAR(t.TRIP_DATE, 'YYYY-MM-DD') AS DAY
    FROM TRIPS t WHERE ${scope} AND t.TRIP_TYPE = 'MORNING'
    AND t.STATUS <> 'CANCELLED'
    ORDER BY CASE
      WHEN t.STATUS = 'IN_PROGRESS' THEN 0
      WHEN t.STATUS = 'PLANNED' AND t.TRIP_DATE >= TO_DATE(:today, 'YYYY-MM-DD') THEN 1
      WHEN t.STATUS = 'COMPLETED' THEN 2 ELSE 3 END,
    CASE WHEN t.STATUS = 'PLANNED' THEN t.TRIP_DATE END, t.TRIP_DATE DESC, t.TRIP_ID DESC
    FETCH FIRST 1 ROW ONLY`, { id, today: ammanDay() });
}

async function loadTrip(db, trip, bus) {
  if (!trip || !bus) return null;
  const routeRow = await first(db, `SELECT ROUTE_ID, TOTAL_DISTANCE_M, TOTAL_DURATION_S, POLYLINE, MATRIX_SOURCE
    FROM BUS_ROUTES WHERE TRIP_ID = :id AND VERSION = :version`,
  { id: trip.TRIP_ID, version: trip.CURRENT_ROUTE_VERSION });
  if (!routeRow) return null;
  const stops = await db.rows(`SELECT ts.*, s.NAME, rs.STOP_POSITION
    FROM TRIP_STOPS ts JOIN STUDENTS s ON s.STUDENT_ID = ts.STUDENT_ID
    LEFT JOIN BUS_ROUTE_STOPS rs ON rs.ROUTE_ID = :route AND rs.STUDENT_ID = ts.STUDENT_ID
    WHERE ts.TRIP_ID = :id ORDER BY rs.STOP_POSITION NULLS LAST, ts.STOP_ORDER`,
  { route: routeRow.ROUTE_ID, id: trip.TRIP_ID });
  const point = row => ({ id: String(row.STUDENT_ID), name: row.NAME, area: row.ADDRESS ?? '',
    lat: row.LATITUDE, lng: row.LONGITUDE });
  const order = stops.map(point);
  const manualOrder = [...stops].sort((a, b) => (a.BASELINE_ORDER ?? a.STOP_ORDER) - (b.BASELINE_ORDER ?? b.STOP_ORDER)).map(point);
  const pathFor = ordered => [bus.school, ...ordered, bus.school];
  const distance = km(routeRow.TOTAL_DISTANCE_M);
  const duration = minutes(routeRow.TOTAL_DURATION_S);
  const arrivalMinutes = stops.map(row => row.ETA_OFFSET_SECONDS == null ? null : minutes(row.ETA_OFFSET_SECONDS));
  const route = {
    id: String(routeRow.ROUTE_ID), version: trip.CURRENT_ROUTE_VERSION, order,
    path: pathFor(order), school: bus.school, matrixSource: routeRow.MATRIX_SOURCE, encodedPolyline: routeRow.POLYLINE,
    optimized: { km: distance, minutes: duration, fuel: distance * 0.28, arrivalMinutes, segments: [] },
    manual: { km: km(trip.BASELINE_DISTANCE_M), minutes: minutes(trip.BASELINE_DURATION_S),
      order: manualOrder, path: pathFor(manualOrder) },
  };
  return { id: String(trip.TRIP_ID), date: trip.DAY, status: status[trip.STATUS], route,
    pickedUpIds: stops.filter(row => ['PICKED_UP', 'DROPPED'].includes(row.STATUS)).map(row => String(row.STUDENT_ID)) };
}

export async function dashboard(db, actor, childId, selectedTrip) {
  if (actor.role === 'admin') {
    const history = await db.rows(`SELECT t.TRIP_ID, t.BUS_ID, TO_CHAR(t.TRIP_DATE, 'YYYY-MM-DD') AS DAY,
      r.TOTAL_DISTANCE_M, r.TOTAL_DURATION_S,
      (SELECT COUNT(*) FROM TRIP_STOPS ts WHERE ts.TRIP_ID = t.TRIP_ID) AS STOPS
      FROM TRIPS t JOIN BUS_ROUTES r ON r.TRIP_ID = t.TRIP_ID AND r.VERSION = t.CURRENT_ROUTE_VERSION
      ORDER BY t.TRIP_DATE DESC, t.TRIP_ID DESC FETCH FIRST 50 ROWS ONLY`);
    return { students: await students(db), drivers: await drivers(db), buses: await buses(db),
      schools: await schools(db), parents: await parents(db),
      history: history.map(row => ({ id: String(row.TRIP_ID), bus: String(row.BUS_ID), date: row.DAY,
        stops: row.STOPS, km: km(row.TOTAL_DISTANCE_M), min: Math.round(minutes(row.TOTAL_DURATION_S)), by: 'Optimized' })) };
  }
  if (actor.role === 'driver') {
    const tripRow = selectedTrip
      ? await first(db, "SELECT t.*, TO_CHAR(t.TRIP_DATE, 'YYYY-MM-DD') AS DAY FROM TRIPS t WHERE TRIP_ID = :trip AND DRIVER_ID = :driver", { trip: selectedTrip, driver: actor.id })
      : await findTrip(db, 't.DRIVER_ID = :id', actor.id);
    const bus = tripRow ? (await buses(db, tripRow.BUS_ID))[0] : null;
    const driver = (await drivers(db)).find(row => row.id === String(actor.id));
    return { bus, driver, trip: await loadTrip(db, tripRow, bus) };
  }
  const linked = await db.rows('SELECT STUDENT_ID FROM STUDENT_GUARDIANS WHERE USER_ID = :id ORDER BY STUDENT_ID', { id: actor.id });
  const allowed = new Set(linked.map(row => String(row.STUDENT_ID)));
  const children = (await students(db)).filter(row => allowed.has(row.id));
  if (childId) expect(allowed.has(childId), 'Student is not linked to this account.', 403);
  const child = childId ? children.find(row => row.id === childId) : children[0];
  const tripRow = child ? await findTrip(db,
    't.TRIP_ID IN (SELECT ts.TRIP_ID FROM TRIP_STOPS ts WHERE ts.STUDENT_ID = :id)', Number(child.id)) : null;
  const bus = tripRow ? (await buses(db, tripRow.BUS_ID))[0] : null;
  const driver = tripRow ? (await drivers(db)).find(row => row.id === String(tripRow.DRIVER_ID)) : null;
  const trip = await loadTrip(db, tripRow, bus);
  if (trip) {
    const pickupIndex = trip.route.order.findIndex(stop => stop.id === child.id);
    // Limit parent responses to their own stop and its estimated timings.
    trip.route.order = trip.route.order.filter(stop => stop.id === child.id);
    trip.route.path = [bus.school, ...trip.route.order, bus.school];
    trip.route.optimized.arrivalMinutes = [trip.route.optimized.arrivalMinutes[pickupIndex] ?? null];
    delete trip.route.manual;
    delete trip.route.encodedPolyline;
    trip.pickedUpIds = trip.pickedUpIds.filter(id => id === child.id);
  }
  return { child: child ? { ...child, parent: actor.name } : null, children: children.map(({ id, name }) => ({ id, name })),
    driver, bus, trip };
}

export async function planInputs(db, body) {
  const busId = identifier(body.busId);
  const bus = (await buses(db, busId))[0];
  expect(bus?.driverId, 'Choose a bus with an assigned driver.');
  const day = body.date;
  const parsed = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day) : null;
  expect(parsed && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === day && day >= ammanDay(),
    'Choose today or a future trip date.');
  const ids = body.studentIds;
  expect(Array.isArray(ids) && ids.length > 0 && ids.length <= Math.min(25, bus.cap),
    'Choose between 1 and ' + Math.min(25, bus.cap) + ' pickups.');
  const byId = new Map((await students(db)).filter(row => row.bus === bus.id).map(row => [row.id, row]));
  const stops = ids.map(id => byId.get(String(identifier(id))));
  expect(new Set(ids.map(String)).size === ids.length && stops.every(stop => stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
    'Select unique students assigned to this bus with a default pickup location.');
  return { bus, day, stops };
}

export async function savePlan(db, plan) {
  const { bus, day, route } = plan;
  const id = Number(bus.id);
  await first(db, 'SELECT BUS_ID FROM BUSES WHERE BUS_ID = :id FOR UPDATE', { id });
  if (await first(db, 'SELECT TRIP_ID FROM BUS_ROUTES WHERE PLAN_KEY = :key', { key: plan.id })) return;
  const currentBus = (await buses(db, id))[0];
  expect(currentBus?.driverId === bus.driverId && currentBus.schoolId === bus.schoolId, 'Bus assignment changed. Generate a new plan.', 409);
  expect(day >= ammanDay(), 'Trip date has passed. Generate a new plan.', 409);
  const assigned = new Set((await students(db)).filter(student => student.bus === bus.id).map(student => student.id));
  expect(route.order.every(stop => assigned.has(stop.id)), 'Student assignments changed. Generate a new plan.', 409);
  const existing = await first(db, `SELECT TRIP_ID, STATUS, CURRENT_ROUTE_VERSION FROM TRIPS
    WHERE BUS_ID = :id AND TRIP_TYPE = 'MORNING' AND TRIP_DATE = TO_DATE(:day, 'YYYY-MM-DD') FOR UPDATE`, { id, day });
  expect(!existing || existing.STATUS === 'PLANNED', 'This bus already has a started or closed morning trip on this date.', 409);
  const version = (existing?.CURRENT_ROUTE_VERSION ?? 0) + 1;
  const baseline = { baselineM: Math.round(route.manual.km * 1000), baselineS: Math.round(route.manual.minutes * 60), version };
  const trip = existing?.TRIP_ID ?? await db.insert(`INSERT INTO TRIPS
    (BUS_ID, DRIVER_ID, SCHOOL_ID, TRIP_TYPE, TRIP_DATE, BASELINE_DISTANCE_M, BASELINE_DURATION_S, CURRENT_ROUTE_VERSION)
    VALUES (:id, :driver, :school, 'MORNING', TO_DATE(:day, 'YYYY-MM-DD'), :baselineM, :baselineS, :version)`,
  { id, driver: bus.driverId, school: bus.schoolId, day, ...baseline }, 'TRIP_ID');
  if (existing) {
    await db.execute(`UPDATE TRIPS SET BASELINE_DISTANCE_M = :baselineM, BASELINE_DURATION_S = :baselineS,
      CURRENT_ROUTE_VERSION = :version, DRIVER_ID = :driver WHERE TRIP_ID = :trip`, { ...baseline, driver: bus.driverId, trip });
    await db.execute("UPDATE BUS_ROUTES SET STATUS = 'REPLACED' WHERE TRIP_ID = :trip AND STATUS = 'ACTIVE'", { trip });
    await db.execute('DELETE FROM TRIP_STOPS WHERE TRIP_ID = :trip', { trip });
  }
  const routeId = await db.insert(`INSERT INTO BUS_ROUTES
    (TRIP_ID, VERSION, REASON, TOTAL_DISTANCE_M, TOTAL_DURATION_S, POLYLINE, PLAN_KEY, MATRIX_SOURCE)
    VALUES (:trip, :version, :reason, :meters, :seconds, :polyline, :key, :source)`,
  { trip, version, key: plan.id, reason: existing ? 'ADMIN' : 'INITIAL', meters: Math.round(route.optimized.km * 1000),
    seconds: Math.round(route.optimized.minutes * 60), polyline: route.encodedPolyline ?? null, source: route.matrixSource }, 'ROUTE_ID');
  const baselineOrder = new Map(route.manual.order.map((stop, i) => [stop.id, i + 1]));
  for (const [i, stop] of route.order.entries()) {
    const student = Number(stop.id);
    const position = i + 1;
    await db.execute(`INSERT INTO TRIP_STOPS
      (TRIP_ID, STOP_ORDER, BASELINE_ORDER, STUDENT_ID, LATITUDE, LONGITUDE, ADDRESS, ETA_OFFSET_SECONDS)
      VALUES (:trip, :position, :baseline, :student, :lat, :lng, :area, :eta)`,
    { trip, position, baseline: baselineOrder.get(stop.id), student, lat: stop.lat, lng: stop.lng, area: stop.area,
      eta: Math.round(route.optimized.arrivalMinutes[i] * 60) });
    await db.execute('INSERT INTO BUS_ROUTE_STOPS (ROUTE_ID, STOP_POSITION, STUDENT_ID) VALUES (:routeId, :position, :student)',
      { routeId, position, student });
  }
  return trip;
}

export async function updateTrip(db, actor, body) {
  const { action } = body;
  const id = identifier(body.tripId);
  if (action === 'start') {
    await first(db, 'SELECT USER_ID FROM USERS WHERE USER_ID = :driver FOR UPDATE', { driver: actor.id });
    const active = await first(db, "SELECT TRIP_ID FROM TRIPS WHERE DRIVER_ID = :driver AND STATUS = 'IN_PROGRESS' FETCH FIRST 1 ROW ONLY", { driver: actor.id });
    expect(!active, 'Finish the active trip before starting another.', 409);
  }
  const row = await first(db, 'SELECT STATUS, TO_CHAR(TRIP_DATE, \'YYYY-MM-DD\') AS DAY FROM TRIPS WHERE TRIP_ID = :id AND DRIVER_ID = :driver FOR UPDATE',
    { id, driver: actor.id });
  expect(row, 'Assigned trip not found.', 404);
  if (action === 'start') {
    expect(row.STATUS === 'PLANNED' && row.DAY === ammanDay(), 'Only a planned trip scheduled for today can start.', 409);
    await db.execute("UPDATE TRIPS SET STATUS = 'IN_PROGRESS', STARTED_AT = SYSTIMESTAMP WHERE TRIP_ID = :id", { id });
  } else if (action === 'pickup') {
    expect(row.STATUS === 'IN_PROGRESS', 'Start the trip first.', 409);
    const student = identifier(body.studentId);
    const result = await db.execute(`UPDATE TRIP_STOPS SET STATUS = 'PICKED_UP', ACTUAL_TIME = COALESCE(ACTUAL_TIME, SYSTIMESTAMP)
      WHERE TRIP_ID = :id AND STUDENT_ID = :student AND STATUS IN ('PENDING', 'PICKED_UP')`, { id, student });
    expect(result.rowsAffected, 'Pickup is unavailable.', 409);
  } else if (action === 'finish') {
    expect(row.STATUS === 'IN_PROGRESS', 'Only an active trip can finish.', 409);
    await db.execute("UPDATE TRIP_STOPS SET STATUS = CASE STATUS WHEN 'PICKED_UP' THEN 'DROPPED' ELSE 'ABSENT' END WHERE TRIP_ID = :id AND STATUS IN ('PENDING', 'PICKED_UP')", { id });
    await db.execute("UPDATE BUS_ROUTES SET STATUS = 'COMPLETED' WHERE TRIP_ID = :id AND STATUS = 'ACTIVE'", { id });
    await db.execute("UPDATE TRIPS SET STATUS = 'COMPLETED', FINISHED_AT = SYSTIMESTAMP WHERE TRIP_ID = :id", { id });
  } else expect(false, 'Unknown trip action.');
}
