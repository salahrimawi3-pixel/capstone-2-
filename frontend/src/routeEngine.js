import { DEPOT } from './data.js';

export const usesRouteEngine = import.meta.env.VITE_USE_ROUTE_OPTIMIZER === 'true';
const prefix = '/route-engine';

async function post(endpoint, body) {
  const response = await fetch(prefix + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const detail = data?.detail;
    throw new Error(
      (Array.isArray(detail) ? detail.map(({ msg }) => msg).join(', ') : detail) ||
      'Route optimizer unavailable. Start FastAPI and check VITE_ROUTE_OPTIMIZER_URL.',
    );
  }
  return data;
}

function payload(students, forceFallback) {
  return {
    depot: { name: DEPOT.n, lat: DEPOT.lat, lon: DEPOT.lng },
    students: students.map(({ id, name, area, lat, lng }) => ({
      id, name, location: area, lat, lon: lng,
    })),
    force_fallback: forceFallback,
    return_to_depot: false,
  };
}

export async function planWithRouteEngine(students, forceFallback) {
  const result = await post('/optimize', payload(students, forceFallback));
  const studentsById = new Map(students.map((student) => [student.id, student]));
  function adapt(summary) {
    const order = summary.order.map((id) => studentsById.get(id));
    if (order.length !== students.length || order.some((stop) => !stop) ||
        new Set(summary.order).size !== students.length) {
      throw new Error('The route optimizer returned an invalid pickup order.');
    }
    return {
      order,
      path: [DEPOT, ...order],
      geometry: summary.geometry.map(([lat, lng]) => ({ lat, lng })),
      km: summary.distance_km,
      minutes: summary.duration_min,
      fuel: summary.distance_km * 0.28,
      arrivalMinutes: [],
      segments: [],
    };
  }
  const optimized = adapt(result.optimized);
  return {
    order: optimized.order,
    path: optimized.path,
    optimized,
    manual: adapt(result.manual),
    endsAtSchool: false,
    matrixSource: result.matrix_source,
    fallback: result.fallback,
  };
}

export function benchmarkRouteEngine(students, forceFallback) {
  return post('/benchmark', { ...payload(students, forceFallback), sizes: [5, 10, 15, 20] });
}
