import { invoke } from "@tauri-apps/api/core";

// ==================== 类型定义 ====================

export interface OrganizeRule {
  category: string;
  extensions: string[];
  filename_patterns: string[];
  for_folders?: boolean;          // 是否仅匹配文件夹，默认 false
}

export interface FileMove {
  file_name: string;
  old_path: string;
  new_path: string;
  category: string;
  size: number;
}

export interface OrganizeRequest {
  source_dir?: string;
  custom_rules?: OrganizeRule[];
  preview?: boolean;
  other_folder?: string;
  include_builtin?: boolean;
  exclude_extensions?: string[];
  exclude_patterns?: string[];
  include_folders?: boolean;      // 是否也整理文件夹，默认 false
}

export interface OrganizeResult {
  total_files: number;
  organized: number;
  skipped: number;
  folders_created: string[];
  details: FileMove[];
  preview_mode: boolean;
  source_dir: string;
  timestamp: number;
}

export interface UndoDetail {
  file_name: string;
  from_path: string;
  to_path: string;
  success: boolean;
  error?: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface UndoResult {
  restored: number;
  failed: number;
  details: UndoDetail[];
}

// ==================== API 函数 ====================

/** 获取桌面路径 */
export async function getDesktopPath(): Promise<string> {
  return invoke<string>("get_desktop_path");
}

/** 整理桌面文件（预览或执行） */
export async function organizeDesktop(req: OrganizeRequest): Promise<OrganizeResult> {
  return invoke<OrganizeResult>("organize_desktop", { req });
}

/** 还原上次整理操作 */
export async function undoOrganize(): Promise<UndoResult> {
  return invoke<UndoResult>("undo_organize");
}

/** 检查是否有可还原的操作 */
export async function hasUndoData(): Promise<boolean> {
  return invoke<boolean>("has_undo_data");
}

/** 获取内置分类规则 */
export async function getBuiltinRules(): Promise<OrganizeRule[]> {
  return invoke<OrganizeRule[]>("get_builtin_rules");
}

/** 获取用户自定义规则 */
export async function getCustomRules(): Promise<OrganizeRule[]> {
  return invoke<OrganizeRule[]>("get_custom_rules");
}

/** 保存用户自定义规则 */
export async function saveCustomRules(rules: OrganizeRule[]): Promise<void> {
  return invoke<void>("save_custom_rules", { rules });
}

/** 快速扫描：返回每个分类的文件数量（轻量，不生成详情） */
export async function quickScan(req: OrganizeRequest): Promise<CategoryCount[]> {
  return invoke<CategoryCount[]>("quick_scan", { req });
}

/** 暴力还原：将目录下所有子文件夹中的文件全部移回源目录 */
export async function restoreAllFromFolders(sourceDir?: string): Promise<UndoResult> {
  return invoke<UndoResult>("restore_all_from_folders", { sourceDir });
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + units[i];
}
