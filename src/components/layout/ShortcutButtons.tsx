import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings, getSettingValue } from "@/lib/query/settingsQueries";
import { allModules } from "@/config/modules";
import { cn } from "@/lib/utils";

/** 解析快捷键并匹配事件 */
function parseShortcut(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  if (parts.length < 2) return false;
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // 键名匹配
  const eventKey = event.key.toLowerCase();
  let keyMatch = false;
  if (key === eventKey) {
    keyMatch = true;
  } else if (key.length === 1 && eventKey === key) {
    keyMatch = true;
  } else if (key === "space" && eventKey === " ") {
    keyMatch = true;
  } else if (key === "escape" && eventKey === "escape") {
    keyMatch = true;
  } else if (key === "enter" && eventKey === "enter") {
    keyMatch = true;
  }

  if (!keyMatch) return false;

  // 修饰键匹配
  for (const mod of modifiers) {
    if (mod === "ctrl" && !event.ctrlKey) return false;
    if (mod === "meta" && !event.metaKey) return false;
    if (mod === "shift" && !event.shiftKey) return false;
    if (mod === "alt" && !event.altKey) return false;
  }

  return true;
}

/** 全局快捷键监听 hook - 监听所有模块的快捷键并跳转 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!settings) return;
      // 跳过输入框内的按键
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }

      for (const mod of allModules) {
        const shortcutKey = `shortcut_key_${mod.id}`;
        const shortcut = getSettingValue(settings, shortcutKey, "");
        if (!shortcut) continue;
        if (parseShortcut(shortcut, event)) {
          event.preventDefault();
          navigate(mod.path);
          return;
        }
      }
    },
    [settings, navigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/** 快捷键录入组件 - 点击后捕获键盘输入 */
export function ShortcutInput({
  value,
  onChange,
  placeholder = "未设置",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Esc 取消
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      // Backspace/Delete 清空
      if (event.key === "Backspace" || event.key === "Delete") {
        onChange("");
        setRecording(false);
        return;
      }

      // 修饰键单独按无效
      if (["Control", "Meta", "Shift", "Alt"].includes(event.key)) {
        return;
      }

      // 至少需要一个修饰键
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        return;
      }

      const parts: string[] = [];
      if (event.ctrlKey) parts.push("Ctrl");
      if (event.metaKey) parts.push("Meta");
      if (event.altKey) parts.push("Alt");
      if (event.shiftKey) parts.push("Shift");

      // 规范化键名
      let keyName = event.key;
      if (keyName === " ") keyName = "Space";
      if (keyName.length === 1) keyName = keyName.toUpperCase();

      parts.push(keyName);
      onChange(parts.join("+"));
      setRecording(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, onChange]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setRecording(true);
      }}
      className={cn(
        "flex items-center justify-center gap-1 h-7 px-2 rounded-md border text-xs min-w-[110px] transition-colors font-mono",
        recording
          ? "border-primary bg-primary/10 text-primary"
          : "bg-background hover:bg-muted",
        !value && "text-muted-foreground font-sans"
      )}
    >
      {recording ? (
        <span className="font-sans">按下快捷键...</span>
      ) : value ? (
        <span>{value}</span>
      ) : (
        <span className="text-[10px]">{placeholder}</span>
      )}
    </button>
  );
}
