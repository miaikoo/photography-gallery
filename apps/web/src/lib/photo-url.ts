export const photosPath = () => (process.env.CONTENT_SOURCE === "fixtures" ? "/fixture-photos" : "/photos");

export function photoUrl(event: string, photo: string, width: number, format: "avif" | "webp"): string {
  return `${photosPath()}/${event}/${photo}-${width}.${format}`;
}
