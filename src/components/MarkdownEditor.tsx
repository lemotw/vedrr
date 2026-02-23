import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { useUIStore } from "../stores/uiStore";
import { cn } from "../lib/cn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdown(editor: any): string {
  return (editor.storage.markdown as MarkdownStorage).getMarkdown();
}

interface Props {
  content: string; // Markdown string
  onSave: (markdown: string) => void;
}

export function MarkdownEditor({ content, onSave }: Props) {
  const { t } = useTranslation();
  const { setContentPanelFocused, closeMarkdownEditor } = useUIStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestContent = useRef(content);

  const debouncedSave = useCallback(
    (md: string) => {
      latestContent.current = md;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onSave(md), 500);
    },
    [onSave],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        onSave(latestContent.current);
      }
    };
  }, [onSave]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: t("markdownEditor.placeholder"),
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: content || "",
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] prose-editor",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          editor?.commands.blur();
          closeMarkdownEditor();
          return true;
        }
        return false;
      },
    },
    onFocus: () => setContentPanelFocused(true),
    onBlur: () => setContentPanelFocused(false),
    onUpdate: ({ editor: e }) => {
      debouncedSave(getMarkdown(e));
    },
  });

  // Sync content when switching nodes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const current = getMarkdown(editor);
      // Only reset if content actually changed (avoid cursor jump)
      if (current !== content && content !== latestContent.current) {
        editor.commands.setContent(content || "");
        latestContent.current = content;
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 flex-wrap">
        <ToolBtn
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          label="H1"
        />
        <ToolBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="H2"
        />
        <ToolBtn
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          label="H3"
        />
        <Sep />
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="B"
          bold
        />
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="I"
          italic
        />
        <ToolBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="S"
          strike
        />
        <ToolBtn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="<>"
        />
        <Sep />
        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="&bull;"
        />
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="1."
        />
        <ToolBtn
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="&raquo;"
        />
        <ToolBtn
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          label="{}"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  bold,
  italic,
  strike,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      className={cn(
        "px-1.5 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors",
        active
          ? "bg-accent-primary/20 text-accent-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)]",
        bold && "font-bold",
        italic && "italic",
        strike && "line-through",
      )}
      onMouseDown={(e) => {
        e.preventDefault(); // prevent editor blur
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-border mx-0.5" />;
}
