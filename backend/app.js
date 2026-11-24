import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { addBus, expect, first, identifier, saveStudent, text } from './records.js';
import { ammanDay, dashboard, planInputs, savePlan, updateTrip } from './trips.js';
import { buildRoute } from './routing.js';

const sessionCall = (req, action) => new Promise((resolve, reject) =>
  req.session[action](error => error ? reject(error) : resolve()));

export function createApp(db, config) {
  const app = express();
  const plans = new Map();
  const planLifetime = 20 * 60 * 1000;
  app.disable('x-powered-by');
  const api = express.Router();
  app.use('/api', api);
  api.use(express.json({ limit: '32kb' }));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && !['GET', 'HEAD'].includes(req.method) &&
        !config.allowedOrigins.includes(origin) && origin !== req.protocol + '://' + req.get('Host')) {
      return next(Object.assign(new Error('Request origin is not allowed.'), { status: 403 }));
    }
    next();
  });
  api.use(session({
    name: 'smartroute.sid', secret: config.secret, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, secure: config.secureCookie },
  }));
  api.get('/health', async (_req, res) => {
    await db.run(tx => tx.rows('SELECT 1 AS READY FROM DUAL'));
    res.json({ status: 'ok', routing: config.googleKey ? 'google' : 'estimate' });
  });
  api.post('/auth/login', async (req, res) => {
    const email = text(req.body?.email, 'Email', 150).toLowerCase();
    const password = req.body?.password;
    expect(typeof password === 'string' && Buffer.byteLength(password) <= 72 && password.length > 0,
      'Invalid credentials.', 401);
    const row = await db.run(tx => first(tx,
      'SELECT USER_ID, USER_ROLE, NAME, PASSWORD_HASH FROM USERS WHERE LOWER(EMAIL) = :email AND IS_ACTIVE = 1', { email }));
    expect(row && await bcrypt.compare(password, row.PASSWORD_HASH), 'Invalid credentials.', 401);
    await sessionCall(req, 'regenerate');
    req.session.actor = { id: row.USER_ID, role: row.USER_ROLE, name: row.NAME };
    res.json({ role: row.USER_ROLE, name: row.NAME });
  });
  api.post('/auth/logout', async (req, res) => {
    plans.delete(req.sessionID);
    await sessionCall(req, 'destroy');
    res.clearCookie('smartroute.sid').status(204).end();
  });
  api.use((req, _res, next) => {
    expect(req.session.actor, 'Sign in first.', 401);
    req.actor = req.session.actor;
    next();
  });
  const authorize = (role) => (req, _res, next) => {
    expect(req.actor.role === role, 'This action is unavailable to your role.', 403);
    next();
  };
  const admin = authorize('admin');
  const driver = authorize('driver');
  api.get('/dashboard', async (req, res) => {
    const result = await db.run(tx => dashboard(tx, req.actor, req.query.childId));
    res.json({ ...result, today: ammanDay() });
  });

  const adminUpdate = work => async (req, res) => {
    const result = await db.run(async tx => {
      await work(tx, req);
      return dashboard(tx, req.actor);
    });
    res.json({ ...result, today: ammanDay() });
  };
  api.post('/students', admin, adminUpdate((tx, req) => saveStudent(tx, null, req.body)));
  api.patch('/students/:id', admin, adminUpdate((tx, req) => saveStudent(tx, identifier(req.params.id), req.body)));
  api.delete('/students/:id', admin, adminUpdate(async (tx, req) => {
    const result = await tx.execute('UPDATE STUDENTS SET IS_ACTIVE = 0 WHERE STUDENT_ID = :id AND IS_ACTIVE = 1',
      { id: identifier(req.params.id) });
    expect(result.rowsAffected, 'Student not found.', 404);
  }));
  api.post('/buses', admin, adminUpdate((tx, req) => addBus(tx, req.body)));
  api.post('/drivers', admin, adminUpdate(async (tx, req) => {
    const name = text(req.body.name, 'Driver name', 100);
    const email = text(req.body.email, 'Email', 150).toLowerCase();
    const phone = text(req.body.phone, 'Phone', 20);
    const password = req.body.password;
    const bus = identifier(req.body.bus);
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
    expect(typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password) <= 72,
      'Use a password of at least 8 characters and at most 72 bytes.');
    const assignment = await first(tx, 'SELECT DRIVER_ID FROM BUSES WHERE BUS_ID = :bus AND IS_ACTIVE = 1 FOR UPDATE', { bus });
    expect(assignment && assignment.DRIVER_ID == null, 'Choose a bus without an assigned driver.', 409);
    const hash = await bcrypt.hash(password, 10);
    const id = await tx.insert(`INSERT INTO USERS (NAME, EMAIL, PASSWORD_HASH, USER_ROLE)
      VALUES (:name, :email, :hash, 'driver')`, { name, email, hash }, 'USER_ID');
    await tx.execute('INSERT INTO USER_PHONES (USER_ID, PHONE_NUMBER, IS_PRIMARY) VALUES (:id, :phone, 1)', { id, phone });
    await tx.execute('UPDATE BUSES SET DRIVER_ID = :id WHERE BUS_ID = :bus', { id, bus });
  }));

  api.post('/routes/optimize', admin, async (req, res) => {
    const inputs = await db.run(tx => planInputs(tx, req.body));
    let route;
    try {
      route = await buildRoute(inputs.bus.school, inputs.bus.school, inputs.stops, config.googleKey);
    } catch (error) {
      console.error('Routing:', error.message);
      expect(false, 'Routing service could not calculate the trip. Check the Google Routes configuration and try again.', 502);
    }
    const id = randomUUID();
    for (const [key, entry] of plans) if (entry.expires <= Date.now()) plans.delete(key);
    plans.set(req.sessionID, { ...inputs, route, id, expires: Date.now() + planLifetime });
    res.json({ ...route, id });
  });
  api.post('/trips', admin, adminUpdate(async (tx, req) => {
    const plan = plans.get(req.sessionID);
    expect(plan && plan.id === req.body?.planId && plan.expires > Date.now(),
      'The plan expired or changed. Generate the route again.', 409);
    await savePlan(tx, plan);
  }));
  api.patch('/driver/trip', driver, async (req, res) => {
    const result = await db.run(async tx => {
      await updateTrip(tx, req.actor, req.body);
      return dashboard(tx, req.actor, undefined, identifier(req.body.tripId));
    });
    res.json({ ...result, today: ammanDay() });
  });
  api.use((_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
  api.use((error, _req, res, _next) => {
    if (error.errorNum === 1) return res.status(409).json({ message: 'A record with those details already exists.' });
    const status = error.status ?? 500;
if (status >= 500) {
  console.error('========== SMARTROUTE ERROR ==========');
  console.error('Code:', error.code);
  console.error('Message:', error.message);
  console.error('Oracle Error Number:', error.errorNum);
  console.error('Stack:', error.stack);
  console.error('======================================');
}  res.status(status).json({ message: status === 500 ? 'Database request failed. Check the backend console.' : error.message });
  });
  return app;
}
