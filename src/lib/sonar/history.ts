const STORAGE_KEY = "sonar_scan_history";
const MAX_RECORDS = 50;

export interface SonarScanRecord {
  id: string;
  createdAt: number;
  projectKey: string;
  branch: string;
  createTimeEnd: string;
  author: string;
  reportId: string;
  reportCreateTime?: string;
  fileCount: number;
  prompt: string;
}

export function getHistory(): SonarScanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records: SonarScanRecord[] = JSON.parse(raw);
    return records.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveRecord(
  data: Omit<SonarScanRecord, "id" | "createdAt">
): SonarScanRecord {
  const record: SonarScanRecord = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  const records = getHistory();
  records.unshift(record);

  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return record;
}

export function deleteRecord(id: string): void {
  const records = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
