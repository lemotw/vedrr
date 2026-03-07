export function writeNodeToClipboard(nodeId: string, title: string) {
  navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([title], { type: "text/plain" }),
      "text/html": new Blob(
        [`<span data-vedrr="node:${nodeId}">${title}</span>`],
        { type: "text/html" }
      ),
    }),
  ]);
}
