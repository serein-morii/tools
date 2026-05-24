import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backupApi } from "@/lib/api/backup";
import { channelKeys } from "@/lib/query/channelQueries";
import { settingsKeys } from "@/lib/query/settingsQueries";
import { taskKeys } from "@/lib/query/taskQueries";
import { templateKeys } from "@/lib/query/templateQueries";
import type { ExportBackupRequest, ImportBackupRequest } from "@/types";

export function useExportBackup() {
  return useMutation({
    mutationFn: (request?: ExportBackupRequest) => backupApi.export(request),
  });
}

export function useImportBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImportBackupRequest) => backupApi.import(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: channelKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}