import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TimerPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>计时</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">计时模块入口已预留，后续会承载倒计时、番茄钟等时间工具。</p>
        </CardContent>
      </Card>
    </div>
  );
}
