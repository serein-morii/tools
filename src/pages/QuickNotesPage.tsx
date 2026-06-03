import { useState, useMemo, useCallback } from "react";
import { Plus, Search, StickyNote, Pin, Trash2, Check, Copy, Download, Palette, Hash, CheckSquare, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/lib/query/noteQueries";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

const NOTE_COLORS = [
  { value: "default", bg: "bg-card", dot: "bg-muted-foreground", border: "border-border", label: "Default" },
  { value: "red", bg: "bg-red-50 dark:bg-red-950/40", dot: "bg-red-500", border: "border-red-200 dark:border-red-800", label: "Red" },
  { value: "orange", bg: "bg-orange-50 dark:bg-orange-950/40", dot: "bg-orange-500", border: "border-orange-200 dark:border-orange-800", label: "Orange" },
  { value: "yellow", bg: "bg-yellow-50 dark:bg-yellow-950/40", dot: "bg-yellow-500", border: "border-yellow-200 dark:border-yellow-800", label: "Yellow" },
  { value: "green", bg: "bg-green-50 dark:bg-green-950/40", dot: "bg-green-500", border: "border-green-200 dark:border-green-800", label: "Green" },
  { value: "blue", bg: "bg-blue-50 dark:bg-blue-950/40", dot: "bg-blue-500", border: "border-blue-200 dark:border-blue-800", label: "Blue" },
  { value: "purple", bg: "bg-purple-50 dark:bg-purple-950/40", dot: "bg-purple-500", border: "border-purple-200 dark:border-purple-800", label: "Purple" },
  { value: "pink", bg: "bg-pink-50 dark:bg-pink-950/40", dot: "bg-pink-500", border: "border-pink-200 dark:border-pink-800", label: "Pink" },
];

function extractTags(content: string): string[] {
  const matches = content.match(/#[\w一-鿿]+/g);
  return matches ? [...new Set(matches)] : [];
}

function extractAllTags(notes: { content: string }[]): string[] {
  const all = notes.flatMap(n => extractTags(n.content));
  return [...new Set(all)].sort();
}

function copyToClipboard(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); document.body.removeChild(ta); return true; } catch { document.body.removeChild(ta); return false; }
}

export function QuickNotesPage() {
  const { data: notes, isLoading, error } = useNotes();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [search, setSearch] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState("default");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState("");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "color">("newest");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { t } = useTranslation();

  const noteList = notes || [];
  const allTags = useMemo(() => extractAllTags(noteList), [noteList]);

  const filteredNotes = useMemo(() => {
    let result = noteList.filter(note => {
      if (search && !note.content.toLowerCase().includes(search.toLowerCase())) return false;
      if (colorFilter && note.color !== colorFilter) return false;
      if (tagFilter && !extractTags(note.content).includes(tagFilter)) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      if (sortBy === "newest") return b.created_at - a.created_at;
      if (sortBy === "oldest") return a.created_at - b.created_at;
      return (a.color || "").localeCompare(b.color || "");
    });
    return result;
  }, [noteList, search, colorFilter, tagFilter, sortBy]);

  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);
  const totalChars = noteList.reduce((s, n) => s + n.content.length, 0);

  const handleCreate = () => {
    if (!newContent.trim()) return;
    createNote.mutate({ content: newContent, color: newColor }, {
      onSuccess: () => { setNewContent(""); setNewColor("default"); },
    });
  };

  const handleSaveEdit = (id: string) => {
    if (!editContent.trim()) return;
    updateNote.mutate({ id, content: editContent, color: editColor || undefined }, {
      onSuccess: () => setEditingId(null),
    });
  };

  const handleTogglePin = (id: string, pinned: boolean) => updateNote.mutate({ id, pinned: !pinned });
  const handleDelete = (id: string) => deleteNote.mutate(id);

  const handleBulkPin = useCallback(() => {
    selectedIds.forEach(id => {
      const note = noteList.find(n => n.id === id);
      if (note) updateNote.mutate({ id, pinned: !note.pinned });
    });
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, noteList, updateNote]);

  const handleBulkDelete = useCallback(() => {
    selectedIds.forEach(id => deleteNote.mutate(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, deleteNote]);

  const handleExport = async () => {
    const text = noteList.map(n => `[${n.pinned ? "📌" : " "}] ${new Date(n.created_at).toLocaleDateString()} ${n.content}`).join("\n---\n");
    try {
      const path = await save({ defaultPath: `notes-${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
      if (path) {
        await invoke("write_text_file", { path, content: text });
        toast.success("导出成功");
      }
    } catch (e) {
      toast.error("导出失败: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getColorConfig = (color: string) => NOTE_COLORS.find(c => c.value === color) || NOTE_COLORS[0];

  if (isLoading) return <div className="flex items-center justify-center p-12"><div className="flex items-center gap-2 text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{t("common.loading")}</div></div>;
  if (error) return <div className="p-6"><div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{t("common.error")}</div></div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="border-b px-5 py-3 -mx-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
            <StickyNote className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-medium">{t("notes.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("notes.description")}</p>
          </div>
        </div>
      </div>

      {/* Stats + Actions Row */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30 rounded-lg border mb-3">
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">笔记</div><div className="text-sm font-bold">{noteList.length}</div></div>
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">置顶</div><div className="text-sm font-bold text-amber-600">{noteList.filter(n => n.pinned).length}</div></div>
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">总字符</div><div className="text-sm font-bold">{totalChars.toLocaleString()}</div></div>
        <div className="rounded-md bg-card p-2 flex items-center gap-2">
          {selectMode ? (
            <>
              <Button size="sm" className="h-6 text-[10px]" onClick={handleBulkPin} disabled={selectedIds.size === 0}>📌</Button>
              <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={handleBulkDelete} disabled={selectedIds.size === 0}>🗑</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}><X className="h-3 w-3" /></Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSelectMode(true)}><CheckSquare className="h-3 w-3 mr-0.5" />多选</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={handleExport}><Download className="h-3 w-3 mr-0.5" />导出</Button>
            </>
          )}
        </div>
      </div>

      <Card className="mb-3 overflow-hidden">
        <div className="p-3">
          <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder={t("notes.placeholder")} className="border-0 shadow-none focus-visible:ring-0 text-xs resize-none min-h-[48px]"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleCreate(); } }} />
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 flex-wrap">
              {NOTE_COLORS.map((color) => (
                <button key={color.value} type="button" onClick={() => setNewColor(color.value)}
                  className={cn("relative h-5 w-5 rounded-full border-2 transition-all hover:scale-110", color.dot, newColor === color.value && "ring-2 ring-primary ring-offset-1")} title={color.label}>
                  {newColor === color.value && <Check className="h-2.5 w-2.5 text-white absolute inset-0 m-auto" />}
                </button>
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">{newContent.length}字</span>
            </div>
            <Button onClick={handleCreate} disabled={!newContent.trim() || createNote.isPending} size="sm" className="h-7 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />{t("common.add")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("notes.search")} className="pl-8 h-8 text-xs" />
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-0.5">
          {[{ v: "newest" as const, l: "最新" }, { v: "oldest" as const, l: "最早" }, { v: "color" as const, l: "颜色" }].map(o => (
            <button key={o.v} type="button" onClick={() => setSortBy(o.v)}
              className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors", sortBy === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{o.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Palette className="h-3 w-3 text-muted-foreground" />
          {NOTE_COLORS.map(c => (
            <button key={c.value} type="button" onClick={() => setColorFilter(colorFilter === c.value ? null : c.value)}
              className={cn("h-4 w-4 rounded-full border transition-all", c.dot, colorFilter === c.value && "ring-2 ring-primary ring-offset-1 scale-110")} />
          ))}
          {colorFilter && <button onClick={() => setColorFilter(null)} className="text-[9px] text-muted-foreground hover:text-foreground">清除</button>}
        </div>
      </div>

      {/* Tag Cloud */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
          {allTags.slice(0, 15).map(tag => (
            <button key={tag} type="button" onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={cn("rounded-full px-2 py-0.5 text-[10px] border transition-colors", tagFilter === tag ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>{tag}</button>
          ))}
          {tagFilter && <button onClick={() => setTagFilter(null)} className="text-[9px] text-muted-foreground hover:text-foreground ml-1">清除</button>}
        </div>
      )}

      {filteredNotes.length === 0 ? (
        <Card className="border-dashed"><div className="py-8 text-center text-xs text-muted-foreground">{search || colorFilter || tagFilter ? "无匹配结果" : t("notes.empty")}</div></Card>
      ) : (
        <div className="space-y-4">
          {pinnedNotes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground"><Pin className="h-3 w-3" />{t("notes.pinned")} <span className="text-muted-foreground/50">({pinnedNotes.length})</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} isEditing={editingId === note.id} editContent={editContent} editColor={editColor}
                    selectMode={selectMode} selected={selectedIds.has(note.id)}
                    onEditStart={() => { setEditingId(note.id); setEditContent(note.content); setEditColor(note.color); }}
                    onEditContent={setEditContent} onEditColor={setEditColor} onEditSave={() => handleSaveEdit(note.id)}
                    onEditCancel={() => setEditingId(null)} onTogglePin={() => handleTogglePin(note.id, note.pinned)}
                    onDelete={() => handleDelete(note.id)} onToggleSelect={() => toggleSelect(note.id)}
                    getColorConfig={getColorConfig} t={t} />
                ))}
              </div>
            </div>
          )}
          {unpinnedNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && <div className="text-[10px] text-muted-foreground mb-2">{t("notes.other")} ({unpinnedNotes.length})</div>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unpinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} isEditing={editingId === note.id} editContent={editContent} editColor={editColor}
                    selectMode={selectMode} selected={selectedIds.has(note.id)}
                    onEditStart={() => { setEditingId(note.id); setEditContent(note.content); setEditColor(note.color); }}
                    onEditContent={setEditContent} onEditColor={setEditColor} onEditSave={() => handleSaveEdit(note.id)}
                    onEditCancel={() => setEditingId(null)} onTogglePin={() => handleTogglePin(note.id, note.pinned)}
                    onDelete={() => handleDelete(note.id)} onToggleSelect={() => toggleSelect(note.id)}
                    getColorConfig={getColorConfig} t={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, isEditing, editContent, editColor, onEditStart, onEditContent, onEditColor, onEditSave, onEditCancel, onTogglePin, onDelete, selectMode, selected, onToggleSelect, getColorConfig, t }: {
  note: import("@/types").QuickNote; isEditing: boolean; editContent: string; editColor: string; selectMode: boolean; selected: boolean;
  onEditStart: () => void; onEditContent: (v: string) => void; onEditColor: (v: string) => void; onEditSave: () => void; onEditCancel: () => void;
  onTogglePin: () => void; onDelete: () => void; onToggleSelect: () => void; getColorConfig: (c: string) => typeof NOTE_COLORS[0]; t: (k: string) => string;
}) {
  const colorConfig = getColorConfig(note.color);
  const tags = extractTags(note.content);

  return (
    <Card className={cn("group overflow-hidden transition-all duration-200 hover:shadow-md border relative", colorConfig.bg, colorConfig.border)}>
      {selectMode && (
        <button onClick={onToggleSelect} className="absolute top-1.5 right-1.5 z-10">
          {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
        </button>
      )}
      <div className={cn("p-3", selectMode && "pr-8")}>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea value={editContent} onChange={(e) => onEditContent(e.target.value)} className="border-0 shadow-none resize-none min-h-[60px] text-xs" autoFocus />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {NOTE_COLORS.map((color) => (
                  <button key={color.value} type="button" onClick={() => onEditColor(color.value)}
                    className={cn("h-4 w-4 rounded-full border-2 transition-all", color.dot, editColor === color.value && "ring-2 ring-primary ring-offset-1")} />
                ))}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onEditCancel}>{t("common.cancel")}</Button>
                <Button size="sm" className="h-6 text-[10px]" onClick={onEditSave}>{t("common.save")}</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs whitespace-pre-wrap cursor-pointer min-h-[32px]" onClick={selectMode ? onToggleSelect : onEditStart}>{note.content}</p>
            {tags.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {tags.map(tag => <span key={tag} className="text-[9px] text-blue-500 bg-blue-500/10 rounded px-1">{tag}</span>)}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>{new Date(note.created_at).toLocaleDateString()}</span>
                <span>{note.content.length}字</span>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(note.content) && toast.success("已复制")}><Copy className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onTogglePin} title={note.pinned ? t("notes.unpinned") : t("notes.pinned")}>
                  <Pin className={cn("h-3 w-3", note.pinned && "fill-current text-primary")} />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
