export function isUrl(str: string): boolean {
  if (!str.startsWith("http://") && !str.startsWith("https://")) return false;
  try { new URL(str); return true; } catch { return false; }
}

export function formatUrl(str: string): string {
  return str.replace(/^https?:\/\//, "");
}
