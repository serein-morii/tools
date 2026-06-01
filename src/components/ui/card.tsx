import * as React from "react";
import { cn } from "@/lib/utils";

type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING_CLASS: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

type CardTone = "ai" | "human" | "neutral";

const TONE_CLASS: Record<CardTone, string> = {
  ai: "border-l-2 border-l-ai",
  human: "border-l-2 border-l-human",
  neutral: "",
};

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  padding?: CardPadding;
  interactive?: boolean;
  elevated?: boolean;
  tone?: CardTone;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      title,
      icon,
      actions,
      padding = "md",
      interactive,
      elevated,
      tone = "neutral",
      children,
      ...rest
    },
    ref
  ) => {
    const hasHeader = title !== undefined || icon !== undefined || actions !== undefined;
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-border text-card-foreground",
          elevated ? "bg-card-elevated" : "bg-card",
          TONE_CLASS[tone],
          "ring-1 ring-border/40",
          interactive && "transition-colors duration-150 hover:border-primary/40 hover:bg-card-elevated",
          className
        )}
        {...rest}
      >
        {hasHeader ? (
          <>
            <CardHeader>
              <div className="flex items-center gap-2 min-w-0">
                {icon}
                {title !== undefined && (
                  <div className="text-sm font-semibold text-foreground truncate">{title}</div>
                )}
              </div>
              {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
            </CardHeader>
            <CardBody padding={padding}>{children}</CardBody>
          </>
        ) : (
          <div className={cn(PADDING_CLASS[padding])}>{children}</div>
        )}
      </div>
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5",
        className
      )}
      {...rest}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { padding?: CardPadding }
>(({ className, padding = "md", ...rest }, ref) => (
  <div ref={ref} className={cn(PADDING_CLASS[padding], className)} {...rest} />
));
CardBody.displayName = "CardBody";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5",
        className
      )}
      {...rest}
    />
  )
);
CardFooter.displayName = "CardFooter";

// Legacy exports for backward compatibility
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardBody, CardFooter, CardTitle, CardDescription, CardContent };
