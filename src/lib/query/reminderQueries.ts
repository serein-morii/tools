import { useQuery } from "@tanstack/react-query";
import { reminderApi } from "@/lib/api/reminder";

export const reminderKeys = {
  all: ["reminders"] as const,
  pending: () => [...reminderKeys.all, "pending"] as const,
  byTask: (taskId: string) => [...reminderKeys.all, "task", taskId] as const,
};

export function usePendingReminders() {
  return useQuery({
    queryKey: reminderKeys.pending(),
    queryFn: reminderApi.getPending,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useTaskReminders(taskId: string) {
  return useQuery({
    queryKey: reminderKeys.byTask(taskId),
    queryFn: () => reminderApi.getByTask(taskId),
    enabled: !!taskId,
  });
}