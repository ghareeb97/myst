type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "success" | "warning" | "danger";
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "accent"
}: KpiCardProps) {
  const className = tone === "accent" ? "card kpi-card" : `card kpi-card ${tone}`;

  return (
    <article className={className}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </article>
  );
}
