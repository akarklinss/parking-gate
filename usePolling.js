import { QRCodeSVG } from 'qrcode.react';
import { buildInviteUrl } from '../services/eventStore.js';

export default function AdminPanel({ open, onClose, event, stats, logs }) {
  if (!open) return null;
  const invite = buildInviteUrl(event);
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" onClick={e=>e.stopPropagation()}>
    <header><div><h2>{event.name}</h2><p>Reāllaika pārskats un ierīces pieslēgšana</p></div><button onClick={onClose}>✕</button></header>
    <div className="admin-grid"><div><strong>{stats.total||0}</strong><span>Sarakstā</span></div><div><strong>{stats.in||0}</strong><span>Teritorijā</span></div><div><strong>{stats.out||0}</strong><span>Izbraukuši</span></div><div><strong>{stats.blocked||0}</strong><span>Bloķēti</span></div></div>
    <div className="qr-box"><QRCodeSVG value={invite} size={190}/><p>Noskenē QR jaunajā telefonā. Pēc tam jāievada Gate un apsargs.</p></div>
    <h3>Pēdējie notikumi</h3><div className="logs">{logs.map((log,i)=><article key={i}><b>{log.plate} · {log.result}</b><span>{log.time}</span><small>{log.gate} · {log.guard} · {log.device || log.source}</small></article>)}</div>
  </section></div>;
}
