const MAP = {
  ENTRY_ALLOWED:['ok','✓','ATĻAUTS'], ALREADY_IN:['warn','!','JAU IEBRAUCIS'], BLOCKED:['bad','✕','BLOĶĒTS'],
  TOO_EARLY:['warn','⏱','VĒL NAV DERĪGS'], EXPIRED:['bad','⌛','TERMIŅŠ BEIDZIES'], NOT_FOUND:['bad','✕','NAV SARAKSTĀ'],
  EXIT_RECORDED:['ok','✓','IZBRAUKŠANA REĢISTRĒTA'], EXIT_AFTER_DEADLINE:['warn','!','IZBRAUCA PĒC DEADLINE'],
  NOT_IN:['warn','!','NAV STATUSA IN'], EXIT_NOT_FOUND:['bad','✕','NAV SARAKSTĀ']
};
export default function ResultCard({ result }) {
  if (!result) return <section className="result neutral"><b>ⓘ</b><h2>Gatavs darbam</h2><p>Nolasiet vai ievadiet numuru.</p></section>;
  const [type,icon,title] = MAP[result.result] || ['bad','✕','KĻŪDA'];
  return <section className={`result ${type}`}><b>{icon}</b><h2>{title}</h2><div className="big-plate">{result.plate}</div><p>{result.name}<br/>{result.area}<br/>{result.message}</p></section>;
}
