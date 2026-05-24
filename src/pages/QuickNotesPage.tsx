import { useState } from "react";
import { Plus, Search, StickyNote, Pin, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/lib/query/noteQueries";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

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
  const { t } = useTranslation();

  const filteredNotes = (notes || []).filter(
    (note) =>
      search === "" || note.content.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);

  const handleCreate = () => {
    if (!newContent.trim()) return;
    createNote.mutate(
      { content: newContent, color: newColor },
      {
        onSuccess: () => {
          setNewContent("");
          setNewColor("default");
        },
      }
    );
  };

  const handleSaveEdit = (id: string) => {
    if (!editContent.trim()) return;
    updateNote.mutate(
      { id, content: editContent, color: editColor || undefined },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleTogglePin = (id: string, pinned: boolean) => {
    updateNote.mutate({ id, pinned: !pinned });
  };

  const handleDelete = (id: string) => {
    deleteNote.mutate(id);
  };

  const getColorConfig = (color: string) => {
    return NOTE_COLORS.find((c) => c.value === color) || NOTE_COLORS[0];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("common.error")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
          <StickyNote className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("notes.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("notes.description")}
          </p>
        </div>
      </div>

      {/* New Note Input */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-4">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t("notes.placeholder")}
            className="border-0 shadow-none focus-visible:ring-0 text-base resize-none min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-1">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setNewColor(color.value)}
                  className={cn(
                    "relative h-6 w-6 rounded-full border-2 transition-all hover:scale-110",
                    color.dot,
                    newColor === color.value && "ring-2 ring-primary ring-offset-2"
                  )}
                  title={color.label}
                >
                  {newColor === color.value && (
                    <Check className="h-3 w-3 text-white absolute inset-0 m-auto" />
                  )}
                </button>
              ))}
            </div>
            <Button
              onClick={handleCreate}
              disabled={!newContent.trim() || createNote.isPending}
              size="sm"
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notes.search")}
            className="pl-10"
          />
        </div>
      </div>

      {/* Notes */}
      {filteredNotes.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search ? t("notes.noResults") : t("notes.empty")}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                <Pin className="h-3.5 w-3.5" />
                {t("notes.pinned")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isEditing={editingId === note.id}
                    editContent={editContent}
                    editColor={editColor}
                    onEditStart={() => {
                      setEditingId(note.id);
                      setEditContent(note.content);
                      setEditColor(note.color);
                    }}
                    onEditContent={setEditContent}
                    onEditColor={setEditColor}
                    onEditSave={() => handleSaveEdit(note.id)}
                    onEditCancel={() => setEditingId(null)}
                    onTogglePin={() => handleTogglePin(note.id, note.pinned)}
                    onDelete={() => handleDelete(note.id)}
                    getColorConfig={getColorConfig}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Notes */}
          {unpinnedNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className="text-xs text-muted-foreground mb-3 mt-2">
                  {t("notes.other")}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unpinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isEditing={editingId === note.id}
                    editContent={editContent}
                    editColor={editColor}
                    onEditStart={() => {
                      setEditingId(note.id);
                      setEditContent(note.content);
                      setEditColor(note.color);
                    }}
                    onEditContent={setEditContent}
                    onEditColor={setEditColor}
                    onEditSave={() => handleSaveEdit(note.id)}
                    onEditCancel={() => setEditingId(null)}
                    onTogglePin={() => handleTogglePin(note.id, note.pinned)}
                    onDelete={() => handleDelete(note.id)}
                    getColorConfig={getColorConfig}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NoteCardProps {
  note: import("@/types").QuickNote;
  isEditing: boolean;
  editContent: string;
  editColor: string;
  onEditStart: () => void;
  onEditContent: (v: string) => void;
  onEditColor: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  getColorConfig: (c: string) => typeof NOTE_COLORS[0];
  t: (k: string) => string;
}

function NoteCard({
  note,
  isEditing,
  editContent,
  editColor,
  onEditStart,
  onEditContent,
  onEditColor,
  onEditSave,
  onEditCancel,
  onTogglePin,
  onDelete,
  getColorConfig,
  t,
}: NoteCardProps) {
  const colorConfig = getColorConfig(note.color);

  return (
    <Card
      className={cn(
        "group overflow-hidden transition-all duration-200 hover:shadow-md border",
        colorConfig.bg,
        colorConfig.border
      )}
    >
      <div className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => onEditContent(e.target.value)}
              className="border-0 shadow-none resize-none min-h-[80px]"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => onEditColor(color.value)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-all",
                      color.dot,
                      editColor === color.value && "ring-2 ring-primary ring-offset-1"
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onEditCancel}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={onEditSave}>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p
              className="text-sm whitespace-pre-wrap cursor-pointer min-h-[40px]"
              onClick={onEditStart}
            >
              {note.content}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(note.created_at).toLocaleDateString()}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={onTogglePin}
                  title={note.pinned ? t("notes.unpinned") : t("notes.pinned")}
                >
                  <Pin className={cn("h-3.5 w-3.5", note.pinned && "fill-current text-primary")} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
