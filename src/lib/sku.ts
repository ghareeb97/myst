export function generateSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 8);

  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix || "PRD"}-${randomPart}`;
}
