import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Bell } from "lucide-react";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";

const DEFAULT_SNOOZE_MINUTES = "5";
const DEFAULT_HISTORY_RETENTION_DAYS = "30";

export function ReminderSettings() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();

  const snoozeMinutes = getSettingValue(settings, "snooze_minutes", DEFAULT_SNOOZE_MINUTES);
  const historyRetentionDays = getSettingValue(settings, "history_retention_days", DEFAULT_HISTORY_RETENTION_DAYS);

  const saveNumber = (key: string, value: string, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return;
    }
    updateSetting.mutate({ key, value });
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">{t("settings.reminder")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="snoozeMinutes" className="text-xs">{t("settings.snoozeMinutes")}</Label>
            <Input
              id="snoozeMinutes"
              type="number"
              min={1}
              max={1440}
              value={snoozeMinutes}
              onChange={(event) => saveNumber("snooze_minutes", event.target.value, 1, 1440)}
              className="w-full h-7 text-xs"
              disabled={updateSetting.isPending}
            />
            <p className="text-[11px] text-muted-foreground">{t("settings.snoozeMinutesHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="historyRetentionDays" className="text-xs">{t("settings.historyRetentionDays")}</Label>
            <Input
              id="historyRetentionDays"
              type="number"
              min={1}
              max={3650}
              value={historyRetentionDays}
              onChange={(event) => saveNumber("history_retention_days", event.target.value, 1, 3650)}
              className="w-full h-7 text-xs"
              disabled={updateSetting.isPending}
            />
            <p className="text-[11px] text-muted-foreground">{t("settings.historyRetentionDaysHint")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
