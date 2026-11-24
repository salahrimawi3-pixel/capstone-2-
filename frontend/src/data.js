export const SCHOOL = { n: 'Amman Modern School', lat: 31.98, lng: 35.87 },
  DEPOT = { n: 'Bus depot, Sweifieh', lat: 31.957, lng: 35.859 };
export const AREAS = {
  Abdoun: [31.9454, 35.8892],
  'Jabal Amman': [31.95, 35.923],
  Khalda: [31.993, 35.844],
  'Tla’a Al-Ali': [32.002, 35.878],
  Shmeisani: [31.968, 35.896],
  Jubeiha: [32.016, 35.873],
  Dabouq: [31.999, 35.813],
  'Um Uthaina': [31.965, 35.88],
};
const students = [
  ['Omar Haddad', 'Abdoun', 'Rana Haddad'],
  ['Lina Khoury', 'Jabal Amman', 'Sami Khoury'],
  ['Yousef Nasser', 'Khalda', 'Hala Nasser'],
  ['Maya Saleh', 'Tla’a Al-Ali', 'Fadi Saleh'],
  ['Zain Odeh', 'Shmeisani', 'Dina Odeh'],
  ['Noor Taha', 'Jubeiha', 'Rami Taha'],
  ['Adam Qasem', 'Dabouq', 'Suha Qasem'],
  ['Sara Bakri', 'Um Uthaina', 'Ali Bakri'],
].map((a, i) => ({
  id: 'S-' + (1001 + i),
  name: a[0],
  area: a[1],
  lat: AREAS[a[1]][0],
  lng: AREAS[a[1]][1],
  parent: a[2],
  bus: 'BUS-01',
}));
const drivers = [
  { id: 'D-01', name: 'Khaled Mansour', phone: '0790 000 101', bus: 'BUS-01' },
  { id: 'D-02', name: 'Ahmad Zreiqat', phone: '0790 000 102', bus: 'BUS-02' },
];
const buses = [
  { id: 'BUS-01', plate: '12-34567', cap: 30, start: DEPOT.n },
  { id: 'BUS-02', plate: '15-76543', cap: 25, start: DEPOT.n },
];
const history = [
  { id: 'T-0003', date: '2026-10-29', bus: 'BUS-01', stops: 8, km: 31.4, min: 62, by: 'Optimized' },
  { id: 'T-0002', date: '2026-10-28', bus: 'BUS-01', stops: 8, km: 33.0, min: 66, by: 'Optimized' },
  { id: 'T-0001', date: '2026-10-27', bus: 'BUS-01', stops: 7, km: 38.2, min: 74, by: 'Manual' },
];
export const ACCOUNTS = {
  admin: ['admin@demo.jo', 'admin123', 'Administrator'],
  driver: ['driver@demo.jo', 'driver123', 'Driver'],
  parent: ['parent@demo.jo', 'parent123', 'Parent'],
};

export const DEMO_KEY = 'smartroute-demo-v1';
export const DEMO_CHILD_ID = 'S-1001';
export const DEMO_DRIVER_ID = 'D-01';
export const TRAFFIC_LEVELS = [
  ['Normal', 0.2],
  ['Moderate', 0.6],
  ['Heavy', 1],
];
export const NAVIGATION = {
  admin: [
    ['overview', 'Overview'],
    ['students', 'Students'],
    ['drivers', 'Drivers'],
    ['buses', 'Buses'],
    ['routes', 'Trips & routes'],
  ],
  driver: [['trip', 'My trip']],
  parent: [['child', 'My child']],
};

export function initialDemo() {
  return structuredClone({
    students,
    drivers,
    buses,
    history,
    trip: { status: 'idle', pickedUpIds: [], route: null },
  });
}

export function ammanDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', dateStyle: 'short' }).format();
}
