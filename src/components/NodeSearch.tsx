import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import type { TreeData, TreeNode } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { cn } from "../lib/cn";
import { modSymbol } from "../lib/platform";

interface FlatNode {
  node: TreeNode;
  path: string; // breadcrumb path (excluding root)
}

function flattenTree(tree: TreeData, ancestors: string[] = []): FlatNode[] {
  const result: FlatNode[] = [];
  const path = ancestors.length > 0 ? ancestors.join(" › ") : "";
  result.push({ node: tree.node, path });
  for (const child of tree.children) {
    result.push(...flattenTree(child, [...ancestors, tree.node.title || "Untitled"]));
  }
  return result;
}

export function NodeSearch() {
  const { nodeSearchOpen, closeNodeSearch } = useUIStore();
  const { tree, selectNode } = useTreeStore();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flatten tree once
  const allNodes = useMemo(() => {
    if (!tree) return [];
    return flattenTree(tree);
  }, [tree]);

  // Filter by query
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allNodes.filter(n => n.node.title.toLowerCase().includes(q));
  }, [query, allNodes]);

  // Reset state on open
  useEffect(() => {
    if (nodeSearchOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [nodeSearchOpen]);

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(Math.max(0, results.length - 1));
  }, [results.length, selectedIdx]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!nodeSearchOpen) return null;

  function handleSelect(nodeId: string) {
    selectNode(nodeId);
    closeNodeSearch();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIdx]) handleSelect(results[selectedIdx].node.id);
        break;
      case "Escape":
        e.preventDefault();
        closeNodeSearch();
        break;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={closeNodeSearch}>
      <div
        className="w-[480px] max-h-[420px] bg-bg-elevated rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center h-12 px-4 bg-bg-card shrink-0">
          <span className="text-text-secondary text-sm mr-2">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-text-primary font-mono text-[13px] outline-none placeholder:text-text-secondary"
            placeholder="搜尋節點..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-text-secondary font-mono text-[11px] bg-bg-elevated rounded px-2 py-1">{modSymbol}F</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">找不到符合的節點</div>
          )}
          {results.map((item, idx) => {
            const cfg = NODE_TYPE_CONFIG[item.node.node_type];
            return (
              <div
                key={item.node.id}
                className={cn(
                  "flex flex-col gap-1 px-4 py-2 cursor-pointer",
                  idx === selectedIdx ? "bg-accent-primary/10" : "hover:bg-bg-card/50",
                )}
                onClick={() => handleSelect(item.node.id)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-bg-elevated shrink-0"
                    style={{ color: cfg?.color }}
                  >
                    {cfg?.letter}
                  </span>
                  <span className={cn("font-mono text-[13px] text-text-primary", idx === selectedIdx && "font-semibold")}>
                    {item.node.title || "Untitled"}
                  </span>
                </div>
                {item.path && (
                  <span className="font-mono text-[10px] text-text-secondary ml-7">{item.path}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center h-10 px-4 bg-bg-card shrink-0">
          <span className="font-mono text-[10px] text-text-secondary">↑↓ 選擇  Enter 跳轉  Esc 關閉</span>
        </div>
      </div>
    </div>
  );
}
