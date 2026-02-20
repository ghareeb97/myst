type KpiCardProps = {
  label: string;
  value: string;
};

export function KpiCard({ label, value }: KpiCardProps) {
  return (
    <article className="card">
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </article>
  );
}
