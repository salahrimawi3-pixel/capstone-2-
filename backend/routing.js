const googleBase = 'https://routes.googleapis.com/directions/v2:';
const waypoint = ({ lat, lng }) => ({ location: { latLng: { latitude: lat, longitude: lng } } });

async function google(method, body, fields, key) {
  const response = await fetch(googleBase + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Google Routes request failed with HTTP ' + response.status);
  return response.json();
}

function estimate(from, to) {
  const rad = Math.PI / 180;
  const h = Math.sin((to.lat - from.lat) * rad / 2) ** 2 +
    Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin((to.lng - from.lng) * rad / 2) ** 2;
  const km = 12742 * Math.asin(Math.sqrt(Math.min(1, h))) * 1.35;
  return { km, minutes: km * 60 / 30 };
}

async function getMatrix(points, key) {
  if (!key) return points.map(from => points.map(to => estimate(from, to)));
  const matrix = points.map(() => Array(points.length));
  const waypoints = points.map(point => ({ waypoint: waypoint(point) }));
  // At most 100 origin-destination pairs per request.
  for (let origin = 0; origin < points.length; origin += 10) {
    for (let destination = 0; destination < points.length; destination += 10) {
      const origins = waypoints.slice(origin, origin + 10);
      const destinations = waypoints.slice(destination, destination + 10);
      const cells = await google('computeRouteMatrix', {
        origins, destinations, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      }, 'originIndex,destinationIndex,status,condition,distanceMeters,duration', key);
      for (const cell of cells) {
        const i = origin + (cell.originIndex ?? 0);
        const j = destination + (cell.destinationIndex ?? 0);
        if (i === j) matrix[i][j] = { km: 0, minutes: 0 };
        else if (cell.condition === 'ROUTE_EXISTS' && !cell.status?.code) {
          const seconds = Number(cell.duration?.replace(/s$/, ''));
          if (Number.isFinite(seconds)) matrix[i][j] = { km: (cell.distanceMeters ?? 0) / 1000, minutes: seconds / 60 };
        }
      }
    }
  }
  for (const [i, row] of matrix.entries()) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) row[j] = { km: 0, minutes: 0 };
      if (!row[j]) throw new Error('Google Routes could not connect all selected stops.');
    }
  }
  return matrix;
}

export async function buildRoute(depot, school, stops, key) {
  const points = [depot, ...stops, school];
  const matrix = await getMatrix(points, key);
  const end = points.length - 1;
  const manualOrder = stops.map((_, i) => i + 1);
  const cost = (order) => [0, ...order].reduce((total, point, i) =>
    total + matrix[point][order[i] ?? end].minutes, 0);
  let order = [];
  const remaining = new Set(manualOrder);
  while (remaining.size) {
    const previous = order.at(-1) ?? 0;
    const next = [...remaining].reduce((best, i) =>
      matrix[previous][i].minutes < matrix[previous][best].minutes ? i : best);
    order.push(next);
    remaining.delete(next);
  }
  if (cost(manualOrder) < cost(order)) order = [...manualOrder];
  let score = cost(order);
  for (let pass = 0; pass < stops.length; pass++) {
    let improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const nextScore = cost(candidate);
        if (nextScore + 1e-8 < score) {
          order = candidate;
          score = nextScore;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  function summarize(indices) {
    const sequence = [0, ...indices, end];
    let km = 0;
    let minutes = 0;
    const arrivalMinutes = sequence.slice(1).map((point, i) => {
      const leg = matrix[sequence[i]][point];
      km += leg.km;
      minutes += leg.minutes;
      return minutes;
    });
    return { order: indices.map(i => points[i]), path: sequence.map(i => points[i]), km, minutes, arrivalMinutes, segments: [], fuel: km * 0.28 };
  }
  const optimized = summarize(order);
  const manual = summarize(manualOrder);
  const route = { order: optimized.order, path: optimized.path, optimized, manual, endsAtSchool: true,
    matrixSource: key ? 'Google Routes · traffic-aware estimates' : 'Haversine · estimated travel times' };
  if (key) {
    const data = await google('computeRoutes', {
      origin: waypoint(depot), destination: waypoint(school), intermediates: route.order.map(waypoint),
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
    }, 'routes.polyline.encodedPolyline', key);
    route.encodedPolyline = data.routes?.[0]?.polyline?.encodedPolyline;
  }
  return route;
}
