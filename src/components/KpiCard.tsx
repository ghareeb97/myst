import Link from "next/link";
import type { Route } from "next";

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "success" | "warning" | "danger";
  trend?: { direction: "up" | "down" | "flat"; label: string };
  href?: Route;
};

const TREND_ICONS = { up: "↑", down: "↓", flat: "→" };

export function KpiCard({
  label,
  value,
  hint,
  tone = "accent",
  trend,
  href
}: KpiCardProps) {
  const baseClass = tone === "accent" ? "card kpi-card" : `card kpi-card ${tone}`;
  const className = href ? `${baseClass} kpi-card--link` : baseClass;

  const content = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {trend ? (
        <div className={`kpi-trend kpi-trend--${trend.direction}`}>
          <span aria-hidden="true">{TREND_ICONS[trend.direction]}</span>
          {trend.label}
        </div>
      ) : null}
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}
