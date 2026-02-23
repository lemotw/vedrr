import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { CompactStates } from "../lib/constants";
import type { TreeData } from "../lib/types";

const CHANGE_TYPE_KEYS: Record<string, { key: string; color: string }> = {
  added:          { key: "compactBanner.change.added", color: "#2DD4BF" },
  edited:         { key: "compactBanner.change.edited", color: "#FBBF24" },
  moved:          { key: "compactBanner.change.moved", color: "#4FC3F7" },
  "edited+moved": { key: "compactBanner.change.editedMoved", color: "#FBBF24" },
  deleted:        { key: "compactBanner.change.deleted", color: "#FF6B6B" },
};

function findNode(td: TreeData, id: string): TreeData | null {
  if (td.node.id === id) return td;
  for (const c of td.children) {
    const found = findNode(c, id);
    if (found) return found;
  }
  return null;
}

export function CompactBanner() {
  const { t } = useTranslation();
  const compactState = useUIStore((s) => s.compactState);
  const summary = useUIStore((s) => s.compactSummary);
  const highlights = useUIStore((s) => s.compactHighlights);
  const expanded = useUIStore((s) => s.compactBannerExpanded);
  const flash = useUIStore((s) => s.compactBannerFlash);
  const tree = useTreeStore((s) => s.tree);
  const { toggleCompactBannerExpanded } = useUIStore();

  if (compactState !== CompactStates.APPLIED || !summary) return null;

  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} ${t("compactBanner.change.added")}`);
  if (summary.edited > 0) parts.push(`${summary.edited} ${t("compactBanner.change.edited")}`);
  if (summary.moved > 0) parts.push(`${summary.moved} ${t("compactBanner.change.moved")}`);
  if (summary.deleted > 0) parts.push(`${summary.deleted} ${t("compactBanner.change.deleted")}`);
  const total = summary.added + summary.edited + summary.moved + summary.deleted;

  const handleUndo = () => {
    useUIStore.getState().clearCompactHighlights();
    useTreeStore.getState().undoCompact();
  };

  const handleAccept = () => {
    useUIStore.getState().clearCompactHighlights();
  };

  // Build per-item change list for expanded view
  const changeItems: { label: string; color: string; detail: string }[] = [];
  if (highlights && tree) {
    for (const [nodeId, info] of highlights) {
      const cfg = CHANGE_TYPE_KEYS[info.type];
      if (!cfg) continue;
      const node = findNode(tree, nodeId);
      const title = node?.node.title || nodeId;
      let detail = t("compactBanner.detail.title", { title });
      if (info.type === "edited" || info.type === "edited+moved") {
        if (info.oldTitle) detail = t("compactBanner.detail.renamed", { old: info.oldTitle, new: title });
      }
      if (info.type === "moved" || info.type === "edited+moved") {
        if (info.fromParent) detail += ` ${t("compactBanner.detail.movedFrom", { parent: info.fromParent })}`;
      }
      changeItems.push({ label: t(cfg.key), color: cfg.color, detail });
    }
  }
  for (const name of summary.deletedNames) {
    const cfg = CHANGE_TYPE_KEYS.deleted;
    changeItems.push({ label: t(cfg.key), color: cfg.color, detail: t("compactBanner.detail.title", { title: name }) });
  }

  return (
    <div className="mx-4 mt-2 rounded-lg border border-border bg-bg-elevated overflow-hidden shrink-0">
      <div
        key={flash}
        className="flex items-center gap-3 px-4 py-2.5 border-l-[3px] border-l-accent-primary compact-flash-anim"
      >
        <span className="text-accent-primary text-sm">✦</span>
        <span className="font-mono text-xs text-text-primary flex-1">
          {t("compactBanner.summary", { total, details: parts.join(" · ") })}
        </span>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <button
            className="px-2 py-0.5 rounded border border-border text-text-secondary cursor-pointer hover:text-text-primary hover:border-text-secondary transition-colors"
            onClick={handleUndo}
          >
            {t("compactBanner.button.undo")}
          </button>
          <button
            className="cursor-pointer text-text-secondary hover:text-text-primary transition-colors"
            onClick={toggleCompactBannerExpanded}
          >
            {expanded ? `${t("compactBanner.button.collapse")} ▴` : `${t("compactBanner.button.expand")} ▾`}
          </button>
          <button
            className="px-2 py-0.5 rounded bg-accent-primary text-bg-page font-bold cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleAccept}
          >
            {t("compactBanner.button.accept")}
          </button>
        </div>
      </div>

      {expanded && changeItems.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-bg-card flex flex-col gap-1">
          {changeItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
              <span
                className="px-1.5 py-0 rounded text-[10px] font-bold shrink-0"
                style={{ color: item.color, border: `1px solid ${item.color}44` }}
              >
                {item.label}
              </span>
              <span className="text-text-secondary">{item.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
