import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConfirmReminder,
  useSnoozeReminder,
  useSubmitReminderFeedback,
} from "@/lib/query/reminderQueries";
import { getSettingValue, useSettings } from "@/lib/query/settingsQueries";
import type { ReminderHistoryItem } from "@/types";
import { useTranslation } from "react-i18next";

interface ReminderActionPanelProps {
  item: ReminderHistoryItem;
}

export function ReminderActionPanel({ item }: ReminderActionPanelProps) {
  const confirmReminder = useConfirmReminder();
  const submitFeedback = useSubmitReminderFeedback();
  const snoozeReminder = useSnoozeReminder();
  const { data: settings } = useSettings();
  const snoozeMinutes = Number(getSettingValue(settings, "snooze_minutes", "5"));
  const [feedback, setFeedback] = useState(item.user_feedback || "");
  const { t } = useTranslation();

  if (item.status !== "sent" || item.reminder_type === "simple") {
    return null;
  }

  if (item.user_action) {
    return (
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        {describeAction(item, t)}
      </div>
    );
  }

  const isPending = confirmReminder.isPending || submitFeedback.isPending || snoozeReminder.isPending;
  const isFeedbackMode = item.reminder_type === "feedback";

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs font-medium text-muted-foreground">{t("history.pendingAction")}</div>
      {isFeedbackMode && (
        <Textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t("history.feedbackPlaceholder")}
          rows={3}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {isFeedbackMode ? (
          <Button
            size="sm"
            disabled={isPending || !feedback.trim()}
            onClick={() => submitFeedback.mutate({ id: item.id, feedback })}
          >
            {t("history.submitFeedback")}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => confirmReminder.mutate(item.id)}
          >
            {t("history.confirmComplete")}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => snoozeReminder.mutate({ id: item.id, minutes: snoozeMinutes })}
        >
          {t("history.snoozeMinutes", { minutes: snoozeMinutes })}
        </Button>
      </div>
    </div>
  );
}

function describeAction(item: ReminderHistoryItem, t: (key: string, options?: Record<string, unknown>) => string) {
  const actionTime = item.action_at ? new Date(item.action_at).toLocaleString() : t("history.unknownTime");

  if (item.user_action === "confirmed") {
    return t("history.confirmedAt", { time: actionTime });
  }

  if (item.user_action === "feedback_done") {
    return t("history.feedbackAt", { feedback: item.user_feedback || t("history.noContent"), time: actionTime });
  }

  if (item.user_action === "snoozed") {
    return t("history.snoozedAt", { time: actionTime });
  }

  return t("history.processedAt", { action: item.user_action, time: actionTime });
}
