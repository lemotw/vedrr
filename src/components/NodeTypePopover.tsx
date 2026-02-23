import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeType } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { NODE_TYPE_LIST } from "../lib/constants";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import { cn } from "../lib/cn";

function findNodeType(tree: import("../lib/types").TreeData, nodeId: string): NodeType | null {
  if (tree.node.id === nodeId) return tree.node.node_type;
  for (const child of tree.children) {
    const found = findNodeType(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function NodeTypePopover() {
  const { typePopoverNodeId } = useUIStore();
  if (!typePopoverNodeId) return null;
  return <NodeTypePopoverInner key={typePopoverNodeId} nodeId={typePopoverNodeId} />;
}

function NodeTypePopoverInner({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation();
  const { closeTypePopover } = useUIStore();
  const { tree, updateNodeType } = useTreeStore();
  const panelRef = useRef<HTMLDivElement>(null);

  const currentType = tree ? findNodeType(tree, nodeId) : null;

  const [selectedIndex, setSelectedIndex] = useState(
    () => (currentType ? NODE_TYPE_LIST.indexOf(currentType) : 0),
  );

  useEffect(() => {
    setTimeout(() => panelRef.current?.focus(), 30);
  }, []);

  if (!currentType) return null;

  const handleSelect = (type: NodeType) => {
    if (type !== currentType) {
      updateNodeType(nodeId, type);
    }
    closeTypePopover();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    // Number keys 1-4 for quick switch
    const num = parseInt(e.key);
    if (num >= 1 && num <= 4) {
      e.preventDefault();
      handleSelect(NODE_TYPE_LIST[num - 1]);
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, NODE_TYPE_LIST.length - 1));
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        handleSelect(NODE_TYPE_LIST[selectedIndex]);
        break;
      case "Escape":
      case "t":
        e.preventDefault();
        closeTypePopover();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={closeTypePopover}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2
          w-[200px] bg-bg-elevated rounded-xl overflow-hidden outline-none"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-3 pt-2.5 pb-1">
          <span className="text-[9px] font-bold text-text-secondary tracking-[2px] font-mono">
            {t("nodeTypePopover.title")}
          </span>
        </div>
        <div className="py-1">
          {NODE_TYPE_LIST.map((type, i) => {
            const { letter, color } = NODE_TYPE_CONFIG[type];
            const isCurrent = type === currentType;
            const isHighlighted = i === selectedIndex;
            return (
              <div
                key={type}
                className={cn(
                "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                isHighlighted && "bg-[var(--color-hover)]",
                isCurrent && "bg-accent-primary/10",
              )}
                onClick={() => handleSelect(type)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-[11px] font-bold text-text-secondary font-mono w-3 text-center">
                  {i + 1}
                </span>
                <div className="flex items-center justify-center w-5 h-5 rounded bg-bg-page shrink-0">
                  <span className="text-[10px] font-bold font-mono" style={{ color }}>
                    {letter}
                  </span>
                </div>
                <span className={cn("text-[12px] font-mono", isCurrent ? "text-accent-primary font-bold" : "text-text-primary")}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-3 py-2 border-t border-border">
          <span className="text-[9px] text-text-secondary font-mono">
            <kbd className="bg-bg-card px-1 py-0.5 rounded text-[8px]">1-4</kbd> {t("nodeTypePopover.hint.switch")}
          </span>
          <span className="text-[9px] text-text-secondary font-mono">
            <kbd className="bg-bg-card px-1 py-0.5 rounded text-[8px]">j/k</kbd> {t("nodeTypePopover.hint.nav")}
          </span>
        </div>
      </div>
    </div>
  );
}
