import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function coordinates({ lat, lng }) {
  return [lat, lng];
}

export function PickupMap({ route, mode = 'optimized', focusedId, onSelect }) {
  const element = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const instance = L.map(element.current);
    map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const summary = route[mode];
    const order = summary.order ?? route.order;
    const path = summary.path ?? route.path;
    const points = summary.geometry?.length ? summary.geometry : path;
    const layer = L.layerGroup().addTo(map.current);
    L.polyline(points.map(coordinates), {
      color: mode === 'manual' ? '#b45309' : '#2563eb',
      weight: 5,
      dashArray: mode === 'manual' ? '8 6' : undefined,
    }).addTo(layer);
    const pin = (point, label, title) => {
      const content = document.createElement('span');
      content.textContent = title;
      return L.marker(coordinates(point), {
        title,
        icon: L.divIcon({ className: 'pickup-pin', html: label, iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).bindTooltip(content).addTo(layer);
    };
    pin(path[0], 'D', 'Depot');
    order.forEach((stop, i) => {
      const marker = pin(stop, String(i + 1), stop.name || 'Pickup');
      marker.on('click', () => select.current?.(stop.id));
      markers.current.set(stop.id, marker);
    });
    if (route.endsAtSchool !== false) pin(path.at(-1), 'S', 'School');
    map.current.fitBounds([...points, ...path].map(coordinates), { padding: [24, 24], maxZoom: 16 });
    return () => {
      layer.remove();
      markers.current.clear();
    };
  }, [route, mode]);

  useEffect(() => {
    const marker = markers.current.get(focusedId);
    if (!marker) return;
    map.current.setView(marker.getLatLng(), Math.max(map.current.getZoom(), 15));
    marker.openTooltip();
  }, [focusedId, route, mode]);

  return <div ref={element} className="pickup-map" role="region" aria-label="School bus route map" />;
}
