const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}
