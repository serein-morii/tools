# Reminder History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/reminder/history` minimum working page so users can see recent reminder execution records and diagnose notification success or failure.

**Architecture:** Reuse the existing `reminders` table as the source of truth for recent execution records. Add a small backend DTO and query that joins `reminders` to `tasks` for task names, then expose it through one Tauri command and one React Query hook. Render status statistics and record cards in the existing reminder module layout.

**Tech Stack:** Rust, rusqlite, Tauri v2 commands, React 19, TypeScript, React Query, Tailwind CSS.

---

## File Structure

- Modify: `src-tauri/src/database/dao/reminder.rs` — add `ReminderHistoryItem`, query helper, and unit tests for status statistics helper.
- Modify: `src-tauri/src/commands/reminder.rs` — expose `get_reminder_history` Tauri command.
- Modify: `src-tauri/src/lib.rs` — register `get_reminder_history` in `generate_handler!`.
- Modify: `src/types/index.ts` — add `ReminderHistoryItem` frontend type matching Rust serialization.
- Modify: `src/lib/api/reminder.ts` — add `getHistory()` API call.
- Modify: `src/lib/query/reminderQueries.ts` — add `history` query key and `useReminderHistory()` hook.
- Modify: `src/pages/HistoryPage.tsx` — replace placeholder with history stats and record cards.

---

### Task 1: Backend History Query

**Files:**
- Modify: `src-tauri/src/database/dao/reminder.rs`

- [ ] **Step 1: Add failing backend tests**

Append these tests inside the existing `#[cfg(test)] mod tests` or create that module if absent in `src-tauri/src/database/dao/reminder.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_status_counts_group_known_statuses() {
        let items = vec![
            ReminderHistoryItem::test_item("sent"),
            ReminderHistoryItem::test_item("failed"),
            ReminderHistoryItem::test_item("pending"),
            ReminderHistoryItem::test_item("sent"),
        ];

        let counts = summarize_history_statuses(&items);

        assert_eq!(counts.total, 4);
        assert_eq!(counts.sent, 2);
        assert_eq!(counts.failed, 1);
        assert_eq!(counts.pending, 1);
    }

    impl ReminderHistoryItem {
        fn test_item(status: &str) -> Self {
            Self {
                id: format!("{}-id", status),
                task_id: "task-id".to_string(),
                task_name: "测试任务".to_string(),
                scheduled_at: 1,
                executed_at: Some(2),
                status: status.to_string(),
                channel_results: "[]".to_string(),
                error_message: None,
                user_action: None,
                user_feedback: None,
                created_at: 1,
            }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history_status_counts_group_known_statuses`

Expected: FAIL because `ReminderHistoryItem` and `summarize_history_statuses` do not exist.

- [ ] **Step 3: Add DTO, status summary, and query**

Add below `CreateReminderRequest` in `src-tauri/src/database/dao/reminder.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderHistoryItem {
    pub id: String,
    pub task_id: String,
    pub task_name: String,
    pub scheduled_at: i64,
    pub executed_at: Option<i64>,
    pub status: String,
    pub channel_results: String,
    pub error_message: Option<String>,
    pub user_action: Option<String>,
    pub user_feedback: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderHistoryStatusCounts {
    pub total: usize,
    pub sent: usize,
    pub failed: usize,
    pub pending: usize,
}

pub fn summarize_history_statuses(items: &[ReminderHistoryItem]) -> ReminderHistoryStatusCounts {
    ReminderHistoryStatusCounts {
        total: items.len(),
        sent: items.iter().filter(|item| item.status == "sent").count(),
        failed: items.iter().filter(|item| item.status == "failed").count(),
        pending: items.iter().filter(|item| item.status == "pending").count(),
    }
}
```

Add this row mapper near `Reminder::from_row`:

```rust
impl ReminderHistoryItem {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(ReminderHistoryItem {
            id: row.get(0)?,
            task_id: row.get(1)?,
            task_name: row.get(2)?,
            scheduled_at: row.get(3)?,
            executed_at: row.get(4)?,
            status: row.get(5)?,
            channel_results: row.get(6)?,
            error_message: row.get(7)?,
            user_action: row.get(8)?,
            user_feedback: row.get(9)?,
            created_at: row.get(10)?,
        })
    }
}
```

Add this method inside `impl ReminderDao`:

```rust
pub fn get_history(conn: &Connection, limit: i64) -> Result<Vec<ReminderHistoryItem>> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.task_id, COALESCE(t.name, '已删除任务') AS task_name,
                r.scheduled_at, r.executed_at, r.status, r.channel_results,
                r.error_message, r.user_action, r.user_feedback, r.created_at
         FROM reminders r
         LEFT JOIN tasks t ON t.id = r.task_id
         ORDER BY r.scheduled_at DESC
         LIMIT ?1"
    )?;

    let items = stmt.query_map([limit], ReminderHistoryItem::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(items)
}
```

- [ ] **Step 4: Run backend test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml history_status_counts_group_known_statuses`

Expected: PASS.

---

### Task 2: Expose History Command

**Files:**
- Modify: `src-tauri/src/commands/reminder.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Tauri command**

Change imports in `src-tauri/src/commands/reminder.rs` to include `ReminderHistoryItem`, then add:

```rust
#[tauri::command]
pub fn get_reminder_history(db: State<'_, Arc<Database>>) -> Result<Vec<ReminderHistoryItem>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_history(&conn, 100)
}
```

- [ ] **Step 2: Register command**

Add `commands::get_reminder_history,` to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs` after `commands::get_task_reminders,`.

- [ ] **Step 3: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

---

### Task 3: Frontend API and Query Hook

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api/reminder.ts`
- Modify: `src/lib/query/reminderQueries.ts`

- [ ] **Step 1: Add frontend type**

Add to `src/types/index.ts` after `Reminder`:

```ts
export interface ReminderHistoryItem {
  id: string;
  task_id: string;
  task_name: string;
  scheduled_at: number;
  executed_at?: number;
  status: string;
  channel_results: string;
  error_message?: string;
  user_action?: string;
  user_feedback?: string;
  created_at: number;
}
```

- [ ] **Step 2: Add API call**

Update `src/lib/api/reminder.ts` imports and object:

```ts
import type { Reminder, ReminderHistoryItem } from "@/types";

getHistory: (): Promise<ReminderHistoryItem[]> => call<ReminderHistoryItem[]>("get_reminder_history"),
```

- [ ] **Step 3: Add React Query hook**

Update `src/lib/query/reminderQueries.ts`:

```ts
history: () => [...reminderKeys.all, "history"] as const,
```

Add:

```ts
export function useReminderHistory() {
  return useQuery({
    queryKey: reminderKeys.history(),
    queryFn: reminderApi.getHistory,
    refetchInterval: 30000,
  });
}
```

- [ ] **Step 4: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 4: Render History Page

**Files:**
- Modify: `src/pages/HistoryPage.tsx`

- [ ] **Step 1: Replace placeholder page**

Replace the file with:

```tsx
import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import type { ReminderHistoryItem } from "@/types";

export function HistoryPage() {
  const { data: history, isLoading, error } = useReminderHistory();
  const items = history || [];
  const stats = {
    total: items.length,
    sent: items.filter((item) => item.status === "sent").length,
    failed: items.filter((item) => item.status === "failed").length,
    pending: items.filter((item) => item.status === "pending").length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载提醒历史中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">提醒历史加载失败</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title="全部" value={stats.total} />
        <StatCard title="成功" value={stats.sent} tone="success" />
        <StatCard title="失败" value={stats.failed} tone="danger" />
        <StatCard title="待执行" value={stats.pending} tone="muted" />
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无提醒记录，任务执行后会显示在这里。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-green-600",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ item }: { item: ReminderHistoryItem }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{item.task_name}</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">任务 ID: {item.task_id}</div>
        </div>
        <StatusBadge status={item.status} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <TimeRow label="计划时间" value={item.scheduled_at} />
          <TimeRow label="执行时间" value={item.executed_at} />
        </div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {summarizeChannelResults(item.channel_results)}
        </div>
        {item.error_message && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.error_message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <Badge className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        成功
      </Badge>
    );
  }

  if (status === "failed") {
    return <Badge variant="destructive">失败</Badge>;
  }

  return (
    <Badge variant="secondary">
      <Clock3 className="mr-1 h-3 w-3" />
      待执行
    </Badge>
  );
}

function TimeRow({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value ? new Date(value).toLocaleString() : "-"}</span>
    </div>
  );
}

function summarizeChannelResults(raw: string) {
  try {
    const results = JSON.parse(raw) as Array<{ channel_name?: string; success?: boolean; message?: string }>;
    if (results.length === 0) {
      return "暂无渠道结果";
    }

    return results
      .map((result) => {
        const name = result.channel_name || "未知渠道";
        const status = result.success ? "成功" : "失败";
        const message = result.message ? `：${result.message}` : "";
        return `${name} ${status}${message}`;
      })
      .join("；");
  } catch {
    return raw || "暂无渠道结果";
  }
}
```

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Runtime Verification

**Files:**
- Verify running app behavior.

- [ ] **Step 1: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Launch app**

Run: `npm run tauri dev`

Expected: Vite starts on `http://localhost:1420/` and the Tauri app launches.

- [ ] **Step 4: Open history page and capture screenshot**

Run:

```bash
open -a Safari "http://localhost:1420/reminder/history"
screencapture -x "/tmp/tools-reminder-history.png"
```

Expected: Screenshot shows the reminder history stats and recent scheduled reminders.

- [ ] **Step 5: Probe adjacent route**

Run:

```bash
python3 - <<'PY'
from urllib.request import urlopen
for route in ['/reminder/history', '/reminder/tasks']:
    with urlopen(f'http://localhost:1420{route}', timeout=5) as response:
        print(response.status, route)
PY
```

Expected:

```text
200 /reminder/history
200 /reminder/tasks
```

---

## Self-Review

- Spec coverage: backend query, command exposure, frontend API/query hook, UI stats/cards, and runtime screenshot verification are covered.
- Placeholder scan: no placeholder steps remain; all code snippets and commands are concrete.
- Type consistency: Rust `ReminderHistoryItem` snake_case fields match TypeScript `ReminderHistoryItem` fields and Tauri JSON serialization.
