import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reminderApi } from "@/lib/api/reminder";
import type { SnoozeReminderRequest, SubmitReminderFeedbackRequest } from "@/types";

export const reminderKeys = {
  all: ["reminders"] as const,
  pending: () => [...reminderKeys.all, "pending"] as const,
  byTask: (taskId: string) => [...reminderKeys.all, "task", taskId] as const,
  history: () => [...reminderKeys.all, "history"] as const,
};

export function usePendingReminders() {
  return useQuery({
    queryKey: reminderKeys.pending(),
    queryFn: reminderApi.getPending,
    refetchInterval: 30000,
  });
}

export function useTaskReminders(taskId: string) {
  return useQuery({
    queryKey: reminderKeys.byTask(taskId),
    queryFn: () => reminderApi.getByTask(taskId),
    enabled: !!taskId,
  });
}

export function useReminderHistory() {
  return useQuery({
    queryKey: reminderKeys.history(),
    queryFn: reminderApi.getHistory,
    refetchInterval: 30000,
  });
}

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
