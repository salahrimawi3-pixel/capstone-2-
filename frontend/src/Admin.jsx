import { useState } from 'react';
import { api, isDemo, usesOptimizer } from './api.js';
import { AREAS, SCHOOL, TRAFFIC_LEVELS } from './data.js';
import { DriverRouteMap } from './DriverRouteMap.jsx';
import { PickupMap } from './PickupMap.jsx';
import { benchmarkRouteEngine } from './routeEngine.js';
import { RouteMap } from './RouteMap.jsx';
import { Button, Metrics, Modal, Table, km, mins, percent } from './ui.jsx';

const columns = {
  students: [
    ['ID', 'id'],
    ['Name', 'name'],
    ['Pickup', 'area'],
    ['Parent', 'parent'],
    ['Bus', 'bus'],
  ],
  drivers: [
    ['ID', 'id'],
    ['Name', 'name'],
    ['Phone', 'phone'],
    ['Bus', 'bus'],
  ],
  buses: [
    ['ID', 'id'],
    ['Plate', 'plate'],
    ['Capacity', 'cap'],
    ['Starting location', 'start'],
  ],
  history: [
    ['ID', 'id'],
    ['Date', 'date'],
    ['Bus', 'bus'],
    ['Stops', 'stops'],
    ['Km', 'km'],
    ['Min', 'min'],
    ['Planning', 'by'],
  ],
};

export function Overview({ data }) {
  const { students, drivers, buses, history, trip } = data;
  const maximum = Math.max(1, ...history.map(({ km }) => km));
  return (
    <>
      <h2>Overview</h2>
      <p className="mu">Signed in as Administrator</p>
      <Metrics
        items={[
          ['Total students', students.length],
          ['Registered drivers', drivers.length],
          ['Available buses', buses.length],
          ['Active trips', trip?.status === 'active' ? 1 : 0],
          ['Trip history', history.length],
        ]}
      />
      <div className="grid g2 spaced">
        <div className="card">
          <div className="row">
            <h3>Route distance per trip (km)</h3>
            {isDemo && <span className="tag sim">Sample data</span>}
          </div>
          {history.length === 0 && <p className="mu">Saved trips will appear here.</p>}
          {[...history].reverse().map((item) => (
            <div className="chart-row" key={item.id}>
              {item.date} · {item.by}: {item.km}
              <div
                className={`bar ${item.by === 'Manual' ? 'manual' : ''}`}
                style={{ width: `${(item.km / maximum) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Version status</h3>
          <p>
            <span className="tag ok">Working</span> Students, drivers, buses, optimizer, trip checklist
          </p>
          {isDemo && (
            <p>
              <span className="tag sim">Simulated</span> Traffic, ETA and parent notifications
            </p>
          )}
          <p>
            <span className="tag">Planned</span> Live GPS tracking, push notifications, multi-bus
            operations
          </p>
          <p>
            <span className="tag">Data source</span> {isDemo ? 'Browser demo data' : 'Connected API'}
          </p>
        </div>
      </div>
    </>
  );
}

function BusOptions({ buses }) {
  return buses.map(({ id }) => <option key={id}>{id}</option>);
}

function RecordForm({ editor, buses, schools, parents, onClose, onSaved, notify }) {
  const { type, row } = editor;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const student = type === 'students';
  const driver = type === 'drivers';
  const deleting = type === 'delete';
  const singular = student || deleting ? 'student' : driver ? 'driver' : 'bus';
  const title = deleting ? 'Delete student?' : `${row ? 'Edit' : 'Add'} ${singular}`;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (field) => String(form.get(field) ?? '').trim();
    setBusy(true);
    setError('');
    try {
      let data;
      if (deleting) {
        data = await api.deleteStudent(row.id);
      } else if (student) {
        const area = value('area');
        const [lat, lng] = isDemo ? (row?.area === area ? [row.lat, row.lng] : AREAS[area]) : [Number(value('lat')), Number(value('lng'))];
        const name = value('name');
        const parent = value('parent');
        if (name.length < 2 || (isDemo && parent.length < 2)) throw new Error('Enter the student and parent names.');
        data = await api.saveStudent({ id: row?.id, name, area, lat, lng, parent, parentId: value('parentId'), bus: value('bus') });
      } else if (driver) {
        const name = value('name');
        const phone = value('phone');
        if (name.length < 2 || !/^\+?[0-9 ]+$/.test(phone) || phone.replace(/\D/g, '').length < 9) {
          throw new Error('Enter a valid name and phone number.');
        }
        data = await api.addDriver({ name, phone, email: value('email'), password: form.get('password'), bus: value('bus') });
      } else {
        const plate = value('plate');
        const cap = Number(value('cap'));
        if (!plate || !Number.isInteger(cap) || cap < 1)
          throw new Error('Enter a plate and a whole capacity above zero.');
        data = await api.addBus({ plate, cap, schoolId: value('schoolId') });
      }
      onSaved(data);
      onClose();
      notify(deleting ? 'Student deleted' : `${singular[0].toUpperCase()}${singular.slice(1)} saved`);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        {deleting ? (
          <p className="mu">
            Remove {row.name} ({row.id}) from the student list?
          </p>
        ) : (
          <>
            <label htmlFor="record-name">{student ? 'Full name' : driver ? 'Name' : 'Plate'}</label>
            <input
              id="record-name"
              name={student || driver ? 'name' : 'plate'}
              defaultValue={row?.name ?? ''}
              required
            />
            {student && (
              <>
                <label htmlFor="record-area">Pickup location</label>
                {isDemo ? <><select id="record-area" name="area" defaultValue={row?.area}>
                  {row?.area && !AREAS[row.area] && <option>{row.area}</option>}
                  {Object.keys(AREAS).map((area) => (
                    <option key={area}>{area}</option>
                  ))}
                </select>
                <label htmlFor="record-parent">Parent name</label>
                <input id="record-parent" name="parent" defaultValue={row?.parent ?? ''} required /></> : <>
                  <input id="record-area" name="area" defaultValue={row?.area ?? ''} required />
                  <label htmlFor="pickup-lat">Latitude</label>
                  <input id="pickup-lat" name="lat" type="number" step="any" min="-90" max="90" defaultValue={row?.lat} required />
                  <label htmlFor="pickup-lng">Longitude</label>
                  <input id="pickup-lng" name="lng" type="number" step="any" min="-180" max="180" defaultValue={row?.lng} required />
                  <label htmlFor="guardian">Link parent account</label>
                  <select id="guardian" name="parentId" defaultValue={row?.parentId ?? ''} required>
                    <option value="">Choose a parent</option>
                    {parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
                  </select>
                </>}
              </>
            )}
            {driver && (
              <>
                <label htmlFor="record-phone">Phone</label>
                <input id="record-phone" name="phone" type="tel" required />
                {!isDemo && <>
                  <label htmlFor="driver-email">Login email</label>
                  <input id="driver-email" name="email" type="email" required />
                  <label htmlFor="driver-password">Initial password</label>
                  <input id="driver-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                </>}
              </>
            )}
            {student || driver ? (
              <>
                <label htmlFor="record-bus">Bus</label>
                <select id="record-bus" name="bus" defaultValue={row?.bus} required>
                  <BusOptions buses={driver && !isDemo ? buses.filter(bus => !bus.driverId) : buses} />
                </select>
              </>
            ) : (
              <>
                {!isDemo && <>
                  <label htmlFor="bus-school">School</label>
                  <select id="bus-school" name="schoolId" required>
                    {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </select>
                </>}
                <label htmlFor="record-capacity">Capacity</label>
                <input
                  id="record-capacity"
                  name="cap"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="30"
                  required
                />
              </>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row modal-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="pri" className={deleting ? 'delete' : ''} type="submit" disabled={busy}>
            {busy ? 'Saving…' : deleting ? 'Delete' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function Records({ type, data, onSaved, notify }) {
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const student = type === 'students';
  const title = type[0].toUpperCase() + type.slice(1);
  const rows = student
    ? data.students.filter((row) =>
        [row.name, row.id, row.area].join(' ').toLowerCase().includes(query.trim().toLowerCase()),
      )
    : data[type];
  return (
    <>
      <div className="row">
        <h2>{title}</h2>
        <Button
          variant="pri"
          onClick={() => setEditor({ type })}
          disabled={type !== 'buses' && !data.buses.length}
        >
          {student ? '+ Add student' : '+ Add'}
        </Button>
      </div>
      {type !== 'buses' && !data.buses.length && (
        <p className="mu">Add a bus before assigning {type}.</p>
      )}
      {student && (
        <p>
          <input
            aria-label="Search students"
            placeholder="Search by name, ID or area"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </p>
      )}
      <div className={`card sc ${student ? '' : 'spaced'}`}>
        {rows.length ? (
          <Table
            columns={columns[type]}
            rows={rows}
            actions={
              student
                ? (row) => (
                    <div className="actions">
                      <Button variant="sm" onClick={() => setEditor({ type, row })}>
                        Edit
                      </Button>
                      <Button variant="sm dng" onClick={() => setEditor({ type: 'delete', row })}>
                        Delete
                      </Button>
                    </div>
                  )
                : undefined
            }
          />
        ) : (
          <p className="mu">{student ? 'No students match your search.' : `No ${type} yet.`}</p>
        )}
      </div>
      {editor && (
        <RecordForm
          editor={editor}
          buses={data.buses}
          schools={data.schools ?? []}
          parents={data.parents ?? []}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          notify={notify}
        />
      )}
    </>
  );
}

function RouteComparison({ route, onSave, saved, busy }) {
  const { manual, optimized } = route;
  const distance = percent(manual.km, optimized.km);
  const time = percent(manual.minutes, optimized.minutes);
  return (
    <div className="card sc">
      <h3>Manual vs optimized</h3>
      <Table
        columns={[
          ['Metric', 'metric'],
          ['Manual', 'manual'],
          ['Optimized', 'optimized'],
        ]}
        rows={[
          {
            id: 'distance',
            metric: 'Distance',
            manual: `${km(manual.km)} km`,
            optimized: `${km(optimized.km)} km`,
          },
          {
            id: 'time',
            metric: 'Time',
            manual: `${mins(manual.minutes)} min`,
            optimized: `${mins(optimized.minutes)} min`,
          },
        ]}
      />
      <p>
        Distance saved: <b>{km(manual.km - optimized.km)} km</b> ({km(distance)}%)
        <br />
        Time saved: <b>{mins(manual.minutes - optimized.minutes)} min</b> ({km(time)}%)
        <br />
        Average improvement: <b>{km((distance + time) / 2)}%</b>{' '}
        <span className="tag sim">Estimate</span>
      </p>
      <p className="mu">
        Project targets are ≥10% on distance and time. This comparison is a route estimate.
      </p>
      <Button variant="pri" onClick={onSave} disabled={busy || saved}>
        {saved ? 'Trip saved' : 'Save & assign trip'}
      </Button>
    </div>
  );
}

export function Routes({ data, onSaved, notify }) {
  const [busId, setBusId] = useState(data.buses[0]?.id ?? '');
  const [date, setDate] = useState(data.today ?? '');
  const [traffic, setTraffic] = useState(0.2);
  const [excluded, setExcluded] = useState([]);
  const [plan, setPlan] = useState(null);
  const [seed, setSeed] = useState(1);
  const [mode, setMode] = useState('optimized');
  const [focusedId, setFocusedId] = useState(null);
  const [forceFallback, setForceFallback] = useState(false);
  const [benchmark, setBenchmark] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const students = data.students.filter((student) => student.bus === busId);
  const selected = students.filter((student) => !excluded.includes(student.id));
  const bus = data.buses.find((item) => item.id === busId);
  const route = plan?.route;
  const order = (mode === 'manual' ? route?.manual.order : route?.order) ?? [];

  function invalidate() {
    setPlan(null);
    setBenchmark(null);
    setFocusedId(null);
    setSaved(false);
    setError('');
  }

  async function generate(recalculate = false) {
    if (busy) return;
    setError('');
    if (!selected.length) {
      setError('Select at least one student.');
      return;
    }
    if (selected.length > bus.cap) {
      setError(`This bus has capacity for ${bus.cap} students.`);
      return;
    }
    setBusy(true);
    const nextSeed = seed + Number(recalculate);
    const input = { busId, traffic, seed: nextSeed, studentIds: selected.map(({ id }) => id) };
    if (!isDemo) input.date = date;
    if (usesOptimizer) input.forceFallback = forceFallback;
    try {
      const result = await api.plan(input);
      setSeed(nextSeed);
      setMode('optimized');
      setFocusedId(null);
      setPlan({ ...input, route: result });
      setSaved(false);
      notify(recalculate ? 'Route recalculated' : 'Optimized route generated');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function runBenchmark() {
    setBusy(true);
    setError('');
    setBenchmark(null);
    try {
      setBenchmark(await benchmarkRouteEngine(selected, forceFallback));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!plan || busy || saved) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await api.savePlan(plan));
      setSaved(true);
      notify(isDemo ? 'Trip assigned to the driver and saved to history' : 'Trip saved to history');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Trips &amp; route optimization</h2>
      <div className="banner">
        {usesOptimizer
          ? 'FastAPI routing uses road-network estimates when available. The trip ends at the last pickup.'
          : isDemo ? 'Demo timings use simulated traffic. The trip ends at school.'
          : 'Travel times are estimates.'}
      </div>
      <div className="grid g2">
        <div className="card">
          <label htmlFor="school">Destination</label>
          <input id="school" value={usesOptimizer ? "Last pickup" : bus?.school?.n ?? SCHOOL.n} disabled />
          <label htmlFor="plan-bus">Bus</label>
          <select
            id="plan-bus"
            disabled={busy || !data.buses.length}
            value={busId}
            onChange={(event) => {
              setBusId(event.target.value);
              setExcluded([]);
              invalidate();
            }}
          >
            {!data.buses.length && <option value="">No buses available</option>}
            <BusOptions buses={data.buses} />
          </select>
          {!isDemo && <>
            <label htmlFor="trip-date">Morning trip date</label>
            <input id="trip-date" type="date" value={date} min={data.today} disabled={busy} onChange={(event) => {
              setDate(event.target.value);
              invalidate();
            }} />
          </>}
          {usesOptimizer ? (
            <label className="check">
              <input type="checkbox" checked={forceFallback} disabled={busy} onChange={(event) => {
                setForceFallback(event.target.checked);
                invalidate();
              }} />
              Use distance estimates (fallback test)
            </label>
          ) : isDemo && <>
          <label htmlFor="traffic">Simulated traffic</label>
          <select
            id="traffic"
            disabled={busy}
            value={traffic}
            onChange={(event) => {
              setTraffic(Number(event.target.value));
              invalidate();
            }}
          >
            {TRAFFIC_LEVELS.map(([label, value]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          </>}
          <p className="mu">
            Students · {selected.length} selected{bus && ` / ${bus.cap} seats`}
          </p>
          {!students.length && <p className="mu">No students are assigned to this bus.</p>}
          {students.map((student) => (
            <label className="check" key={student.id}>
              <input
                type="checkbox"
                disabled={busy}
                checked={!excluded.includes(student.id)}
                onChange={(event) => {
                  setExcluded(
                    event.target.checked
                      ? excluded.filter((id) => id !== student.id)
                      : [...excluded, student.id],
                  );
                  invalidate();
                }}
              />{' '}
              {student.name} <span className="mu">· {student.area}</span>
            </label>
          ))}
          <p className="actions">
            <Button variant="pri" onClick={() => generate()} disabled={busy || !selected.length}>
              Generate Optimized Route
            </Button>
            {isDemo && !usesOptimizer && <Button disabled={busy || !route} onClick={() => generate(true)}>
              Recalculate Route
            </Button>}
            {usesOptimizer && <Button disabled={busy || selected.length < 5} onClick={runBenchmark}>
              Run benchmark
            </Button>}
          </p>
          {busy && (
            <p role="status" className="mu">
              Working…
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="card">
          {!route && <p className="mu">Generate a route to see the map, stops and comparison.</p>}
          {route ? (
            <>
              <div className="actions">
                <button className="btn" aria-pressed={mode === 'optimized'} onClick={() => { setMode('optimized'); setFocusedId(null); }}>Optimized</button>
                {route.manual.order && <button className="btn" aria-pressed={mode === 'manual'} onClick={() => { setMode('manual'); setFocusedId(null); }}>Manual</button>}
              </div>
              {route.encodedPolyline && mode === 'optimized'
                ? <DriverRouteMap route={route} focusedId={focusedId} onSelect={setFocusedId} />
                : <PickupMap route={route} mode={mode} focusedId={focusedId} onSelect={setFocusedId} />}
              <p className="mu map-legend">{route.matrixSource || 'Estimated travel times'} · {mode === 'manual' ? 'Manual order' : 'Optimized order'}</p>
            </>
          ) : <RouteMap students={selected} />}
        </div>
      </div>
      {route && (
        <div className="spaced">
          <Metrics
            items={[
              ['Distance', `${km(route.optimized.km)} km`],
              ['Travel time', `${mins(route.optimized.minutes)} min`],
              ['Stops', route.order.length],
              ['Fuel (estimate)', `${km(route.optimized.fuel)} L`],
            ]}
          />
          <div className="grid g2 spaced">
            <div className="card">
              <h3>Visiting order</h3>
              {order.map((student, i) => (
                <button key={student.id} className="btn route-stop-button" aria-pressed={focusedId === student.id} onClick={() => setFocusedId(student.id)}>
                  {i + 1}. {student.name} · {student.area}
                </button>
              ))}
            </div>
            <RouteComparison route={route} onSave={save} saved={saved} busy={busy} />
          </div>
        </div>
      )}
      {benchmark && <div className="card sc spaced">
        <h3>Route benchmark</h3>
        <p className="mu">{benchmark.matrix_source}{benchmark.skipped.length ? ' · Need more stops for ' + benchmark.skipped.join(', ') : ''}</p>
        <Table columns={[
          ['Stops', 'stops'], ['Manual km', 'manual'], ['Optimized km', 'optimized'],
          ['Manual min', 'manualTime'], ['Optimized min', 'optimizedTime'], ['Solver ms', 'solver'],
        ]} rows={benchmark.rows.map((row) => ({
          id: row.stops, stops: row.stops, manual: km(row.manual_km), optimized: km(row.optimized_km),
          manualTime: mins(row.manual_min), optimizedTime: mins(row.optimized_min),
          solver: Math.round(row.execution_ms),
        }))} />
      </div>}
      <div className="card sc spaced">
        <h3>Previous trips</h3>
        {data.history.length ? (
          <Table columns={columns.history} rows={data.history} />
        ) : (
          <p className="mu">No trips saved yet.</p>
        )}
      </div>
    </>
  );
}
