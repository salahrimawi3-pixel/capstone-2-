import { DEPOT, SCHOOL } from './data.js';

function evaluateLeg(from, to, traffic, seed) {
  const radians = Math.PI / 180;
  const haversine =
    Math.sin(((to.lat - from.lat) * radians) / 2) ** 2 +
    Math.cos(from.lat * radians) *
      Math.cos(to.lat * radians) *
      Math.sin(((to.lng - from.lng) * radians) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, haversine))) * 1.35;
  const variation = Math.sin((from.lat * to.lng + from.lng * to.lat + seed * 7.3) * 1000) * 10000;
  const factor = 1 + traffic * (0.25 + 0.9 * (variation - Math.floor(variation)));
  return { km, minutes: (km / 35) * 60 * factor, factor };
}

function summarize(path, leg) {
  const summary = { km: 0, minutes: 0, fuel: 0, segments: [], arrivalMinutes: [] };
  for (let i = 1; i < path.length; i++) {
    const segment = leg(path[i - 1], path[i]);
    summary.km += segment.km;
    summary.minutes += segment.minutes;
    summary.segments.push(segment.factor);
    summary.arrivalMinutes.push(summary.minutes);
  }
  summary.fuel = summary.km * 0.28;
  return summary;
}

// Nearest-stop construction followed by 2-opt, as in the uploaded prototype.
export function optimize(stops, traffic, seed = 1) {
  const leg = (from, to) => evaluateLeg(from, to, traffic, seed);
  const weight = 0.25 + 0.5 * traffic;
  const cost = (from, to) => {
    const { km, minutes } = leg(from, to);
    return (1 - weight) * km + weight * minutes * 0.4;
  };
  const pathFor = (order) => [DEPOT, ...order, SCHOOL];
  const totalCost = (order) => {
    const path = pathFor(order);
    return path.slice(1).reduce((sum, point, i) => sum + cost(path[i], point), 0);
  };

  const remaining = [...stops];
  let current = DEPOT;
  let order = [];
  while (remaining.length) {
    remaining.sort((a, b) => cost(current, a) - cost(current, b));
    current = remaining.shift();
    order.push(current);
  }
  let bestCost = totalCost(order);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const candidateCost = totalCost(candidate);
        if (candidateCost < bestCost - 1e-9) {
          order = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }
  const path = pathFor(order);
  const manualPath = pathFor(stops);
  return {
    order, path,
    optimized: summarize(path, leg),
    manual: { ...summarize(manualPath, leg), order: stops, path: manualPath },
  };
}
