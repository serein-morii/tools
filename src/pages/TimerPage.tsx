import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TimerPage() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("timer.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("timer.description")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
