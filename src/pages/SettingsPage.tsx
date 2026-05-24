import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export function SettingsPage() {
  const [autoStart, setAutoStart] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [checkInterval, setCheckInterval] = useState("10");

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold">设置</h2>

      <Card>
        <CardHeader>
          <CardTitle>启动设置</CardTitle>
          <CardDescription>应用程序启动行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>开机自启动</Label>
              <p className="text-xs text-muted-foreground">
                系统启动时自动运行 Tools
              </p>
            </div>
            <Switch
              checked={autoStart}
              onCheckedChange={setAutoStart}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>最小化到托盘</Label>
              <p className="text-xs text-muted-foreground">
                关闭窗口时最小化到系统托盘而不是退出
              </p>
            </div>
            <Switch
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>提醒设置</CardTitle>
          <CardDescription>任务提醒相关配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="checkInterval">检查间隔 (秒)</Label>
            <Input
              id="checkInterval"
              type="number"
              min={5}
              max={300}
              value={checkInterval}
              onChange={(e) => setCheckInterval(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              调度器检查待执行任务的频率，默认 10 秒
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据管理</CardTitle>
          <CardDescription>数据存储与备份</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="outline">
              导出数据
            </Button>
            <Button variant="outline">
              导入数据
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            导出任务、渠道、模板等数据到 JSON 文件，或从备份恢复
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>应用程序信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">版本</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">框架</span>
            <span>Tauri v2 + React 19</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">作者</span>
            <span>pengchenghui</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}