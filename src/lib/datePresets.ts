export const DATE_PRESETS = [
  { id: "today",         label: "Today" },
  { id: "yesterday",     label: "Yesterday" },
  { id: "this-week",     label: "This Week" },
  { id: "last-week",     label: "Last Week" },
  { id: "this-month",    label: "This Month" },
  { id: "last-month",    label: "Last Month" },
  { id: "last-3-months", label: "Last 3 Months" },
  { id: "this-year",     label: "This Year" },
] as const;

export type PresetId = (typeof DATE_PRESETS)[number]["id"];

function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = fmtDate(today);

  switch (preset) {
    case "today":
      return { from: todayStr, to: todayStr };

    case "yesterday": {
      const d = addDays(today, -1);
      return { from: fmtDate(d), to: fmtDate(d) };
    }

    case "this-week": {
      const dow = today.getDay();
      const monday = addDays(today, -((dow + 6) % 7));
      return { from: fmtDate(monday), to: todayStr };
    }

    case "last-week": {
      const dow = today.getDay();
      const thisMonday = addDays(today, -((dow + 6) % 7));
      return {
        from: fmtDate(addDays(thisMonday, -7)),
        to: fmtDate(addDays(thisMonday, -1)),
      };
    }

    case "this-month":
      return {
        from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: todayStr,
      };

    case "last-month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmtDate(first), to: fmtDate(last) };
    }

    case "last-3-months": {
      const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      return { from: fmtDate(start), to: todayStr };
    }

    case "this-year":
      return {
        from: fmtDate(new Date(today.getFullYear(), 0, 1)),
        to: todayStr,
      };

    default:
      return { from: todayStr, to: todayStr };
  }
}
