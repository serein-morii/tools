import { call } from "./index";
import type { Task, CreateTaskRequest, UpdateTaskRequest } from "@/types";

export const taskApi = {
  getAll: (): Promise<Task[]> => call<Task[]>("get_tasks"),

  getById: (id: string): Promise<Task> => call<Task>("get_task", { id }),

  create: (task: CreateTaskRequest): Promise<Task> =>
    call<Task>("create_task", { task }),

  update: (id: string, task: UpdateTaskRequest): Promise<Task> =>
    call<Task>("update_task", { id, task }),

  delete: (id: string): Promise<void> => call<void>("delete_task", { id }),

  toggle: (id: string, enabled: boolean): Promise<Task> =>
    call<Task>("toggle_task", { id, enabled }),

  test: (id: string): Promise<string> => call<string>("test_task", { id }),
};