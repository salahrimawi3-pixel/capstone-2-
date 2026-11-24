import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Overview, Records, Routes } from './Admin.jsx';
import { api, isDemo } from './api.js';
import { DEMO_KEY, NAVIGATION } from './data.js';
import { Landing, Login } from './PublicPages.jsx';
import { DriverTrip, ParentTrip } from './TripViews.jsx';
import './styles.css';

function App() {
  const [page, setPage] = useState('landing');
  const [session, setSession] = useState(null);
  const [view, setView] = useState('');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  function go(next) {
    setPage(next);
    window.scrollTo(0, 0);
  }

  function notify(text) {
    setMessage({ text });
  }

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!isDemo || !['parent', 'driver'].includes(session?.role)) return;
    function sync(event) {
      if (event.key === DEMO_KEY)
        api
          .dashboard(session.role)
          .then(setData)
          .catch((error) => notify(error.message));
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [session]);

  async function signedIn(user) {
    const navigation = NAVIGATION[user.role];
    if (!navigation) throw new Error('This account has an unsupported role.');
    const dashboard = await api.dashboard(user.role);
    setData(dashboard);
    setSession(user);
    setView(navigation[0][0]);
    go('dashboard');
    notify(`Signed in as ${user.name}`);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await api.signOut();
      setSession(null);
      setData(null);
      setMessage(null);
      go('landing');
    } catch (error) {
      notify(error.message);
    } finally {
      setSigningOut(false);
    }
  }

  const refresh = async (childId) => setData(await api.dashboard(session.role, childId));
  const props = { data, onSaved: setData, notify, refresh };
  return (
    <>
      {page === 'landing' && <Landing onSignIn={() => go('login')} />}
      {page === 'login' && <Login onBack={() => go('landing')} onSignedIn={signedIn} />}
      {page === 'dashboard' && (
        <div className="app">
          <nav className="side" aria-label="Dashboard">
            <b>▲ SmartRoute</b>
            {NAVIGATION[session.role].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={view === id ? 'on' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => {
                  setView(id);
                  window.scrollTo(0, 0);
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={signOut} disabled={signingOut}>
              Sign out
            </button>
          </nav>
          <main className="main">
            {view === 'overview' && <Overview data={data} />}
            {['students', 'drivers', 'buses'].includes(view) && (
              <Records key={view} type={view} {...props} />
            )}
            {view === 'routes' && <Routes {...props} />}
            {view === 'trip' && <DriverTrip {...props} />}
            {view === 'child' && (
              <ParentTrip data={data} refresh={refresh} />
            )}
          </main>
        </div>
      )}
      {message && (
        <div id="toast" role="status">
          {message.text}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
