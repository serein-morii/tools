import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { QuickNote } from "@/types";

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: () => invoke<QuickNote[]>("get_notes"),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: ["notes", id],
    queryFn: () => invoke<QuickNote | null>("get_note", { id }),
    enabled: !!id,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      color,
    }: {
      content: string;
      color?: string;
    }) => invoke<QuickNote>("create_note", { content, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      content,
      color,
      pinned,
    }: {
      id: string;
      content?: string;
      color?: string;
      pinned?: boolean;
    }) => invoke<QuickNote | null>("update_note", { id, content, color, pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoke<boolean>("delete_note", { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useSearchNotes(query: string) {
  return useQuery({
    queryKey: ["notes", "search", query],
    queryFn: () => invoke<QuickNote[]>("search_notes", { query }),
    enabled: query.length > 0,
  });
}
