const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function formatDate(iso: string): string {
  return toDate(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
}

export function formatShortDate(iso: string): string {
  return toDate(iso).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

export function formatCount(count: number): string {
  return `${count} ${count === 1 ? "photo" : "photos"}`;
}
