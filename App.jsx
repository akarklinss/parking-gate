const EVENTS_KEY = 'parkingGate.events.v3';
const SESSION_KEY = 'parkingGate.session.v3';

export function loadEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); }
  catch { return []; }
}

export function saveEvent(event) {
  const events = loadEvents();
  const index = events.findIndex(item => item.id === event.id);
  const next = index >= 0
    ? events.map(item => item.id === event.id ? event : item)
    : [...events, event];
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  return next;
}

export function deleteEvent(id) {
  const next = loadEvents().filter(item => item.id !== id);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  return next;
}

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function eventFromQuery() {
  const params = new URLSearchParams(location.search);
  const apiUrl = params.get('api') || '';
  if (!apiUrl) return null;
  return {
    id: params.get('id') || crypto.randomUUID(),
    name: params.get('event') || 'Pasākums',
    apiUrl,
    eventKey: params.get('key') || '',
    anprProvider: params.get('anpr') || 'browser'
  };
}

export function buildInviteUrl(event) {
  const url = new URL(`${location.origin}${import.meta.env.BASE_URL}`);
  url.searchParams.set('id', event.id);
  url.searchParams.set('event', event.name);
  url.searchParams.set('api', event.apiUrl);
  if (event.eventKey) url.searchParams.set('key', event.eventKey);
  url.searchParams.set('anpr', event.anprProvider || 'browser');
  return url.toString();
}
