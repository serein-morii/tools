# Template CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/reminder/templates` minimum working page so users can create, edit, delete, and view reminder templates.

**Architecture:** Reuse the existing SQLite `templates` table. Add a focused Rust DAO and Tauri commands for template CRUD, then add frontend API/query hooks and React components under the reminder module. Keep this iteration scoped to template management only; task creation will consume templates in a later step.

**Tech Stack:** Rust, rusqlite, Tauri v2 commands, React 19, TypeScript, React Query, Radix Dialog, Tailwind CSS.

---

## File Structure

- Create: `src-tauri/src/database/dao/template.rs` — template structs, row mapper, CRUD methods, DAO tests.
- Modify: `src-tauri/src/database/dao/mod.rs` — export `template` module.
- Create: `src-tauri/src/commands/template.rs` — Tauri commands for template CRUD.
- Modify: `src-tauri/src/commands/mod.rs` — export template commands.
- Modify: `src-tauri/src/lib.rs` — register template commands.
- Modify: `src/types/index.ts` — add template types matching Rust serialization.
- Create: `src/lib/api/template.ts` — call Tauri template commands.
- Create: `src/lib/query/templateQueries.ts` — React Query hooks and invalidation.
- Create: `src/components/modules/reminder/TemplateCard.tsx` — display one template and action buttons.
- Create: `src/components/modules/reminder/TemplateList.tsx` — list/empty state wrapper.
- Create: `src/components/modules/reminder/TemplateEditor.tsx` — create/edit dialog.
- Modify: `src/pages/TemplatesPage.tsx` — render toolbar, list, and editor.

---

### Task 1: Backend Template DAO

**Files:**
- Create: `src-tauri/src/database/dao/template.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`

- [ ] **Step 1: Write failing DAO tests**

Create `src-tauri/src/database/dao/template.rs` with the tests and type references first:

```rust
use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'custom',
                title_template TEXT NOT NULL,
                body_template TEXT NOT NULL,
                default_cron TEXT,
                default_channels TEXT DEFAULT '[]',
                icon TEXT,
                color TEXT,
                tags TEXT DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    #[test]
    fn template_crud_round_trip() {
        let conn = setup_conn();

        let created = TemplateDao::create(&conn, CreateTemplateRequest {
            name: "会议提醒".to_string(),
            description: Some("会议前提醒".to_string()),
            category: Some("custom".to_string()),
            title_template: "会议提醒".to_string(),
            body_template: "{task_name}\n时间: {date} {time}".to_string(),
            default_cron: Some("0 9 * * *".to_string()),
            default_channels: Some(vec!["channel-1".to_string()]),
            icon: Some("bell".to_string()),
            color: Some("blue".to_string()),
            tags: Some(vec!["meeting".to_string()]),
        }).unwrap();

        assert_eq!(created.name, "会议提醒");
        assert_eq!(created.default_channels, "[\"channel-1\"]");

        let updated = TemplateDao::update(&conn, &created.id, UpdateTemplateRequest {
            name: Some("每日复盘".to_string()),
            description: None,
            category: None,
            title_template: Some("复盘提醒".to_string()),
            body_template: None,
            default_cron: Some("30 18 * * *".to_string()),
            default_channels: None,
            icon: None,
            color: None,
            tags: Some(vec!["review".to_string()]),
        }).unwrap();

        assert_eq!(updated.name, "每日复盘");
        assert_eq!(updated.title_template, "复盘提醒");
        assert_eq!(updated.body_template, "{task_name}\n时间: {date} {time}");
        assert_eq!(updated.tags, "[\"review\"]");

        let all = TemplateDao::get_all(&conn).unwrap();
        assert_eq!(all.len(), 1);

        TemplateDao::delete(&conn, &created.id).unwrap();
        assert!(TemplateDao::get_by_id(&conn, &created.id).unwrap().is_none());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml template_crud_round_trip`

Expected: FAIL because `TemplateDao`, `CreateTemplateRequest`, and `UpdateTemplateRequest` do not exist.

- [ ] **Step 3: Implement template structs and DAO**

Replace `src-tauri/src/database/dao/template.rs` with:

```rust
use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub title_template: String,
    pub body_template: String,
    pub default_cron: Option<String>,
    pub default_channels: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub title_template: String,
    pub body_template: String,
    pub default_cron: Option<String>,
    pub default_channels: Option<Vec<String>>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub title_template: Option<String>,
    pub body_template: Option<String>,
    pub default_cron: Option<String>,
    pub default_channels: Option<Vec<String>>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl Template {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Template {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            title_template: row.get(4)?,
            body_template: row.get(5)?,
            default_cron: row.get(6)?,
            default_channels: row.get(7)?,
            icon: row.get(8)?,
            color: row.get(9)?,
            tags: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }
}

pub struct TemplateDao;

impl TemplateDao {
    pub fn create(conn: &Connection, req: CreateTemplateRequest) -> Result<Template> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let category = req.category.unwrap_or_else(|| "custom".to_string());
        let default_channels = serde_json::to_string(&req.default_channels.unwrap_or_default())?;
        let tags = serde_json::to_string(&req.tags.unwrap_or_default())?;

        conn.execute(
            "INSERT INTO templates (
                id, name, description, category, title_template, body_template,
                default_cron, default_channels, icon, color, tags, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            rusqlite::params![
                id,
                req.name,
                req.description,
                category,
                req.title_template,
                req.body_template,
                req.default_cron,
                default_channels,
                req.icon,
                req.color,
                tags,
                now,
            ],
        )?;

        Self::get_by_id(conn, &id)?.ok_or_else(|| ToolsError::TaskNotFound(id))
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<Template>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, title_template, body_template,
                    default_cron, default_channels, icon, color, tags, created_at, updated_at
             FROM templates ORDER BY created_at DESC"
        )?;

        let templates = stmt.query_map([], Template::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(templates)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Template>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, title_template, body_template,
                    default_cron, default_channels, icon, color, tags, created_at, updated_at
             FROM templates WHERE id = ?1"
        )?;

        let template = stmt.query_row([id], Template::from_row).ok();
        Ok(template)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateTemplateRequest) -> Result<Template> {
        let existing = Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))?;
        let now = Utc::now().timestamp_millis();
        let name = req.name.unwrap_or(existing.name);
        let description = req.description.or(existing.description);
        let category = req.category.unwrap_or(existing.category);
        let title_template = req.title_template.unwrap_or(existing.title_template);
        let body_template = req.body_template.unwrap_or(existing.body_template);
        let default_cron = req.default_cron.or(existing.default_cron);
        let default_channels = match req.default_channels {
            Some(channels) => serde_json::to_string(&channels)?,
            None => existing.default_channels,
        };
        let icon = req.icon.or(existing.icon);
        let color = req.color.or(existing.color);
        let tags = match req.tags {
            Some(tags) => serde_json::to_string(&tags)?,
            None => existing.tags,
        };

        conn.execute(
            "UPDATE templates SET
                name = ?1, description = ?2, category = ?3, title_template = ?4,
                body_template = ?5, default_cron = ?6, default_channels = ?7,
                icon = ?8, color = ?9, tags = ?10, updated_at = ?11
             WHERE id = ?12",
            rusqlite::params![
                name,
                description,
                category,
                title_template,
                body_template,
                default_cron,
                default_channels,
                icon,
                color,
                tags,
                now,
                id,
            ],
        )?;

        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        let rows = conn.execute("DELETE FROM templates WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(ToolsError::TaskNotFound(id.to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'custom',
                title_template TEXT NOT NULL,
                body_template TEXT NOT NULL,
                default_cron TEXT,
                default_channels TEXT DEFAULT '[]',
                icon TEXT,
                color TEXT,
                tags TEXT DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    #[test]
    fn template_crud_round_trip() {
        let conn = setup_conn();

        let created = TemplateDao::create(&conn, CreateTemplateRequest {
            name: "会议提醒".to_string(),
            description: Some("会议前提醒".to_string()),
            category: Some("custom".to_string()),
            title_template: "会议提醒".to_string(),
            body_template: "{task_name}\n时间: {date} {time}".to_string(),
            default_cron: Some("0 9 * * *".to_string()),
            default_channels: Some(vec!["channel-1".to_string()]),
            icon: Some("bell".to_string()),
            color: Some("blue".to_string()),
            tags: Some(vec!["meeting".to_string()]),
        }).unwrap();

        assert_eq!(created.name, "会议提醒");
        assert_eq!(created.default_channels, "[\"channel-1\"]");

        let updated = TemplateDao::update(&conn, &created.id, UpdateTemplateRequest {
            name: Some("每日复盘".to_string()),
            description: None,
            category: None,
            title_template: Some("复盘提醒".to_string()),
            body_template: None,
            default_cron: Some("30 18 * * *".to_string()),
            default_channels: None,
            icon: None,
            color: None,
            tags: Some(vec!["review".to_string()]),
        }).unwrap();

        assert_eq!(updated.name, "每日复盘");
        assert_eq!(updated.title_template, "复盘提醒");
        assert_eq!(updated.body_template, "{task_name}\n时间: {date} {time}");
        assert_eq!(updated.tags, "[\"review\"]");

        let all = TemplateDao::get_all(&conn).unwrap();
        assert_eq!(all.len(), 1);

        TemplateDao::delete(&conn, &created.id).unwrap();
        assert!(TemplateDao::get_by_id(&conn, &created.id).unwrap().is_none());
    }
}
```

- [ ] **Step 4: Export template DAO module**

Add to `src-tauri/src/database/dao/mod.rs`:

```rust
pub mod template;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml template_crud_round_trip`

Expected: PASS.

---

### Task 2: Backend Template Commands

**Files:**
- Create: `src-tauri/src/commands/template.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add template commands**

Create `src-tauri/src/commands/template.rs`:

```rust
use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::template::{Template, CreateTemplateRequest, UpdateTemplateRequest, TemplateDao}};
use crate::error::Result;

#[tauri::command]
pub fn get_templates(db: State<'_, Arc<Database>>) -> Result<Vec<Template>> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::get_all(&conn)
}

#[tauri::command]
pub fn get_template(db: State<'_, Arc<Database>>, id: String) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::TaskNotFound(id))
}

#[tauri::command]
pub fn create_template(db: State<'_, Arc<Database>>, template: CreateTemplateRequest) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::create(&conn, template)
}

#[tauri::command]
pub fn update_template(db: State<'_, Arc<Database>>, id: String, template: UpdateTemplateRequest) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::update(&conn, &id, template)
}

#[tauri::command]
pub fn delete_template(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::delete(&conn, &id)
}
```

- [ ] **Step 2: Export commands**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod template;
pub use template::*;
```

- [ ] **Step 3: Register commands**

Add to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`:

```rust
commands::get_templates,
commands::get_template,
commands::create_template,
commands::update_template,
commands::delete_template,
```

- [ ] **Step 4: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

---

### Task 3: Frontend Template API and Queries

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/api/template.ts`
- Create: `src/lib/query/templateQueries.ts`

- [ ] **Step 1: Add frontend types**

Add to `src/types/index.ts`:

```ts
export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  title_template: string;
  body_template: string;
  default_cron?: string;
  default_channels: string;
  icon?: string;
  color?: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  body_template: string;
  default_cron?: string;
  default_channels?: string[];
  icon?: string;
  color?: string;
  tags?: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  title_template?: string;
  body_template?: string;
  default_cron?: string;
  default_channels?: string[];
  icon?: string;
  color?: string;
  tags?: string[];
}
```

- [ ] **Step 2: Add API wrapper**

Create `src/lib/api/template.ts`:

```ts
import { call } from "./index";
import type { CreateTemplateRequest, Template, UpdateTemplateRequest } from "@/types";

export const templateApi = {
  getAll: (): Promise<Template[]> => call<Template[]>("get_templates"),

  getById: (id: string): Promise<Template> => call<Template>("get_template", { id }),

  create: (template: CreateTemplateRequest): Promise<Template> =>
    call<Template>("create_template", { template }),

  update: (id: string, template: UpdateTemplateRequest): Promise<Template> =>
    call<Template>("update_template", { id, template }),

  delete: (id: string): Promise<void> => call<void>("delete_template", { id }),
};
```

- [ ] **Step 3: Add React Query hooks**

Create `src/lib/query/templateQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templateApi } from "@/lib/api/template";
import type { CreateTemplateRequest, UpdateTemplateRequest } from "@/types";

export const templateKeys = {
  all: ["templates"] as const,
  list: () => [...templateKeys.all, "list"] as const,
  detail: (id: string) => [...templateKeys.all, "detail", id] as const,
};

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list(),
    queryFn: templateApi.getAll,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => templateApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: CreateTemplateRequest) => templateApi.create(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: UpdateTemplateRequest }) =>
      templateApi.update(id, template),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}
```

- [ ] **Step 4: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 4: Template UI Components

**Files:**
- Create: `src/components/modules/reminder/TemplateCard.tsx`
- Create: `src/components/modules/reminder/TemplateList.tsx`
- Create: `src/components/modules/reminder/TemplateEditor.tsx`

- [ ] **Step 1: Create TemplateCard**

Create `src/components/modules/reminder/TemplateCard.tsx`:

```tsx
import { Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Template } from "@/types";

interface TemplateCardProps {
  template: Template;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{template.name}</CardTitle>
          {template.description && (
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
          )}
        </div>
        <Badge variant="secondary">{template.category}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs text-muted-foreground">标题模板</div>
          <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{template.title_template}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">正文模板</div>
          <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">
            {template.body_template}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            默认 Cron: {template.default_cron || "未设置"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(template.id)}>
              <Edit className="mr-1 h-3 w-3" />
              编辑
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDelete(template.id)}>
              <Trash2 className="mr-1 h-3 w-3" />
              删除
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create TemplateList**

Create `src/components/modules/reminder/TemplateList.tsx`:

```tsx
import { TemplateCard } from "./TemplateCard";
import type { Template } from "@/types";

interface TemplateListProps {
  templates: Template[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateList({ templates, onEdit, onDelete }: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-muted-foreground">暂无提醒模板</p>
        <p className="mt-2 text-sm text-muted-foreground">点击右上角「新建模板」创建第一个模板</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create TemplateEditor**

Create `src/components/modules/reminder/TemplateEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTemplate, useTemplate, useUpdateTemplate } from "@/lib/query/templateQueries";

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

const initialForm = {
  name: "",
  description: "",
  category: "custom",
  title_template: "",
  body_template: "",
  default_cron: "",
};

export function TemplateEditor({ open, onOpenChange, templateId }: TemplateEditorProps) {
  const { data: template } = useTemplate(templateId || "");
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (template && templateId) {
      setForm({
        name: template.name,
        description: template.description || "",
        category: template.category,
        title_template: template.title_template,
        body_template: template.body_template,
        default_cron: template.default_cron || "",
      });
    } else if (!templateId && open) {
      setForm(initialForm);
    }
  }, [template, templateId, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category || "custom",
      title_template: form.title_template,
      body_template: form.body_template,
      default_cron: form.default_cron || undefined,
    };

    if (templateId) {
      await updateTemplate.mutateAsync({ id: templateId, template: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-background p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {templateId ? "编辑模板" : "新建模板"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="template-name">模板名称</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-description">描述</Label>
              <Input
                id="template-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-category">分类</Label>
              <Input
                id="template-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-title">标题模板</Label>
              <Input
                id="template-title"
                value={form.title_template}
                onChange={(event) => setForm({ ...form, title_template: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-body">正文模板</Label>
              <Textarea
                id="template-body"
                value={form.body_template}
                onChange={(event) => setForm({ ...form, body_template: event.target.value })}
                rows={6}
                required
              />
              <p className="text-xs text-muted-foreground">
                可使用变量：{`{task_name}`}、{`{date}`}、{`{time}`}、{`{weekday}`}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-cron">默认 Cron</Label>
              <Input
                id="template-cron"
                value={form.default_cron}
                onChange={(event) => setForm({ ...form, default_cron: event.target.value })}
                placeholder="例如：0 9 * * *"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                保存
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Templates Page Integration

**Files:**
- Modify: `src/pages/TemplatesPage.tsx`

- [ ] **Step 1: Replace placeholder page**

Replace `src/pages/TemplatesPage.tsx` with:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TemplateEditor } from "@/components/modules/reminder/TemplateEditor";
import { TemplateList } from "@/components/modules/reminder/TemplateList";
import { useDeleteTemplate, useTemplates } from "@/lib/query/templateQueries";

export function TemplatesPage() {
  const { data: templates, isLoading, error } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingTemplateId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingTemplateId(id);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("确定删除这个模板吗？")) {
      await deleteTemplate.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">加载模板中...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">模板加载失败</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">提醒模板</h2>
          <p className="mt-1 text-sm text-muted-foreground">复用常见提醒标题、正文和默认 Cron 配置</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建模板
        </Button>
      </div>

      <TemplateList templates={templates || []} onEdit={handleEdit} onDelete={handleDelete} />

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        templateId={editingTemplateId}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS.

---

### Task 6: Runtime Verification

**Files:**
- Verify running app behavior.

- [ ] **Step 1: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Restart app**

Stop any existing Tools dev processes listening on port 1420, then run:

```bash
npm run tauri dev
```

Expected: Vite starts on `http://localhost:1420/` and the Tauri app launches.

- [ ] **Step 4: Open templates page and capture screenshot**

Run:

```bash
open -a Safari "http://localhost:1420/reminder/templates"
screencapture -x "/tmp/tools-reminder-templates.png"
```

Expected: Screenshot shows the template management page.

- [ ] **Step 5: Probe adjacent route**

Run:

```bash
python3 - <<'PY'
from urllib.request import urlopen
for route in ['/reminder/templates', '/reminder/history']:
    with urlopen(f'http://localhost:1420{route}', timeout=5) as response:
        print(response.status, route)
PY
```

Expected:

```text
200 /reminder/templates
200 /reminder/history
```

---

## Self-Review

- Spec coverage: backend CRUD, command exposure, frontend API/query hooks, UI list/card/editor, page integration, and runtime screenshot verification are covered.
- Placeholder scan: no placeholder steps remain; all code snippets and commands are concrete.
- Type consistency: Rust `Template` snake_case fields match TypeScript `Template` fields and Tauri JSON serialization.
