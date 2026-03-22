import { useMemo, useState } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";

import type { FileNode } from "@/types/big-ide";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  nodes: FileNode[];
  selectedFilePath: string | null;
  onOpenFile: (filePath: string) => void;
  isLoading?: boolean;
}

export function FileTree({ nodes, selectedFilePath, onOpenFile, isLoading }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const normalizedExpanded = useMemo(() => {
    const initialState: Record<string, boolean> = {};
    for (const node of nodes) {
      if (node.type === "directory") {
        initialState[node.path] = expanded[node.path] ?? true;
      }
    }
    return initialState;
  }, [expanded, nodes]);

  const toggleDir = (dirPath: string) => {
    setExpanded((previous) => ({
      ...previous,
      [dirPath]: !(previous[dirPath] ?? true)
    }));
  };

  const renderNode = (node: FileNode, depth: number) => {
    const rowClassName = "group flex w-full items-center gap-1 px-1 py-[2px] text-left text-[11px] leading-4";

    if (node.type === "directory") {
      const isOpen = normalizedExpanded[node.path] ?? true;
      return (
        <div key={node.path}>
          <button
            type="button"
            className={cn(rowClassName, "text-foreground/90 hover:bg-muted")}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => toggleDir(node.path)}
          >
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
            {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-amber-700" /> : <Folder className="size-3.5 shrink-0 text-amber-700" />}
            <span className="truncate">{node.name}</span>
          </button>

          {isOpen && node.children?.length
            ? node.children.map((childNode) => renderNode(childNode, depth + 1))
            : null}
        </div>
      );
    }

    return (
      <button
        type="button"
        key={node.path}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={cn(
          rowClassName,
          "text-foreground/80 hover:bg-muted",
          selectedFilePath === node.path && "bg-muted text-foreground"
        )}
        onClick={() => onOpenFile(node.path)}
      >
        <span className="w-3" />
        <FileCode2 className="size-3.5 shrink-0 text-sky-700" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Scanning workspace...</div>;
  }

  if (!nodes.length) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No files yet.</div>;
  }

  return <div className="h-full overflow-auto">{nodes.map((node) => renderNode(node, 0))}</div>;
}
