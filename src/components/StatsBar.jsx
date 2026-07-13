export default function StatsBar({ stats, onOpenAdmin }) {
  return (
    <section className="stats-grid">
      <button className="stat-card" onClick={onOpenAdmin}>
        <strong>{stats?.total ?? "–"}</strong>
        <span>Sarakstā</span>
      </button>
      <div className="stat-card">
        <strong>{stats?.in ?? "–"}</strong>
        <span>Teritorijā</span>
      </div>
      <div className="stat-card">
        <strong>{stats?.out ?? "–"}</strong>
        <span>Izbraukuši</span>
      </div>
      <div className="stat-card">
        <strong>{stats?.onlineDevices ?? "–"}</strong>
        <span>Online ierīces</span>
      </div>
    </section>
  );
}
