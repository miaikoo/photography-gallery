export function getSiteUrl(): string {
  const url = process.env.SITE_URL;
  if (url) return url.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("SITE_URL must be set for production builds");
  }
  return "http://localhost:4173";
}
