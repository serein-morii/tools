import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NotesPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>笔记</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">笔记模块入口已预留，后续会承载快捷记录和提醒联动。</p>
        </CardContent>
      </Card>
    </div>
  );
}
