import { useMemo, useState } from 'react';
import { deleteEvent, saveEvent } from '../services/eventStore.js';

export default function SetupScreen({ events, importedEvent, onStart, onEventsChange }) {
  const first = importedEvent || events[0] || { id: crypto.randomUUID(), name: '', apiUrl: '', eventKey: '', anprProvider: 'browser' };
  const [event, setEvent] = useState(first);
  const [operator, setOperator] = useState({ gate: '', guard: '', device: navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Device' });
  const [message, setMessage] = useState('');
  const selectedId = useMemo(() => event.id, [event.id]);

  const choose = id => setEvent(events.find(item => item.id === id) || first);
  const saveAndStart = async () => {
    if (!event.name || !event.apiUrl || !operator.gate || !operator.guard) return setMessage('Aizpildi pasākumu, API URL, Gate un apsargu.');
    const normalized = { ...event, id: event.id || crypto.randomUUID(), anprProvider: event.anprProvider || 'browser' };
    onEventsChange(saveEvent(normalized));
    try { await onStart(normalized, operator); }
    catch (error) { setMessage(error.message); }
  };

  return <main className="shell setup">
    <header className="brand"><div className="logo">P</div><div><h1>Parking Gate</h1><p>React + Vite v3</p></div></header>
    {events.length > 0 && <section className="card">
      <label>Saglabātie pasākumi</label>
      <select value={selectedId} onChange={e => choose(e.target.value)}>
        {events.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button className="danger ghost" onClick={() => { onEventsChange(deleteEvent(event.id)); setEvent({ id: crypto.randomUUID(), name: '', apiUrl: '', eventKey: '', anprProvider: 'browser' }); }}>Dzēst izvēlēto profilu</button>
    </section>}
    <section className="card form-grid">
      <label>Pasākuma nosaukums<input value={event.name} onChange={e => setEvent({...event, name:e.target.value})}/></label>
      <label>Apps Script /exec URL<input type="url" value={event.apiUrl} onChange={e => setEvent({...event, apiUrl:e.target.value})}/></label>
      <label>Pasākuma atslēga<input type="password" value={event.eventKey} onChange={e => setEvent({...event, eventKey:e.target.value})}/></label>
      <label>ANPR veids<select value={event.anprProvider} onChange={e => setEvent({...event, anprProvider:e.target.value})}><option value="browser">Bezmaksas OCR ierīcē</option><option value="external">Ārējs ANPR nākotnē</option></select></label>
      <label>Gate<input value={operator.gate} onChange={e => setOperator({...operator, gate:e.target.value})}/></label>
      <label>Apsargs<input value={operator.guard} onChange={e => setOperator({...operator, guard:e.target.value})}/></label>
      <label>Ierīces nosaukums<input value={operator.device} onChange={e => setOperator({...operator, device:e.target.value})}/></label>
      <button className="primary" onClick={saveAndStart}>Pārbaudīt un sākt darbu</button>
      {message && <p className="error-text">{message}</p>}
    </section>
  </main>;
}
