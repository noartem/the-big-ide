import { ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { FileNode } from "@/types/big-ide";

interface FileTreeProps {
  nodes: FileNode[];
  selectedFilePath: string | null;
  onOpenFile: (filePath: string, options?: { focusEditor?: boolean }) => void;
  isLoading?: boolean;
}

interface VisibleTreeNode {
  depth: number;
  node: FileNode;
}

function flattenVisibleNodes(nodes: FileNode[], expanded: Record<string, boolean>, depth = 0): VisibleTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type !== "directory") {
      return [{ depth, node }];
    }

    const isOpen = expanded[node.path] ?? false;
    return [
      { depth, node },
      ...(isOpen && node.children?.length ? flattenVisibleNodes(node.children, expanded, depth + 1) : [])
    ];
  });
}

export function FileTree({ nodes, selectedFilePath, onOpenFile, isLoading }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const keyboardHandledPathRef = useRef<string | null>(null);

  const visibleNodes = useMemo(() => flattenVisibleNodes(nodes, expanded), [expanded, nodes]);

  const focusItem = useCallback((filePath: string) => {
    setFocusedPath(filePath);
    window.requestAnimationFrame(() => {
      itemRefs.current[filePath]?.focus();
    });
  }, []);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((previous) => ({
      ...previous,
      [dirPath]: !(previous[dirPath] ?? false)
    }));
  }, []);

  useEffect(() => {
    if (!visibleNodes.length) {
      if (focusedPath !== null) {
        setFocusedPath(null);
      }
      return;
    }

    if (!focusedPath || !visibleNodes.some(({ node }) => node.path === focusedPath)) {
      setFocusedPath(visibleNodes[0].node.path);
    }
  }, [focusedPath, visibleNodes]);

  const moveFocus = useCallback(
    (currentPath: string, direction: -1 | 1) => {
      const currentIndex = visibleNodes.findIndex(({ node }) => node.path === currentPath);
      if (currentIndex === -1) {
        const fallback = direction > 0 ? visibleNodes[0] : visibleNodes.at(-1);
        if (fallback) {
          focusItem(fallback.node.path);
        }
        return;
      }

      const nextItem = visibleNodes[currentIndex + direction];
      if (nextItem) {
        focusItem(nextItem.node.path);
      }
    },
    [focusItem, visibleNodes]
  );

  const handleItemKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, node: FileNode) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(node.path, 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(node.path, -1);
          return;
        case "ArrowRight":
          if (node.type === "directory" && !(expanded[node.path] ?? false)) {
            event.preventDefault();
            toggleDir(node.path);
          }
          return;
        case "ArrowLeft":
          if (node.type === "directory" && (expanded[node.path] ?? false)) {
            event.preventDefault();
            toggleDir(node.path);
          }
          return;
        case "Enter":
          event.preventDefault();
          keyboardHandledPathRef.current = node.path;
          if (node.type === "directory") {
            toggleDir(node.path);
            return;
          }

          onOpenFile(node.path, { focusEditor: true });
          return;
      }
    },
    [expanded, moveFocus, onOpenFile, toggleDir]
  );

  const renderNode = (node: FileNode, depth: number) => {
    const rowClassName = "group flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs leading-4 transition-colors";

    if (node.type === "directory") {
      const isOpen = expanded[node.path] ?? false;
      return (
        <div key={node.path}>
          <button
            data-testid="file-tree-directory"
            data-file-tree-item="true"
            data-file-path={node.path}
            type="button"
            ref={(nodeRef) => {
              itemRefs.current[node.path] = nodeRef;
            }}
            className={cn(rowClassName, "text-foreground/90 hover:bg-muted/40")}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onFocus={() => setFocusedPath(node.path)}
            onKeyDown={(event) => handleItemKeyDown(event, node)}
            onClick={() => {
              if (keyboardHandledPathRef.current === node.path) {
                keyboardHandledPathRef.current = null;
                return;
              }

              setFocusedPath(node.path);
              toggleDir(node.path);
            }}
            tabIndex={focusedPath === node.path ? 0 : -1}
          >
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
            {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-amber-700" /> : <Folder className="size-3.5 shrink-0 text-amber-700" />}
            <span className="truncate">{node.name}</span>
          </button>

          {isOpen && node.children?.length ? node.children.map((childNode) => renderNode(childNode, depth + 1)) : null}
        </div>
      );
    }

    return (
      <button
        data-testid="file-tree-file"
        data-file-tree-item="true"
        data-file-path={node.path}
        type="button"
        key={node.path}
        ref={(nodeRef) => {
          itemRefs.current[node.path] = nodeRef;
        }}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={cn(
          rowClassName,
          "border-t border-transparent text-foreground/80 hover:bg-muted/40",
          selectedFilePath === node.path && "bg-muted/50 text-foreground"
        )}
        onFocus={() => setFocusedPath(node.path)}
        onKeyDown={(event) => handleItemKeyDown(event, node)}
        onClick={() => {
          if (keyboardHandledPathRef.current === node.path) {
            keyboardHandledPathRef.current = null;
            return;
          }

          setFocusedPath(node.path);
          onOpenFile(node.path);
        }}
        tabIndex={focusedPath === node.path ? 0 : -1}
      >
        <span className="w-3" />
        <FileCode2 className="size-3.5 shrink-0 text-sky-700" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center px-3 text-xs text-muted-foreground">Scanning workspace...</div>;
  }

  if (!nodes.length) {
    return <div className="flex h-full items-center justify-center px-3 text-xs text-muted-foreground">No files yet.</div>;
  }

  return <div className="h-full overflow-auto py-1">{nodes.map((node) => renderNode(node, 0))}</div>;
}
