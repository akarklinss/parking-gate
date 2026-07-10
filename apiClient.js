export default function Stats({ stats }) {
  return <section className="stats">
    <div><strong>{stats.total ?? '–'}</strong><span>Sarakstā</span></div>
    <div><strong>{stats.in ?? '–'}</strong><span>Teritorijā</span></div>
    <div><strong>{stats.out ?? '–'}</strong><span>Izbraukuši</span></div>
    <div><strong>{stats.blocked ?? '–'}</strong><span>Bloķēti</span></div>
  </section>;
}
