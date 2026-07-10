import { useCallback, useEffect, useMemo, useState } from 'react';
import SetupScreen from './components/SetupScreen.jsx';
import CameraPanel from './components/CameraPanel.jsx';
import Stats from './components/Stats.jsx';
import ResultCard from './components/ResultCard.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import { ParkingApi } from './services/apiClient.js';
import { eventFromQuery, loadEvents, loadSession, saveSession, clearSession } from './services/eventStore.js';
import { usePolling } from './hooks/usePolling.js';

const normalizePlate = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function App() {
  const [events, setEvents] = useState(loadEvents());
  const [session, setSession] = useState(loadSession());
  const [mode, setMode] = useState('entry');
  const [plate, setPlate] = useState('');
  const [source, setSource] = useState('MANUAL');
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const f=()=>setOnline(navigator.onLine); addEventListener('online',f); addEventListener('offline',f); return()=>{removeEventListener('online',f);removeEventListener('offline',f)}; }, []);
  const api = useMemo(() => session ? new ParkingApi(session.event, session.operator) : null, [session]);
  const refresh = useCallback(async () => { if (!api) return; try { const [s,l]=await Promise.all([api.stats(),api.recent(30)]); if(s.ok)setStats(s); if(l.ok)setLogs(l.logs||[]); } catch {} }, [api]);
  usePolling(refresh, 5000, Boolean(api));

  const start = async (event, operator) => { const candidate = new ParkingApi(event,operator); const ping=await candidate.ping(); if(!ping.ok) throw new Error(ping.error||'API kļūda'); const next={event,operator}; saveSession(next); setSession(next); };
  if (!session) return <SetupScreen events={events} importedEvent={eventFromQuery()} onStart={start} onEventsChange={setEvents}/>;

  const process = async () => {
    const normalized=normalizePlate(plate); if(!normalized)return; setBusy(true);
    try { const data=await api.process(mode,normalized,source); setResult(data); await refresh(); }
    catch(error){setResult({result:'ERROR',plate:normalized,message:error.message});}
    finally{setBusy(false);}
  };

  return <main className="shell">
    <header className="topbar"><div><h1>{session.event.name}</h1><p>{session.operator.gate} · {session.operator.guard}</p></div><div className={`online ${online?'yes':'no'}`}>{online?'ONLINE':'NAV INTERNETA'}</div><button onClick={()=>setAdmin(true)}>☰</button><button onClick={()=>{clearSession();setSession(null)}}>⚙</button></header>
    <div className="mode"><button className={mode==='entry'?'active':''} onClick={()=>setMode('entry')}>IEBRAUKŠANA</button><button className={mode==='exit'?'active exit':''} onClick={()=>setMode('exit')}>IZBRAUKŠANA</button></div>
    <Stats stats={stats}/>
    <CameraPanel providerId={session.event.anprProvider} onPlate={(value,src)=>{setPlate(value);setSource(src)}}/>
    <section className="card"><label>Auto numurs<input className="plate-input" value={plate} onChange={e=>{setPlate(normalizePlate(e.target.value));setSource('MANUAL')}} placeholder="AB1234"/></label><button className="primary big" disabled={busy} onClick={process}>{busy?'PĀRBAUDA…':mode==='entry'?'PĀRBAUDĪT / IELAIST':'REĢISTRĒT IZBRAUKŠANU'}</button><button className="secondary" onClick={()=>{setPlate('');setResult(null)}}>Notīrīt</button></section>
    <ResultCard result={result}/>
    <AdminPanel open={admin} onClose={()=>setAdmin(false)} event={session.event} stats={stats} logs={logs}/>
  </main>;
}
