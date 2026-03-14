import type { TreeData } from "./types";
import { NodeTypes } from "./constants";
import { ipc } from "./ipc";

const MAX_CHARS = 50_000;

export interface TreeMarkdownOptions {
  includeContent?: boolean;
  includeType?: boolean;
  maxChars?: number;
}

interface MarkdownSection {
  title: string;
  filePath: string;
}

function collectTree(
  data: TreeData,
  options: TreeMarkdownOptions,
  sections: MarkdownSection[],
  depth: number,
): string {
  const { includeContent = true, includeType = true } = options;

  const indent = "  ".repeat(depth);
  const typePrefix = includeType
    ? `[${data.node.node_type.toUpperCase()}] `
    : "";
  let md = `${indent}- ${typePrefix}${data.node.title || "(untitled)"}`;

  if (data.node.file_path && (data.node.node_type === NodeTypes.IMAGE || data.node.node_type === NodeTypes.FILE)) {
    md += ` → ${data.node.file_path}`;
  }

  if (includeContent && data.node.node_type === NodeTypes.MARKDOWN && data.node.file_path) {
    sections.push({ title: data.node.title || "(untitled)", filePath: data.node.file_path });
  }

  for (const child of data.children) {
    md += "\n" + collectTree(child, options, sections, depth + 1);
  }

  return md;
}

export async function treeToMarkdown(
  data: TreeData,
  options: TreeMarkdownOptions = {},
): Promise<string> {
  const { includeContent = true, maxChars = MAX_CHARS } = options;

  if (!includeContent) {
    return collectTree(data, options, [], 0);
  }

  const sections: MarkdownSection[] = [];
  let md = collectTree(data, options, sections, 0);

  if (sections.length > 0) {
    const decoder = new TextDecoder("utf-8");
    const results = await Promise.allSettled(
      sections.map((s) => ipc.readFileBytes(s.filePath)),
    );

    md += "\n\n---\n";
    for (let i = 0; i < sections.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const content = decoder.decode(new Uint8Array(result.value));
      if (content) {
        md += `\n## ${sections[i].title}\n\n${content}\n`;
      }
      if (md.length > maxChars) {
        md = md.slice(0, maxChars) + "\n...(truncated)";
        break;
      }
    }
  }

  if (md.length > maxChars) {
    md = md.slice(0, maxChars) + "\n...(truncated)";
  }

  return md;
}
