const DEFAULT_CURRENCY = process.env.APP_CURRENCY ?? "EGP";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: DEFAULT_CURRENCY
  }).format(value);
}

export function formatDateTime(iso: string): string {
  const timezone = process.env.APP_TIMEZONE ?? "Africa/Cairo";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(new Date(iso));
}

/** Format a date string (YYYY-MM-DD) for display */
export function formatDateOnly(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
    new Date(date + "T00:00:00")
  );
}

/** Return today's date in YYYY-MM-DD format (Cairo timezone) */
export function todayInCairo(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}
