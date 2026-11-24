import { useState } from 'react';
import { api, isDemo } from './api.js';
import { ACCOUNTS, initialDemo } from './data.js';
import { optimize } from './optimizer.js';
import { RouteMap } from './RouteMap.jsx';
import { Button, Metrics, km, mins } from './ui.jsx';

const preview = optimize(initialDemo().students, 0.6);
const features = [
  [
    'Smart Route Optimization',
    'Nearest-stop construction plus 2-opt improvement over multiple student stops.',
  ],
  [
    'Traffic-Aware Planning',
    'Heavier traffic shifts the cost from distance toward travel time (simulated).',
  ],
  ['Estimated Arrival Times', 'ETA from cumulative leg times. Live estimates require a traffic feed.'],
  ['Student Location Management', 'Add, edit and remove pickup locations and parent details.'],
  ['Trip Management', 'Select students, generate routes and review trip history.'],
  ['Transportation Analytics', 'Trip counts, distance and savings at a glance.'],
];
const steps = [
  'Add students and pickup locations',
  'Pick a bus and the students for the trip',
  'Generate an optimized route under simulated traffic',
  'Driver follows ordered stops and checks them off',
];

export function Landing({ onSignIn }) {
  const scrollToFeatures = () =>
    document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
  return (
    <>
      <header className="nav">
        <b>▲ SmartRoute · Amman</b>
        <div className="actions">
          <Button onClick={scrollToFeatures}>Features</Button>
          <Button variant="pri" onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      </header>
      <main>
        <section className="hero">
          <span className="tag sim">Graduation project · Version 1 · one bus</span>
          <h1>Smart Traffic Aware Route Planner</h1>
          <p>
            Optimized school bus routes for Amman with student stops, estimated road distances and
            traffic-dependent travel times.
          </p>
          <div className="actions">
            <Button variant="pri" onClick={onSignIn}>
              Get Started
            </Button>
            <Button onClick={scrollToFeatures}>Explore Features</Button>
          </div>
          <div className="card preview">
            <RouteMap route={preview} />
            <div className="row">
              <span className="mu">
                Preview · {km(preview.optimized.km)} km · {mins(preview.optimized.minutes)} min ·{' '}
                {preview.order.length} stops
              </span>
              <span className="tag sim">Simulated traffic, schematic map</span>
            </div>
          </div>
        </section>
        <section className="sec" id="features">
          <h2>Features</h2>
          <div className="grid g3">
            {features.map(([title, description]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p className="mu">{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="sec">
          <h2>How it works</h2>
          <div className="grid g4">
            {steps.map((step, i) => (
              <article className="card" key={step}>
                <div className="num">{i + 1}</div>
                <p>{step}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="sec">
          <h2>Project targets</h2>
          <p className="mu">Proposed targets for project evaluation.</p>
          <Metrics
            items={[
              ['Shorter route distance', '≥10%'],
              ['Shorter completion time', '≥10%'],
              ['ETA accuracy', '≥80%'],
              ['Lower fuel use', '≥10%'],
            ]}
          />
        </section>
      </main>
      <footer className="nav">
        Smart Traffic Aware Route Planner · Amman, Jordan · Version 1 prototype
      </footer>
    </>
  );
}

export function Login({ onBack, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const user = await api.signIn(email.trim(), password);
      await onSignedIn(user);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="card">
        <h2>Sign in</h2>
        {isDemo && (
          <>
            <div className="banner">
              <b>Demo authentication.</b> Choose an account below to fill in the sample credentials.
            </div>
            <div className="actions">
              {Object.entries(ACCOUNTS).map(([role, [mail, pass, name]]) => (
                <Button
                  variant="sm"
                  key={role}
                  disabled={busy}
                  onClick={() => {
                    setEmail(mail);
                    setPassword(pass);
                    setError('');
                  }}
                >
                  {name}
                </Button>
              ))}
            </div>
          </>
        )}
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p>
            <Button variant="pri" className="full" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </p>
        </form>
        <Button variant="sm" onClick={onBack} disabled={busy}>
          ← Back
        </Button>
      </div>
    </main>
  );
}
