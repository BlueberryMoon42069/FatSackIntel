import { cn } from "@/lib/utils";
import { AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState(props: {
  title: string;
  description?: string;
  icon?: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  testId?: string;
}) {
  const Icon = props.icon === "error" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 text-card-foreground shadow-sm",
        "grid gap-2",
        props.className,
      )}
      data-testid={props.testId ?? "state-empty"}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border bg-background p-2">
          <Icon className={cn("h-5 w-5", props.icon === "error" ? "text-destructive" : "text-muted-foreground")} />
        </div>
        <div className="grid gap-1">
          <div className="text-sm font-semibold" data-testid="text-empty-title">
            {props.title}
          </div>
          {props.description ? (
            <div className="text-sm text-muted-foreground" data-testid="text-empty-description">
              {props.description}
            </div>
          ) : null}
        </div>
      </div>
      {props.actionLabel && props.onAction ? (
        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={props.onAction}
            data-testid="button-empty-action"
          >
            {props.actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
