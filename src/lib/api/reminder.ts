import { call } from "./index";
import type { Reminder } from "@/types";

export const reminderApi = {
  getPending: (): Promise<Reminder[]> => call<Reminder[]>("get_pending_reminders"),

  getByTask: (taskId: string): Promise<Reminder[]> =>
    call<Reminder[]>("get_task_reminders", { task_id: taskId }),
};