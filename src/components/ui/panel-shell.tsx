import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

interface PanelShellProps {
  title: string;
  subtitle?: string;
  className?: string;
  actions?: ReactNode;
  onExpand?: () => void;
  children: ReactNode;
}

export function PanelShell({ title, subtitle, actions, onExpand, className, children }: PanelShellProps) {
  return (
    <section className={cn("flex h-full flex-col rounded-lg border border-border/70 bg-card/90 shadow-sm", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
          {subtitle ? <p className="truncate text-xs text-muted-foreground/80">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-1">
          {actions}
          {onExpand ? (
            <Button variant="ghost" size="sm" onClick={onExpand} title={`Expand ${title}`}>
              <Maximize2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
