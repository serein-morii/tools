import { call } from "./index";
import type {
  BackupExportResult,
  BackupImportResult,
  ExportBackupRequest,
  ImportBackupRequest,
} from "@/types";

export const backupApi = {
  export: (request?: ExportBackupRequest): Promise<BackupExportResult> =>
    call<BackupExportResult>("export_backup", { request }),

  import: (request: ImportBackupRequest): Promise<BackupImportResult> =>
    call<BackupImportResult>("import_backup", { request }),
};
