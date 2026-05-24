import { call } from "./index";
import type {
  Reminder,
  ReminderHistoryItem,
  SnoozeReminderRequest,
  SubmitReminderFeedbackRequest,
} from "@/types";

export const reminderApi = {
  getPending: (): Promise<Reminder[]> => call<Reminder[]>("get_pending_reminders"),

  getByTask: (taskId: string): Promise<Reminder[]> =>
    call<Reminder[]>("get_task_reminders", { task_id: taskId }),

  getHistory: (): Promise<ReminderHistoryItem[]> =>
    call<ReminderHistoryItem[]>("get_reminder_history"),

  confirm: (id: string): Promise<void> => call<void>("confirm_reminder", { id }),

  submitFeedback: ({ id, feedback }: SubmitReminderFeedbackRequest): Promise<void> =>
    call<void>("submit_reminder_feedback", { id, feedback }),

  snooze: ({ id, minutes }: SnoozeReminderRequest): Promise<Reminder> =>
    call<Reminder>("snooze_reminder", { id, minutes }),
};
