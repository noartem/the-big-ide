import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import type { Session } from "@/types/big-ide";

import "xterm/css/xterm.css";

interface TerminalPanelProps {
  session: Session | null;
}

function readThemeColor(variableName: string, fallback: string) {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value ? `hsl(${value})` : fallback;
}

export function TerminalPanel({ session }: TerminalPanelProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current || !window.bigIDE || !session) {
      return;
    }

    const terminal = new Terminal({
      fontFamily: "IBM Plex Mono, monospace",
      fontSize: 12,
      convertEol: true,
      cursorBlink: true,
      allowTransparency: false,
      theme: {
        background: readThemeColor("--card", "#ffffff"),
        foreground: readThemeColor("--foreground", "#18202a"),
        cursor: readThemeColor("--primary", "#1d7485"),
        black: "#212833",
        red: "#b42318",
        green: "#18794e",
        yellow: "#9f5f0f",
        blue: "#1d7485",
        magenta: "#8d3dbb",
        cyan: "#0f6b6d",
        white: "#f0ebe2",
        brightBlack: "#4f6073",
        brightRed: "#d64545",
        brightGreen: "#2f9e44",
        brightYellow: "#bf8b30",
        brightBlue: "#2a8da3",
        brightMagenta: "#aa5cc3",
        brightCyan: "#1a9da2",
        brightWhite: "#ffffff"
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mountRef.current);
    fitAddon.fit();
    terminal.focus();
    terminal.writeln(`Connected to ${session.workdir}`);

    const onInput = terminal.onData((data) => {
      void window.bigIDE?.terminal.write({
        sessionId: session.id,
        data
      });
    });

    void window.bigIDE.terminal.start({
      sessionId: session.id,
      cwd: session.workdir
    });

    const stopTerminalData = window.bigIDE.terminal.onData((payload) => {
      if (payload.sessionId !== session.id) {
        return;
      }
      terminal.write(payload.data);
    });

    const stopTerminalExit = window.bigIDE.terminal.onExit((payload) => {
      if (payload.sessionId !== session.id) {
        return;
      }

      terminal.write(`
[terminal exited: code ${String(payload.code ?? 0)}]
`);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(mountRef.current);

    return () => {
      resizeObserver.disconnect();
      onInput.dispose();
      stopTerminalData();
      stopTerminalExit();
      void window.bigIDE?.terminal.stop({ sessionId: session.id });
      terminal.dispose();
    };
  }, [session]);

  if (!session) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Create and select a session.</div>;
  }

  return <div ref={mountRef} className="h-full w-full overflow-hidden bg-card" />;
}
