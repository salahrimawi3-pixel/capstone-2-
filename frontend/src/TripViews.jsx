import { useState } from 'react';
import { api, isDemo } from './api.js';
import { SCHOOL } from './data.js';
import { DirectionsLink, DriverRouteMap } from './DriverRouteMap.jsx';
import { RouteMap } from './RouteMap.jsx';
import { Button, Modal, Stop, km, mins } from './ui.jsx';

const statuses = { idle: 'Not started', active: 'In progress', done: 'Finished' };

export function DriverTrip({ data, onSaved, notify, refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmFinish, setConfirmFinish] = useState(false);
  const { driver, bus, trip } = data;
  async function reload() {
    setBusy(true);
    setError('');
    try { await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!driver || !bus || !trip?.route) return <div className="card">
    <p>No trip is assigned.</p>
    <Button disabled={busy} onClick={reload}>Refresh trip</Button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
  const { route, status, pickedUpIds } = trip;
  const endsAtSchool = route.endsAtSchool !== false;
  const school = route.school ?? SCHOOL;
  const count = route.order.filter(({ id }) => pickedUpIds.includes(id)).length;
  const nextIndex = route.order.findIndex(({ id }) => !pickedUpIds.includes(id));
  const next = route.order[nextIndex];

  async function update(action, studentId) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await api.updateTrip(action, studentId, trip.id));
      setConfirmFinish(false);
      notify(
        {
          start: 'Trip started',
          pickup: 'Marked as picked up',
          finish: 'Trip finished',
          reset: 'Demo trip reset',
        }[action],
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered driver">
      <div className="row">
        <h2>Driver · {driver.name}</h2>
        {!isDemo && <Button disabled={busy} onClick={reload}>Refresh trip</Button>}
      </div>
      <p className="mu">
        {bus.id} · {endsAtSchool ? school.n : "Last pickup destination"}{trip.date && ` · ${trip.date}`}
      </p>
      <div className="banner">
        {route.matrixSource || (isDemo ? 'Demo pickup locations and trip times are simulated.' : 'Route times are estimates.')}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="card">
        <DriverRouteMap route={route} />
        <div className="grid driver-stats">
          <div>
            <span className="mu">Distance</span>
            <div className="big">{km(route.optimized.km)} km</div>
          </div>
          <div>
            <span className="mu">Duration</span>
            <div className="big">{mins(route.optimized.minutes)} min</div>
          </div>
          <div>
            <span className="mu">Status</span>
            <div className="big status">{statuses[status]}</div>
          </div>
        </div>
        {status === 'idle' && (
          <p>
            <Button
              variant="pri"
              className="full"
              disabled={busy || !route.order.length || (!isDemo && trip.date !== data.today)}
              onClick={() => update('start')}
            >
              Start Trip
            </Button>
          </p>
        )}
        {status === 'active' && (next || endsAtSchool) && (
          <div className="next-stop row">
            <div>
              <span className="mu">
                {next ? `Next pickup · Stop ${nextIndex + 1}` : 'Next stop · School drop-off'}
              </span>
              <div>
                <b>{next?.name ?? school.n}</b>
              </div>
              {next?.area && <span className="mu">{next.area}</span>}
            </div>
            <DirectionsLink destination={next ?? route.path.at(-1)} />
          </div>
        )}
        {status === 'active' && (
          <p>
            <Button
              variant="pri"
              className="full"
              disabled={busy}
              onClick={() => {
                if (count < route.order.length) setConfirmFinish(true);
                else update('finish');
              }}
            >
              Finish Trip
            </Button>
          </p>
        )}
        {status === 'done' && isDemo && (
          <p>
            <Button className="full" disabled={busy} onClick={() => update('reset')}>
              Reset demo
            </Button>
          </p>
        )}
      </div>
      <div className="card spaced">
        <h3>
          Pickup checklist ({count}/{route.order.length})
        </h3>
        {route.order.map((student, i) => {
          const pickedUp = pickedUpIds.includes(student.id);
          return (
            <Stop key={student.id} number={i + 1} student={student}>
              {pickedUp ? (
                <span className="tag ok">✓ Picked up</span>
              ) : status === 'active' ? (
                <Button
                  variant="sm pri"
                  disabled={busy}
                  aria-label={`Pick up ${student.name}`}
                  onClick={() => update('pickup', student.id)}
                >
                  Pick up
                </Button>
              ) : (
                <span className={status === 'done' ? 'tag sim' : 'tag'}>
                  {status === 'done' ? 'Missed' : 'Waiting'}
                </span>
              )}
            </Stop>
          );
        })}
        {endsAtSchool && <Stop number="S" student={{ name: school.n, area: 'School drop-off' }} />}
      </div>
      {confirmFinish && (
        <Modal
          title="Finish trip?"
          busy={busy}
          onClose={() => {
            setConfirmFinish(false);
            setError('');
          }}
        >
          <p className="mu">Some students are still marked as waiting. Finish the run anyway?</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmFinish(false);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="pri" disabled={busy} onClick={() => update('finish')}>
              Finish anyway
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ParentTrip({ data, refresh }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { child, driver, bus, trip } = data;
  if (!child) return <p className="card">No student is linked to this parent account.</p>;
  const { route, status, pickedUpIds } = trip ?? {};
  const endsAtSchool = route?.endsAtSchool !== false;
  const stopIndex = route?.order.findIndex(({ id }) => id === child.id) ?? -1;
  const pickedUp = pickedUpIds?.includes(child.id);
  const state =
    stopIndex === -1
      ? 'No pickup assigned'
      : status === 'idle'
        ? 'Trip not started'
        : status === 'done'
          ? pickedUp
            ? (endsAtSchool ? 'Arrived at school' : 'Pickup trip finished')
            : 'Pickup missed'
          : pickedUp
            ? (endsAtSchool ? 'On board, heading to school' : 'On board')
            : 'Bus on its way';
  const lastPickup =
    route?.order.reduce((last, { id }, i) => (pickedUpIds.includes(id) ? i : last), -1) ?? -1;
  const elapsed = route?.optimized.arrivalMinutes[lastPickup] ?? 0;
  const arrival = pickedUp ? route?.optimized.minutes : route?.optimized.arrivalMinutes[stopIndex];
  const eta =
    status === 'active' && endsAtSchool && Number.isFinite(arrival) ? Math.max(0, mins(arrival - elapsed)) : null;
  const notifications = [];
  if (status === 'done' && pickedUp && endsAtSchool) notifications.push('Student dropped off', 'Bus arrived at school');
  if (pickedUp) notifications.push('Student picked up');

  async function reload(childId = child.id) {
    setBusy(true);
    setError('');
    try {
      await refresh(childId);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <div className="row">
        <h2>Parent · {child.parent}</h2>
        <Button variant="sm" disabled={busy} onClick={() => reload()}>
          {busy ? 'Refreshing…' : 'Refresh status'}
        </Button>
      </div>
      {data.children?.length > 1 && <>
        <label htmlFor="parent-child">Student</label>
        <select id="parent-child" value={child.id} disabled={busy} onChange={(event) => reload(event.target.value)}>
          {data.children.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}
        </select>
      </>}
      {isDemo && (
        <div className="banner">
          Trip updates are based on the demo driver checklist. Live GPS and push notifications are
          planned.
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="grid g2">
        <div className="card">
          <h3>{child.name}</h3>
          <p className="mu">
            {child.id} · Pickup: {child.area}
          </p>
          {driver && bus ? (
            <p>
              Driver: <b>{driver.name}</b> · {driver.phone}
              <br />
              Bus: <b>{bus.id}</b> ({bus.plate})
            </p>
          ) : (
            <p className="mu">Driver and bus assignment pending.</p>
          )}
        </div>
        <div className="card">
          <span className="mu">Trip status</span>
          <div className="big status">{state}</div>
          <p>
            {pickedUp && endsAtSchool ? 'ETA to school' : 'ETA to pickup'}: <b>{eta === null ? '—' : `≈ ${eta} min`}</b>
            {isDemo && (
              <>
                {' '}
                <span className="tag sim">Simulated</span>
              </>
            )}
          </p>
        </div>
      </div>
      {route && (
        <div className="card spaced">
          <RouteMap route={route} hideStudentNames />
          <span className="tag sim">Schematic route</span>
        </div>
      )}
      <div className="card spaced">
        <h3>Notifications {isDemo && <span className="tag sim">Simulated</span>}</h3>
        {notifications.length ? (
          notifications.map((message) => (
            <div className="stop" key={message}>
              🔔 {message}
            </div>
          ))
        ) : (
          <p className="mu">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
