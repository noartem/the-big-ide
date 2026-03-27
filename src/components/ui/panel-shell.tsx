import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

interface PanelShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  actions?: ReactNode;
  onExpand?: () => void;
  titleClassName?: string;
  children: ReactNode;
}

export function PanelShell({ title, subtitle, actions, onExpand, className, titleClassName, children }: PanelShellProps) {
  return (
    <section className={cn("flex h-full flex-col overflow-hidden border border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h3 className={cn("truncate text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground", titleClassName)}>{title}</h3>
          {subtitle ? <div className="truncate text-xs text-muted-foreground/80">{subtitle}</div> : null}
        </div>

        <div className="flex items-center gap-px">
          {actions}
          {onExpand ? (
            <Button variant="ghost" size="sm" className="rounded-none" onClick={onExpand} title={`Expand ${title}`}>
              <Maximize2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
