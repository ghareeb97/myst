type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "success" | "warning" | "danger";
  trend?: { direction: "up" | "down" | "flat"; label: string };
};

const TREND_ICONS = { up: "↑", down: "↓", flat: "→" };

export function KpiCard({
  label,
  value,
  hint,
  tone = "accent",
  trend
}: KpiCardProps) {
  const className = tone === "accent" ? "card kpi-card" : `card kpi-card ${tone}`;

  return (
    <article className={className}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {trend ? (
        <div className={`kpi-trend kpi-trend--${trend.direction}`}>
          <span aria-hidden="true">{TREND_ICONS[trend.direction]}</span>
          {trend.label}
        </div>
      ) : null}
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </article>
  );
}
