# Reminder Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-app confirm/feedback/snooze loop for sent reminders so confirm and feedback task types become actionable from `/reminder/history`.

**Architecture:** Reuse the existing `reminders.user_action`, `reminders.user_feedback`, and `reminders.action_at` columns for action state. Add focused DAO methods and Tauri commands for confirm, feedback, and snooze actions, then expose React Query mutations and render action controls inside each history card. Snooze creates a new future pending reminder and marks the original reminder as snoozed.

**Tech Stack:** Rust, rusqlite, Tauri v2 commands, React 19, TypeScript, React Query, Tailwind CSS.

---

## File Structure

- Modify: `src-tauri/src/database/dao/reminder.rs` — add action methods and tests for confirm, feedback, and snooze.
- Modify: `src-tauri/src/commands/reminder.rs` — add Tauri commands for action mutations.
- Modify: `src-tauri/src/lib.rs` — register reminder action commands.
- Modify: `src/types/index.ts` — add `action_at` to `ReminderHistoryItem` and request types for feedback/snooze.
- Modify: `src/lib/api/reminder.ts` — add action command wrappers.
- Modify: `src/lib/query/reminderQueries.ts` — add React Query mutations that invalidate history.
- Create: `src/components/modules/reminder/ReminderActionPanel.tsx` — render confirm/feedback/snooze controls for one reminder.
- Modify: `src/pages/HistoryPage.tsx` — include `action_at`, show action state, and mount action panel.

---

### Task 1: Backend Reminder Action DAO

**Files:**
- Modify: `src-tauri/src/database/dao/reminder.rs`

- [ ] **Step 1: Write failing DAO tests**

Add these tests inside the existing `#[cfg(test)] mod tests` in `src-tauri/src/database/dao/reminder.rs`, after `get_history_returns_task_names_and_recent_records_first`:

```rust
    #[test]
    fn reminder_actions_record_confirm_feedback_and_snooze() {
        let conn = setup_action_conn();
        insert_action_reminder(&conn, "confirm-id", "sent", 1_000);
        insert_action_reminder(&conn, "feedback-id", "sent", 2_000);
        insert_action_reminder(&conn, "snooze-id", "sent", 3_000);

        ReminderDao::confirm(&conn, "confirm-id").unwrap();
        ReminderDao::submit_feedback(&conn, "feedback-id", "已处理，明天跟进").unwrap();
        let snoozed = ReminderDao::snooze(&conn, "snooze-id", 10).unwrap();

        let confirm = get_action_row(&conn, "confirm-id");
        assert_eq!(confirm.0.as_deref(), Some("confirmed"));
        assert!(confirm.1.is_none());
        assert!(confirm.2.is_some());

        let feedback = get_action_row(&conn, "feedback-id");
        assert_eq!(feedback.0.as_deref(), Some("feedback_done"));
        assert_eq!(feedback.1.as_deref(), Some("已处理，明天跟进"));
        assert!(feedback.2.is_some());

        let original = get_action_row(&conn, "snooze-id");
        assert_eq!(original.0.as_deref(), Some("snoozed"));
        assert!(original.2.is_some());
        assert_eq!(snoozed.task_id, "task-1");
        assert_eq!(snoozed.status, "pending");
        assert!(snoozed.scheduled_at >= 3_000 + 10 * 60 * 1000);
    }

    fn setup_action_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE reminders (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                scheduled_at INTEGER NOT NULL,
                executed_at INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                channel_results TEXT DEFAULT '[]',
                error_message TEXT,
                user_action TEXT,
                user_feedback TEXT,
                action_at INTEGER,
                created_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    fn insert_action_reminder(conn: &Connection, id: &str, status: &str, scheduled_at: i64) {
        conn.execute(
            "INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, created_at)
             VALUES (?1, 'task-1', ?2, ?3, ?4, '[]', ?5)",
            rusqlite::params![id, scheduled_at, scheduled_at + 100, status, scheduled_at - 100],
        ).unwrap();
    }

    fn get_action_row(conn: &Connection, id: &str) -> (Option<String>, Option<String>, Option<i64>) {
        conn.query_row(
            "SELECT user_action, user_feedback, action_at FROM reminders WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap()
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml reminder_actions_record_confirm_feedback_and_snooze`

Expected: FAIL with missing methods `ReminderDao::confirm`, `ReminderDao::submit_feedback`, and `ReminderDao::snooze`.

- [ ] **Step 3: Add action methods**

Add these methods inside `impl ReminderDao` in `src-tauri/src/database/dao/reminder.rs`, after `update_status`:

```rust
    pub fn confirm(conn: &Connection, id: &str) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'confirmed', user_feedback = NULL, action_at = ?1 WHERE id = ?2",
            rusqlite::params![now, id],
        )?;
        Ok(())
    }

    pub fn submit_feedback(conn: &Connection, id: &str, feedback: &str) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'feedback_done', user_feedback = ?1, action_at = ?2 WHERE id = ?3",
            rusqlite::params![feedback, now, id],
        )?;
        Ok(())
    }

    pub fn snooze(conn: &Connection, id: &str, minutes: i64) -> Result<Reminder> {
        let existing = Self::get_by_id(conn, id)?.ok_or_else(|| crate::error::ToolsError::TaskNotFound(id.to_string()))?;
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'snoozed', action_at = ?1 WHERE id = ?2",
            rusqlite::params![now, id],
        )?;

        Self::create(conn, CreateReminderRequest {
            task_id: existing.task_id,
            scheduled_at: now + minutes * 60 * 1000,
        })
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Reminder>> {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, created_at
             FROM reminders WHERE id = ?1"
        )?;

        let reminder = stmt.query_row([id], Reminder::from_row).ok();
        Ok(reminder)
    }
```

- [ ] **Step 4: Include `action_at` in history items**

Modify `ReminderHistoryItem` in `src-tauri/src/database/dao/reminder.rs`:

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
    pub action_at: Option<i64>,
    pub created_at: i64,
}
```

Update its row mapper:

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
            action_at: row.get(10)?,
            created_at: row.get(11)?,
        })
    }
}
```

Update `get_history` select list:

```rust
"SELECT r.id, r.task_id, COALESCE(t.name, '已删除任务') AS task_name,
        r.scheduled_at, r.executed_at, r.status, r.channel_results,
        r.error_message, r.user_action, r.user_feedback, r.action_at, r.created_at
 FROM reminders r
 LEFT JOIN tasks t ON t.id = r.task_id
 ORDER BY r.scheduled_at DESC
 LIMIT ?1"
```

Update `ReminderHistoryItem::test_item` to include `action_at: None`.

- [ ] **Step 5: Run targeted DAO test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml reminder_actions_record_confirm_feedback_and_snooze`

Expected: PASS.

---

### Task 2: Backend Reminder Action Commands

**Files:**
- Modify: `src-tauri/src/commands/reminder.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Tauri commands**

Add these commands to `src-tauri/src/commands/reminder.rs` after `get_reminder_history`:

```rust
#[tauri::command]
pub fn confirm_reminder(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::confirm(&conn, &id)
}

#[tauri::command]
pub fn submit_reminder_feedback(db: State<'_, Arc<Database>>, id: String, feedback: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::submit_feedback(&conn, &id, &feedback)
}

#[tauri::command]
pub fn snooze_reminder(db: State<'_, Arc<Database>>, id: String, minutes: i64) -> Result<Reminder> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::snooze(&conn, &id, minutes)
}
```

- [ ] **Step 2: Register commands**

Add these entries to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`, after `commands::get_reminder_history`:

```rust
            commands::confirm_reminder,
            commands::submit_reminder_feedback,
            commands::snooze_reminder,
```

- [ ] **Step 3: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

---

### Task 3: Frontend Reminder Action Data Layer

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api/reminder.ts`
- Modify: `src/lib/query/reminderQueries.ts`

- [ ] **Step 1: Add frontend types**

Modify `ReminderHistoryItem` in `src/types/index.ts` to include:

```ts
  action_at?: number;
```

Add these request types near the reminder types:

```ts
export interface SubmitReminderFeedbackRequest {
  id: string;
  feedback: string;
}

export interface SnoozeReminderRequest {
  id: string;
  minutes: number;
}
```

- [ ] **Step 2: Add API wrapper methods**

Modify `src/lib/api/reminder.ts` imports:

```ts
import type {
  Reminder,
  ReminderHistoryItem,
  SnoozeReminderRequest,
  SubmitReminderFeedbackRequest,
} from "@/types";
```

Add methods to `reminderApi` after `getHistory`:

```ts
  confirm: (id: string): Promise<void> => call<void>("confirm_reminder", { id }),

  submitFeedback: ({ id, feedback }: SubmitReminderFeedbackRequest): Promise<void> =>
    call<void>("submit_reminder_feedback", { id, feedback }),

  snooze: ({ id, minutes }: SnoozeReminderRequest): Promise<Reminder> =>
    call<Reminder>("snooze_reminder", { id, minutes }),
```

- [ ] **Step 3: Add React Query mutations**

Modify `src/lib/query/reminderQueries.ts` import:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SnoozeReminderRequest, SubmitReminderFeedbackRequest } from "@/types";
```

Add these hooks after `useReminderHistory`:

```ts
export function useConfirmReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reminderApi.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.history() });
    },
  });
}

export function useSubmitReminderFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SubmitReminderFeedbackRequest) => reminderApi.submitFeedback(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.history() });
    },
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SnoozeReminderRequest) => reminderApi.snooze(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.history() });
      queryClient.invalidateQueries({ queryKey: reminderKeys.pending() });
    },
  });
}
```

- [ ] **Step 4: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 4: History Action UI

**Files:**
- Create: `src/components/modules/reminder/ReminderActionPanel.tsx`
- Modify: `src/pages/HistoryPage.tsx`

- [ ] **Step 1: Create action panel component**

Create `src/components/modules/reminder/ReminderActionPanel.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConfirmReminder,
  useSnoozeReminder,
  useSubmitReminderFeedback,
} from "@/lib/query/reminderQueries";
import type { ReminderHistoryItem } from "@/types";

interface ReminderActionPanelProps {
  item: ReminderHistoryItem;
}

export function ReminderActionPanel({ item }: ReminderActionPanelProps) {
  const confirmReminder = useConfirmReminder();
  const submitFeedback = useSubmitReminderFeedback();
  const snoozeReminder = useSnoozeReminder();
  const [feedback, setFeedback] = useState(item.user_feedback || "");

  if (item.status !== "sent") {
    return null;
  }

  if (item.user_action) {
    return (
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        {describeAction(item)}
      </div>
    );
  }

  const isPending = confirmReminder.isPending || submitFeedback.isPending || snoozeReminder.isPending;
  const isFeedbackMode = item.task_name.includes("反馈") || item.task_id.includes("feedback");

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs font-medium text-muted-foreground">待处理动作</div>
      {isFeedbackMode && (
        <Textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="输入处理反馈"
          rows={3}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {isFeedbackMode ? (
          <Button
            size="sm"
            disabled={isPending || !feedback.trim()}
            onClick={() => submitFeedback.mutate({ id: item.id, feedback })}
          >
            提交反馈
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => confirmReminder.mutate(item.id)}
          >
            确认完成
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => snoozeReminder.mutate({ id: item.id, minutes: 5 })}
        >
          5 分钟后提醒
        </Button>
      </div>
    </div>
  );
}

function describeAction(item: ReminderHistoryItem) {
  const actionTime = item.action_at ? new Date(item.action_at).toLocaleString() : "未知时间";

  if (item.user_action === "confirmed") {
    return `已确认完成 · ${actionTime}`;
  }

  if (item.user_action === "feedback_done") {
    return `已提交反馈：${item.user_feedback || "无内容"} · ${actionTime}`;
  }

  if (item.user_action === "snoozed") {
    return `已稍后提醒 · ${actionTime}`;
  }

  return `已处理：${item.user_action} · ${actionTime}`;
}
```

- [ ] **Step 2: Mount action panel in history cards**

Modify imports in `src/pages/HistoryPage.tsx`:

```tsx
import { ReminderActionPanel } from "@/components/modules/reminder/ReminderActionPanel";
```

Add this inside `HistoryCard` after the error message block:

```tsx
        <ReminderActionPanel item={item} />
```

- [ ] **Step 3: Show action timestamp in history data**

No extra code is needed if Task 1 and Task 3 added `action_at`; `ReminderActionPanel` reads it from `item`.

- [ ] **Step 4: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Runtime Verification

**Files:**
- Verify running app behavior.

- [ ] **Step 1: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS with at least 10 tests including `reminder_actions_record_confirm_feedback_and_snooze`.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Restart app**

Stop existing Tools dev processes listening on port 1420, then run:

```bash
npm run tauri dev
```

Expected: Vite starts on `http://localhost:1420/` and the Tauri app launches.

- [ ] **Step 4: Open history page and capture screenshot**

Run:

```bash
open -a Safari "http://localhost:1420/reminder/history"
screencapture -x "/tmp/tools-reminder-actions.png"
```

Expected: Screenshot shows the reminder history page; records with sent status render action state or action controls when available.

- [ ] **Step 5: Probe routes**

Run:

```bash
python3 - <<'PY'
from urllib.request import urlopen
for route in ['/reminder/history', '/reminder/tasks', '/reminder/templates']:
    with urlopen(f'http://localhost:1420{route}', timeout=5) as response:
        print(response.status, route)
PY
```

Expected:

```text
200 /reminder/history
200 /reminder/tasks
200 /reminder/templates
```

---

## Self-Review

- Spec coverage: confirm, feedback, and snooze are represented in DAO methods, Tauri commands, frontend API/hooks, history UI controls, and runtime verification.
- Placeholder scan: no placeholder or TBD items remain; every code step includes concrete code and expected commands.
- Type consistency: Rust `action_at` is added to `ReminderHistoryItem` and mirrored as `action_at?: number` in TypeScript; command names match frontend API wrapper names.
- Scope check: notification deep links and external callback flows are intentionally excluded; this plan delivers the in-app minimum loop only.
