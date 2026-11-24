import {
  ACCOUNTS,
  ammanDate,
  DEMO_CHILD_ID,
  DEMO_DRIVER_ID,
  DEMO_KEY,
  DEPOT,
  initialDemo,
} from './data.js';
import { optimize } from './optimizer.js';
import { planWithRouteEngine, usesRouteEngine } from './routeEngine.js';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
export const isDemo = !baseUrl;
export const usesOptimizer = isDemo && usesRouteEngine;

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the app API. Check that the Node server is running and the API URL is correct.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || (response.status === 502 ? 'The Node API is unavailable. Check the backend server and port.' : null) || `Request failed (${response.status}).`);
  if (response.status !== 204 && data === null)
    throw new Error('The server returned an invalid JSON response.');
  return data;
}

let demoData;
function readDemo() {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Continue with the in-memory demo if browser storage is unavailable.
  }
  return demoData || initialDemo();
}

function writeDemo(data) {
  demoData = data;
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  } catch {
    // The demo still works in this page session.
  }
}

function dashboard(role, data = readDemo()) {
  const { students, drivers, buses, trip } = data;
  if (role === 'admin') return data;

  const child = students.find((student) => student.id === DEMO_CHILD_ID) ?? null;
  const driver =
    role === 'driver'
      ? drivers.find((person) => person.id === DEMO_DRIVER_ID)
      : drivers.find((person) => person.bus === child?.bus);
  const bus = buses.find((vehicle) => vehicle.id === driver?.bus);
  const isDemoRun = driver?.id === DEMO_DRIVER_ID;
  const assignedRoute = isDemoRun && (!trip.route?.busId || trip.route.busId === bus?.id)
    ? trip.route
    : null;
  const route =
    assignedRoute ||
    optimize(
      students.filter((student) => student.bus === bus?.id),
      0.6,
    );
  const run = isDemoRun ? { ...trip, route } : { status: 'idle', pickedUpIds: [], route };
  return { driver, bus, trip: run, ...(role === 'parent' ? { child } : {}) };
}

function changeDemo(role, update) {
  const data = readDemo();
  update(data);
  writeDemo(data);
  return dashboard(role, data);
}

function nextId(records, prefix, first, digits) {
  const number = Math.max(first - 1, ...records.map(({ id }) => Number(id.slice(prefix.length)))) + 1;
  return prefix + String(number).padStart(digits, '0');
}

const demo = {
  async signIn(email, password) {
    const account = Object.entries(ACCOUNTS).find(
      ([, details]) => details[0] === email && details[1] === password,
    );
    if (!account) throw new Error('Invalid credentials.');
    return { role: account[0], name: account[1][2] };
  },
  async signOut() {},
  async dashboard(role) {
    return dashboard(role);
  },
  async saveStudent(student) {
    return changeDemo('admin', (data) => {
      if (student.id) {
        data.students = data.students.map((item) => (item.id === student.id ? student : item));
      } else {
        // Keep IDs distinct from students already referenced by an active or completed run.
        const used = [...data.students, ...(data.trip.route?.order ?? []), { id: DEMO_CHILD_ID }];
        data.students.push({ ...student, id: nextId(used, 'S-', 1001, 4) });
      }
    });
  },
  async deleteStudent(id) {
    return changeDemo('admin', (data) => {
      data.students = data.students.filter((student) => student.id !== id);
    });
  },
  async addDriver(driver) {
    return changeDemo('admin', (data) => {
      data.drivers.push({ ...driver, id: nextId(data.drivers, 'D-', 1, 2) });
    });
  },
  async addBus(bus) {
    return changeDemo('admin', (data) => {
      data.buses.push({ ...bus, start: DEPOT.n, id: nextId(data.buses, 'BUS-', 1, 2) });
    });
  },
  async plan({ busId, studentIds, traffic, seed, forceFallback }) {
    const { students, buses } = readDemo();
    const selected = students.filter(
      (student) => student.bus === busId && studentIds.includes(student.id),
    );
    const bus = buses.find((vehicle) => vehicle.id === busId);
    if (!bus || !selected.length) throw new Error('Select at least one student assigned to this bus.');
    if (selected.length > bus.cap) throw new Error(`This bus has capacity for ${bus.cap} students.`);
    return usesOptimizer ? planWithRouteEngine(selected, forceFallback) : optimize(selected, traffic, seed);
  },
  async savePlan({ busId, route }) {
    return changeDemo('admin', (data) => {
      if (data.trip.status === 'active') throw new Error('Finish the active trip before assigning a new route.');
      const driver = data.drivers.find((person) => person.id === DEMO_DRIVER_ID);
      if (driver?.bus !== busId) throw new Error('Assign this route to the demo driver’s bus.');
      data.trip = { status: 'idle', pickedUpIds: [], route: { ...route, busId } };
      data.history.unshift({
        id: nextId(data.history, 'T-', 1, 4),
        date: ammanDate(),
        bus: busId,
        stops: route.order.length,
        km: Number(route.optimized.km.toFixed(1)),
        min: Math.round(route.optimized.minutes),
        by: 'Optimized',
      });
    });
  },
  async updateTrip(action, studentId) {
    return changeDemo('driver', (data) => {
      const { trip } = data;
      if (action === 'start' && trip.status === 'idle') {
        const route = dashboard('driver', data).trip.route;
        if (!route.order.length) throw new Error('There are no pickup stops for this trip.');
        data.trip = { status: 'active', pickedUpIds: [], route };
      } else if (
        action === 'pickup' &&
        trip.status === 'active' &&
        trip.route.order.some(({ id }) => id === studentId)
      ) {
        trip.pickedUpIds = [...new Set([...trip.pickedUpIds, studentId])];
      } else if (action === 'finish' && trip.status === 'active') {
        trip.status = 'done';
      } else if (action === 'reset' && trip.status === 'done') {
        data.trip = { status: 'idle', pickedUpIds: [], route: trip.route };
      } else {
        throw new Error('This action is unavailable for the current trip.');
      }
    });
  },
};

const server = {
  signIn: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  signOut: () => request('/auth/logout', { method: 'POST' }),
  dashboard: (_role, childId) => request(childId ? '/dashboard?childId=' + encodeURIComponent(childId) : '/dashboard'),
  saveStudent: ({ id, ...body }) =>
    request(id ? `/students/${encodeURIComponent(id)}` : '/students', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  deleteStudent: (id) => request(`/students/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addDriver: (body) => request('/drivers', { method: 'POST', body }),
  addBus: (body) => request('/buses', { method: 'POST', body }),
  plan: (body) => request('/routes/optimize', { method: 'POST', body }),
  savePlan: ({ busId, studentIds, traffic, route }) =>
    request('/trips', {
      method: 'POST',
      body: { busId, studentIds, traffic, planId: route.id },
    }),
  updateTrip: (action, studentId, tripId) =>
    request('/driver/trip', { method: 'PATCH', body: { action, studentId, tripId } }),
};

export const api = isDemo ? demo : server;
