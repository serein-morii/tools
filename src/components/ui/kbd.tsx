interface KbdProps {
  keys: string[];
  className?: string;
}

export function Kbd({ keys, className = "" }: KbdProps) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

interface ShortcutHintProps {
  keys: string[];
  label?: string;
  className?: string;
}

export function ShortcutHint({ keys, label, className = "" }: ShortcutHintProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-muted-foreground ${className}`}>
      <Kbd keys={keys} />
      {label && <span className="text-xs">{label}</span>}
    </span>
  );
}
