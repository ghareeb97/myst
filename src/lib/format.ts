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
