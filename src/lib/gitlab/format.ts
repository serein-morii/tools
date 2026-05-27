export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

export function formatRelativeTime(ts: string): string {
  const now = Date.now();
  const date = new Date(ts).getTime();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  return num.toLocaleString();
}

export function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return fallback;
  }
}
