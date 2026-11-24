export function expect(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}

export function identifier(value) {
  expect(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)), 'Invalid record ID.');
  const id = Number(value);
  expect(Number.isSafeInteger(id) && id > 0, 'Invalid record ID.');
  return id;
}

export function text(value, label, max) {
  expect(typeof value === 'string' && value.trim() && value.trim().length <= max,
    label + ' is required and must be at most ' + max + ' characters.');
  return value.trim();
}

export async function first(db, sql, binds) {
  return (await db.rows(sql, binds))[0];
}

export async function schools(db) {
  return (await db.rows('SELECT SCHOOL_ID, NAME FROM SCHOOLS ORDER BY SCHOOL_ID'))
    .map(row => ({ id: String(row.SCHOOL_ID), name: row.NAME }));
}

export async function parents(db) {
  return (await db.rows("SELECT USER_ID, NAME FROM USERS WHERE USER_ROLE = 'parent' AND IS_ACTIVE = 1 ORDER BY NAME"))
    .map(row => ({ id: String(row.USER_ID), name: row.NAME }));
}

export async function buses(db, filter = null) {
  const rows = await db.rows(`SELECT b.*, s.NAME AS SCHOOL_NAME, s.LATITUDE, s.LONGITUDE
    FROM BUSES b JOIN SCHOOLS s ON s.SCHOOL_ID = b.SCHOOL_ID
    WHERE b.IS_ACTIVE = 1 AND (:id IS NULL OR b.BUS_ID = :id) ORDER BY b.BUS_ID`, { id: filter });
  return rows.map(row => ({
    id: String(row.BUS_ID), plate: row.PLATE_NUMBER, cap: row.CAPACITY ?? 30,
    driverId: row.DRIVER_ID, schoolId: row.SCHOOL_ID,
    start: row.SCHOOL_NAME, school: { n: row.SCHOOL_NAME, lat: row.LATITUDE, lng: row.LONGITUDE },
  }));
}

export async function students(db) {
  const rows = await db.rows(`SELECT s.STUDENT_ID, s.NAME, s.BUS_ID, l.ADDRESS, l.LABEL, l.LATITUDE, l.LONGITUDE,
    p.USER_ID AS GUARDIAN_ID, p.NAME AS GUARDIAN
    FROM STUDENTS s
    LEFT JOIN STUDENT_LOCATIONS l ON l.LOCATION_ID = (
      SELECT MIN(x.LOCATION_ID) FROM STUDENT_LOCATIONS x WHERE x.STUDENT_ID = s.STUDENT_ID AND x.IS_DEFAULT = 1)
    LEFT JOIN USERS p ON p.USER_ID = (
      SELECT MIN(g.USER_ID) FROM STUDENT_GUARDIANS g WHERE g.STUDENT_ID = s.STUDENT_ID)
    WHERE s.IS_ACTIVE = 1 ORDER BY s.STUDENT_ID`);
  return rows.map(row => ({ id: String(row.STUDENT_ID), name: row.NAME, bus: row.BUS_ID == null ? '' : String(row.BUS_ID),
    area: row.ADDRESS ?? row.LABEL ?? '', lat: row.LATITUDE, lng: row.LONGITUDE,
    parent: row.GUARDIAN ?? '', parentId: row.GUARDIAN_ID == null ? '' : String(row.GUARDIAN_ID) }));
}

export async function drivers(db) {
  const rows = await db.rows(`SELECT u.USER_ID, u.NAME,
    (SELECT MIN(p.PHONE_NUMBER) FROM USER_PHONES p WHERE p.USER_ID = u.USER_ID) AS PHONE,
    (SELECT MIN(b.BUS_ID) FROM BUSES b WHERE b.DRIVER_ID = u.USER_ID AND b.IS_ACTIVE = 1) AS BUS_ID
    FROM USERS u WHERE u.USER_ROLE = 'driver' AND u.IS_ACTIVE = 1 ORDER BY u.USER_ID`);
  return rows.map(row => ({ id: String(row.USER_ID), name: row.NAME, phone: row.PHONE ?? '',
    bus: row.BUS_ID == null ? '' : String(row.BUS_ID) }));
}

export async function saveStudent(db, id, body) {
  const name = text(body.name, 'Student name', 100);
  const area = text(body.area, 'Pickup location', 250);
  const bus = (await buses(db, identifier(body.bus)))[0];
  const parent = identifier(body.parentId);
  expect(bus, 'Choose an active bus.');
  expect((await parents(db)).some(record => record.id === String(parent)), 'Choose an active parent.');
  const { lat, lng } = body;
  expect(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180,
    'Enter valid pickup coordinates.');
  const values = { name, bus: Number(bus.id), school: bus.schoolId };
  if (id) {
    const result = await db.execute(`UPDATE STUDENTS SET NAME = :name, BUS_ID = :bus, SCHOOL_ID = :school
      WHERE STUDENT_ID = :id AND IS_ACTIVE = 1`, { ...values, id });
    expect(result.rowsAffected, 'Student not found.', 404);
  } else {
    id = await db.insert('INSERT INTO STUDENTS (NAME, BUS_ID, SCHOOL_ID) VALUES (:name, :bus, :school)', values, 'STUDENT_ID');
  }
  const location = { id, area, lat, lng };
  const updated = await db.execute(`UPDATE STUDENT_LOCATIONS SET ADDRESS = :area, LATITUDE = :lat, LONGITUDE = :lng
    WHERE STUDENT_ID = :id AND IS_DEFAULT = 1`, location);
  if (!updated.rowsAffected) await db.execute(`INSERT INTO STUDENT_LOCATIONS
    (STUDENT_ID, LABEL, ADDRESS, LATITUDE, LONGITUDE, IS_DEFAULT) VALUES (:id, 'Pickup', :area, :lat, :lng, 1)`, location);
  // Add the selected guardian while preserving existing family links.
  if (!await first(db, 'SELECT USER_ID FROM STUDENT_GUARDIANS WHERE STUDENT_ID = :id AND USER_ID = :parent', { id, parent })) {
    await db.execute('INSERT INTO STUDENT_GUARDIANS (STUDENT_ID, USER_ID) VALUES (:id, :parent)', { id, parent });
  }
}

export async function addBus(db, body) {
  const plate = text(body.plate, 'Plate', 20);
  const school = identifier(body.schoolId);
  const cap = Number(body.cap);
  expect(Number.isInteger(cap) && cap >= 1 && cap <= 999, 'Capacity must be between 1 and 999.');
  expect((await schools(db)).some(record => record.id === String(school)), 'School not found.', 404);
  await db.execute('INSERT INTO BUSES (PLATE_NUMBER, SCHOOL_ID, CAPACITY) VALUES (:plate, :school, :cap)',
    { plate, school, cap });
}
