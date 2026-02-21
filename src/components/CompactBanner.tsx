import { useUIStore } from "../stores/uiStore";
import { CompactStates } from "../lib/constants";

export function CompactBanner() {
  const compactState = useUIStore((s) => s.compactState);
  const summary = useUIStore((s) => s.compactSummary);
  const expanded = useUIStore((s) => s.compactBannerExpanded);
  const { toggleCompactBannerExpanded } = useUIStore();

  if (compactState !== CompactStates.APPLIED || !summary) return null;

  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} 新增`);
  if (summary.edited > 0) parts.push(`${summary.edited} 編輯`);
  if (summary.moved > 0) parts.push(`${summary.moved} 移動`);
  if (summary.deleted > 0) parts.push(`${summary.deleted} 刪除`);
  const total = summary.added + summary.edited + summary.moved + summary.deleted;

  return (
    <div className="mx-4 mt-2 rounded-lg border border-border bg-bg-elevated overflow-hidden shrink-0">
      <div className="flex items-center gap-3 px-4 py-2.5 border-l-[3px] border-l-accent-primary">
        <span className="text-accent-primary text-sm">✦</span>
        <span className="font-mono text-xs text-text-primary flex-1">
          AI 重組了 {total} 個節點 — {parts.join(" · ")}
        </span>
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-secondary">
          <span>[u] 復原</span>
          <button
            className="cursor-pointer hover:text-text-primary transition-colors"
            onClick={toggleCompactBannerExpanded}
          >
            {expanded ? "收合 ▴" : "展開詳情 ▾"}
          </button>
          <span>Enter/Esc 確認</span>
        </div>
      </div>

      {summary.deletedNames.length > 0 && (
        <div className="px-4 py-1.5 border-t border-border/50">
          <span className="font-mono text-[11px] text-red-400">
            ✕ 已刪除：{summary.deletedNames.map(n => `「${n}」`).join("")}
          </span>
        </div>
      )}

      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-card">
          <p className="font-mono text-xs text-text-secondary leading-relaxed">
            AI 根據節點內容與結構進行了自動整理。
            {summary.added > 0 && ` 新增了 ${summary.added} 個分類節點。`}
            {summary.moved > 0 && ` 移動了 ${summary.moved} 個節點到更合適的位置。`}
            {summary.edited > 0 && ` 重新命名了 ${summary.edited} 個節點。`}
            {summary.deleted > 0 && ` 移除了 ${summary.deleted} 個冗餘節點。`}
          </p>
        </div>
      )}
    </div>
  );
}
