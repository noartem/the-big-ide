import type { Session } from "@/types/big-ide";

interface AgentPanelProps {
  session: Session | null;
  chatUrl: string | null;
}

export function AgentPanel({ session, chatUrl }: AgentPanelProps) {
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Select a session to load the agent chat.
      </div>
    );
  }

  if (session.status !== "running") {
    return (
      <div data-testid="agent-chat-surface" className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Start the session to open the OpenCode chat surface.
      </div>
    );
  }

  if (session.agentStatus === "missing-opencode") {
    return (
      <div data-testid="agent-chat-surface" className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        OpenCode is not available for this session runtime.
      </div>
    );
  }

  if (session.agentStatus === "failed") {
    return (
      <div data-testid="agent-chat-surface" className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        OpenCode failed to start. Check the session header for runtime details.
      </div>
    );
  }

  if (!chatUrl) {
    return (
      <div data-testid="agent-chat-surface" className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Waiting for the OpenCode chat server to publish its local port.
      </div>
    );
  }

  return (
    <div data-testid="agent-chat-surface" className="h-full min-h-0 overflow-auto bg-background">
      <iframe
        data-testid="agent-chat-iframe"
        src={chatUrl}
        title={`OpenCode chat for ${session.name}`}
        className="h-full w-full border-0 bg-white"
      />
    </div>
  );
}
