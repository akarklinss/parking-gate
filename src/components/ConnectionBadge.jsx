export default function ConnectionBadge({ online }) {
  return (
    <span className={`connection-badge ${online ? "online" : "offline"}`}>
      {online ? "ONLINE" : "NAV INTERNETA"}
    </span>
  );
}
