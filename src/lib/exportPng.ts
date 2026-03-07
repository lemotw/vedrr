import { toPng } from "html-to-image";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "./ipc";

function waitForRender(): Promise<void> {
  return new Promise((r) => setTimeout(r, 100));
}

export async function exportTreeAsPng(treeContainer: HTMLElement, contextName: string): Promise<void> {
  const destination = await saveDialog({
    title: "Export PNG",
    defaultPath: `${contextName}.png`,
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (!destination) return;

  // Snapshot and clear collapsed nodes so the full tree renders
  const savedCollapsed = new Set(useUIStore.getState().collapsedNodes);
  if (savedCollapsed.size > 0) {
    useUIStore.setState({ collapsedNodes: new Set<string>() });
    await waitForRender();
  }

  try {
    const dataUrl = await toPng(treeContainer, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--color-bg-page").trim() || "#1A1A1A",
      pixelRatio: 2,
    });
    const res = await fetch(dataUrl);
    const buf = await res.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf));
    await ipc.writeFileBytes(destination, bytes);
  } finally {
    if (savedCollapsed.size > 0) {
      useUIStore.setState({ collapsedNodes: savedCollapsed });
    }
  }
}
