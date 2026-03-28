"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Bold, Italic, List, ListOrdered, CheckSquare, Heading2, Heading3, Highlighter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notesToHtml } from "@/lib/notes-format";

type Props = {
  meetingId: string;
  initialContent: string;
  onSave?: (content: string) => void;
};

export default function NotesEditor({ meetingId, initialContent, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Notities verschijnen hier na genereren…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Typography,
    ],
    content: notesToHtml(initialContent || ""),
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none focus:outline-none min-h-[320px] p-6 text-[15px] leading-relaxed bg-white",
      },
    },
    onUpdate: ({ editor }) => {
      setSaved(false);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        autoSave(editor.getHTML());
      }, 1500);
    },
  });

  const autoSave = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        await fetch(`/api/meetings/${meetingId}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setSaved(true);
        onSave?.(content);
      } finally {
        setSaving(false);
      }
    },
    [meetingId, onSave]
  );


  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-100 p-2 flex-wrap">
        <ToolButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolButton>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          title="Task List"
        >
          <CheckSquare className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive("highlight")}
          title="Highlight"
        >
          <Highlighter className="h-4 w-4" />
        </ToolButton>

        <div className="ml-auto text-xs text-gray-400">
          {saving ? "Opslaan…" : saved ? "Opgeslagen" : "Niet opgeslagen"}
        </div>
      </div>

      <EditorContent editor={editor} className="flex-1" />
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-indigo-100 text-indigo-600"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      )}
    >
      {children}
    </button>
  );
}
