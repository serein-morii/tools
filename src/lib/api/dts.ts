import { invoke } from "@tauri-apps/api/core";

export interface DtsConfig {
  config_name: string;
  base_url: string;
  auth_token: string;
  login_user?: string;
  login_pass?: string;
  task_name?: string;
  env_code?: string;
  page_size?: number;
}

export interface DtsConfigDisplay extends Omit<DtsConfig, "auth_token" | "login_pass"> {
  auth_token: string; // 脱敏后
}

export interface DtsTask {
  id: string | number;
  name: string;
  status: string;
  configId?: string;
  configName?: string;
  sourceDatabaseAndTableList?: Array<{ dbName: string; tableNames: string[] }>;
  sourceParallelism?: number | string;
  nodeInfo?: unknown;
  [k: string]: unknown;
}

export interface DtsFlush {
  id: string | number;
  name?: string;
  taskName?: string;
  status: string;
  [k: string]: unknown;
}

export interface DtsBatchProgress {
  type: "progress" | "summary";
  index?: number;
  total?: number;
  task_id?: string;
  task_name?: string;
  success?: boolean;
  message?: string;
  success_count?: number;
  failed_count?: number;
}

export const dtsApi = {
  // === 配置管理 ===
  listConfigs: () =>
    invoke<{ configs: DtsConfigDisplay[]; current_config: string }>("dts_list_configs"),
  getConfig: (name: string) => invoke<{ config: DtsConfig }>("dts_get_config", { name }),
  getActiveConfig: () => invoke<{ config: DtsConfig | null }>("dts_get_active_config"),
  saveConfig: (config: DtsConfig) =>
    invoke<{ success: boolean; message: string }>("dts_save_config", { config }),
  deleteConfig: (name: string) =>
    invoke<{ success: boolean; message: string }>("dts_delete_config", { name }),
  activateConfig: (name: string) =>
    invoke<{ success: boolean; message: string }>("dts_activate_config", { name }),

  // === 登录与连通性 ===
  testConnection: (baseUrl: string, authToken: string) =>
    invoke<{ success: boolean; message: string }>("dts_test_connection", { baseUrl, authToken }),
  fetchToken: (baseUrl: string, username: string, password: string, loginType: string = "ldap") =>
    invoke<{ success: boolean; token?: string; message?: string }>("dts_fetch_token", {
      baseUrl, username, password, loginType,
    }),

  // === 任务 ===
  listTasks: (page: number, status: string, taskName?: string, envCode?: string, pageSize?: number) =>
    invoke<{
      success?: boolean;
      code?: number;
      data?: { records: DtsTask[]; total: number };
      message?: string;
    }>("dts_list_tasks", { page, status, taskName: taskName || "", envCode: envCode || "", pageSize: pageSize || 20 }),
  startTask: (taskId: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_start_task", { taskId }),
  stopTask: (taskId: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_stop_task", { taskId }),
  deleteTask: (taskId: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_delete_task", { taskId }),
  renameTask: (taskId: string, newName: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_rename_task", { taskId, newName }),
  resetOffset: (taskId: string, binlogFileName: string, binlogFilePosition: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_reset_offset", {
      taskId, binlogFileName, binlogFilePosition,
    }),

  // === 环境 ===
  listEnvironments: (status: string = "启用") =>
    invoke<unknown>("dts_list_environments", { status }),

  // === 批量（NDJSON 流式） ===
  batchOp: async (op: "start" | "stop" | "delete", tasks: DtsTask[]) => {
    const buf = await invoke<number[]>("dts_batch_op", { op, tasks });
    return parseNdjson(new Uint8Array(buf));
  },
  batchRename: async (items: Array<{ task_id: string; new_name: string; old_name?: string }>) => {
    const buf = await invoke<number[]>("dts_batch_rename", { items });
    return parseNdjson(new Uint8Array(buf));
  },

  // === 全量回刷 ===
  listFlush: (page: number, status: string, taskName?: string, envCode?: string, pageSize?: number) =>
    invoke<{
      success?: boolean;
      code?: number;
      data?: { records: DtsFlush[]; total: number };
      message?: string;
    }>("dts_list_flush", { page, status, taskName: taskName || "", envCode: envCode || "", pageSize: pageSize || 20 }),
  createFlush: (task: DtsTask) =>
    invoke<{ success: boolean; data?: unknown; ok: boolean }>("dts_create_flush", { task }),
  startFlush: (flushId: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_start_flush", { flushId }),
  deleteFlush: (flushId: string) =>
    invoke<{ success: boolean; message: string; data?: unknown }>("dts_delete_flush", { flushId }),
  batchCreateFlush: async (tasks: DtsTask[]) => {
    const buf = await invoke<number[]>("dts_batch_create_flush", { tasks });
    return parseNdjson(new Uint8Array(buf));
  },
  batchFlushOp: async (op: "start" | "delete", records: DtsFlush[]) => {
    const buf = await invoke<number[]>("dts_batch_flush_op", { op, records });
    return parseNdjson(new Uint8Array(buf));
  },
};

function parseNdjson(buf: Uint8Array): DtsBatchProgress[] {
  const text = new TextDecoder().decode(buf);
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter((x): x is DtsBatchProgress => x !== null);
}
