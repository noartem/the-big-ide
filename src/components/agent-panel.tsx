import { Bot, Play, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DockerStatus, Session } from "@/types/big-ide";

interface AgentPanelProps {
  docker: DockerStatus | null;
  session: Session | null;
  logs: string[];
  onStart: () => void;
  onStop: () => void;
  isBusy: boolean;
}

function badgeForStatus(session: Session | null) {
  if (!session) {
    return { variant: "outline" as const, label: "No session selected" };
  }

  if (session.agentStatus === "running") {
    return { variant: "success" as const, label: "OpenCode running" };
  }

  if (session.agentStatus === "missing-opencode") {
    return { variant: "warning" as const, label: "OpenCode missing" };
  }

  if (session.agentStatus === "failed") {
    return { variant: "danger" as const, label: "OpenCode failed" };
  }

  return { variant: "outline" as const, label: "Idle" };
}

export function AgentPanel({ docker, session, logs, onStart, onStop, isBusy }: AgentPanelProps) {
  const status = badgeForStatus(session);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-border p-2">
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">Agent status</div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="rounded-md border border-border p-2">
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">Sandbox mode</div>
          <Badge variant={session?.sandboxRuntime?.mode === "docker" ? "secondary" : "outline"}>
            {session?.sandboxRuntime?.mode ?? "n/a"}
          </Badge>
        </div>

        <div className="rounded-md border border-border p-2">
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">Docker</div>
          <Badge variant={docker?.available ? "success" : "warning"}>{docker?.available ? "Available" : "Unavailable"}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onStart} disabled={!session || isBusy}>
          <Play className="mr-2 size-4" />
          Start
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onStop} disabled={!session || isBusy}>
          <Square className="mr-2 size-4" />
          Stop
        </Button>
        <div className="ml-auto flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Bot className="size-4" />
          {session?.agentRuntime?.command ?? "opencode not started"}
        </div>
      </div>

      {session?.sandboxRuntime?.dependencies.missing?.length ? (
        <div className="rounded-md border border-amber-900/30 bg-amber-300/20 px-3 py-2 text-xs text-amber-900">
          Missing dependencies: {session.sandboxRuntime.dependencies.missing.join(", ")}
        </div>
      ) : null}

      {session?.sandboxRuntime?.logs?.length ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {session.sandboxRuntime.logs.join(" | ")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-black/85 p-2 font-mono text-[12px] leading-relaxed text-emerald-300">
        {logs.length ? logs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div>No logs yet.</div>}
      </div>
    </div>
  );
}
