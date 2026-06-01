import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary";
  showText?: boolean;
}

export function CopyButton({ text, className, size = "sm", variant = "outline", showText = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className={cn("h-3.5 w-3.5", showText && "mr-1")} />
          {showText && "已复制"}
        </>
      ) : (
        <>
          <Copy className={cn("h-3.5 w-3.5", showText && "mr-1")} />
          {showText && "复制"}
        </>
      )}
    </Button>
  );
}
