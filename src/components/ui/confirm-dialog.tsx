import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-[50%] top-[50%] z-50 max-w-md translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg border">
          <AlertDialog.Title className="text-lg font-semibold mb-2">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground mb-4">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{cancelText}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={onConfirm}
              >
                {confirmText}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}