import { useEffect, useRef, useState } from 'react';
import { SCHOOL } from './data.js';
import { PickupMap } from './PickupMap.jsx';
import { RouteMap } from './RouteMap.jsx';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID';
const authFailureEvent = 'smartroute:maps-auth-failure';
let libraries;
let authFailed = false;

function loadLibraries() {
  libraries ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previousAuthFailure = window.gm_authFailure;
    const callback = 'smartRouteGoogleMapsReady';
    const fail = () => {
      delete window[callback];
      script.remove();
      reject(new Error('Google Maps could not load.'));
    };
    window.gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event(authFailureEvent));
      fail();
      previousAuthFailure?.();
    };
    window[callback] = async () => {
      delete window[callback];
      try {
        const maps = window.google.maps;
        resolve(
          await Promise.all([
            maps.importLibrary('maps'),
            maps.importLibrary('marker'),
            maps.importLibrary('core'),
            maps.importLibrary('geometry'),
          ]),
        );
      } catch (error) {
        reject(error);
      }
    };
    const params = new URLSearchParams({ key: apiKey, loading: 'async', callback, v: 'quarterly' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return libraries;
}

function point({ lat, lng }) {
  return { lat, lng };
}

function GoogleRouteMap({ route, focusedId }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState(authFailed ? 'failed' : 'loading');
  const { path, order, encodedPolyline } = route;

  useEffect(() => {
    if (authFailed || !host.current) return;
    let active = true;
    let markers = [];
    let line;
    const showFallback = () => {
      if (active) setStatus('failed');
    };
    window.addEventListener(authFailureEvent, showFallback);

    async function renderMap() {
      const [{ Map, Polyline }, { AdvancedMarkerElement, PinElement }, { LatLngBounds }, { encoding }] =
        await loadLibraries();
      if (!active || authFailed) return;

      const geometry = encodedPolyline ? encoding.decodePath(encodedPolyline) : path.map(point);
      if (geometry.length < 2) throw new Error('Missing route geometry.');
      const map = (mapRef.current ??= new Map(host.current, {
        center: point(SCHOOL),
        zoom: 12,
        mapId,
        streetViewControl: false,
        mapTypeControl: false,
      }));
      const bounds = new LatLngBounds();
      geometry.forEach((position) => bounds.extend(position));
      const stops = [
        { position: path[0], label: 'D', title: 'Depot', color: '#475569' },
        ...order.map((stop, index) => ({
          position: stop,
          label: String(index + 1),
          title: `Stop ${index + 1} · ${stop.area || 'Pickup'}`,
          color: '#2563eb',
        })),
        { position: path.at(-1), label: 'S', title: route.school?.n ?? SCHOOL.n, color: '#0f766e' },
      ];
      markers = stops.map(({ position, label, title, color }) => {
        const coordinates = point(position);
        bounds.extend(coordinates);
        const pin = new PinElement({
          glyphText: label,
          glyphColor: '#fff',
          background: color,
          borderColor: color,
        });
        const marker = new AdvancedMarkerElement({ map, position: coordinates, title });
        marker.append(pin);
        return marker;
      });
      line = new Polyline({
        map,
        path: geometry,
        strokeColor: '#2563eb',
        strokeOpacity: encodedPolyline ? 0.9 : 0.45,
        strokeWeight: encodedPolyline ? 5 : 3,
      });
      if (focusedId) {
        const focused = order.find(stop => stop.id === focusedId);
        if (focused) {
          map.setCenter(point(focused));
          map.setZoom(15);
        } else map.fitBounds(bounds, 42);
      } else map.fitBounds(bounds, 42);
      setStatus('ready');
    }

    renderMap().catch(showFallback);
    return () => {
      active = false;
      window.removeEventListener(authFailureEvent, showFallback);
      markers.forEach((marker) => {
        marker.map = null;
      });
      line?.setMap(null);
    };
  }, [path, order, encodedPolyline, focusedId]);

  if (status === 'failed')
    return (
      <>
        <RouteMap route={route} />
        <p className="mu map-legend">Google Maps is unavailable. Showing the schematic route.</p>
      </>
    );

  return (
    <>
      <div
        className="driver-google-map"
        ref={host}
        role="region"
        aria-label="Google Maps route in Amman"
      />
      <p className="mu map-legend" role="status">
        {status === 'loading'
          ? 'Loading Google Maps…'
          : encodedPolyline
            ? 'Road route · D: Depot · S: School'
            : 'Pickup locations connected in order · D: Depot · S: School'}
      </p>
    </>
  );
}

export function DriverRouteMap({ route, focusedId, onSelect }) {
  if (apiKey && route.endsAtSchool !== false) return <GoogleRouteMap route={route} focusedId={focusedId} />;
  if (route.path?.length > 1) return <PickupMap route={route} focusedId={focusedId} onSelect={onSelect} />;
  return (
    <>
      <RouteMap route={route} />
      <p className="mu map-legend">
        Schematic route · The embedded Google map needs a configured API key.
      </p>
    </>
  );
}

export function DirectionsLink({ destination }) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  return (
    <a
      className="btn pri directions-link"
      href={`https://www.google.com/maps/dir/?${params}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Open in Google Maps
    </a>
  );
}
