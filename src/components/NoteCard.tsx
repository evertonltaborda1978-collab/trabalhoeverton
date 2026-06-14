import { Note } from "@/hooks/useNotes";
import { Trash2, Clock, ChevronRight, Pencil, Bell, Lock, Pin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HighlightText } from "./HighlightText";

const COLOR_MAP: Record<string, { bg: string; bar: string }> = {
  "bg-orange-100": { bg: "#FFE8D6", bar: "#FFBF9B" },
  "bg-purple-100": { bg: "#F3E5F5", bar: "#CE93D8" },
  "bg-yellow-100": { bg: "#FFFDE7", bar: "#FFE57F" },
  "bg-green-100": { bg: "#E8F5E9", bar: "#A5D6A7" },
  "bg-pink-100": { bg: "#EDE7F6", bar: "#C9B8F0" },
  "bg-blue-100": { bg: "#E3F2FD", bar: "#90CAF9" },
};

function stripImagePlaceholders(text: string): string {
  return text.replace(/\[imagem-?\d*\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

function getPlainContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return stripImagePlaceholders(
        parsed
          .filter((b: any) => b.type === "text" || b.type === "checklist")
          .map((b: any) => {
            if (b.type === "checklist" && Array.isArray(b.items)) {
              return b.items.map((item: any) => item.text || "").join(" ");
            }
            return b.content || "";
          })
          .join(" ")
      );
    }
  } catch {}
  return stripImagePlaceholders(content);
}

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
  onBellClick?: (note: Note) => void;
  onPinClick?: (id: string) => void;
  onLockClick?: (note: Note) => void;
  searchQuery?: string;
  fontSize?: number;
}

export function NoteCard({ note, onDelete, onClick, onBellClick, onPinClick, onLockClick, searchQuery = "", fontSize = 13 }: NoteCardProps) {
  const colors = COLOR_MAP[note.color] || { bg: "#F3E5F5", bar: "#C9B8F0" };
  const isDraft = note.status === "rascunho";
  const hasReminder = !!note.reminderDate;
  const plainContent = getPlainContent(note.content);
  const preview = note.isLocked ? "🔒 Nota protegida" : (plainContent.length > 140 ? plainContent.slice(0, 140) + "…" : plainContent);

  return (
    <div
      onClick={() => onClick(note)}
      className="group relative flex items-stretch rounded-[18px] cursor-pointer overflow-hidden"
      style={{
        background: colors.bg,
        boxShadow: "0 2px 12px -2px rgba(0,0,0,0.06), 0 1px 4px -1px rgba(0,0,0,0.04)",
        border: "1px solid rgba(255,255,255,0.7)",
        touchAction: "manipulation",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        isolation: "isolate" as const,
      }}
    >
      <div className="w-1 shrink-0 rounded-l-[18px]" style={{ background: colors.bar }} />

      <div className="flex items-center gap-2 px-2 py-2 flex-1 min-w-0" style={{ padding: 8 }}>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <HighlightText
              text={note.title || "Sem título"}
              highlight={searchQuery}
              className="block flex-1 min-w-0 font-bold leading-tight truncate"
              style={{ color: "#1A1A2E", fontSize: fontSize }}
            />
            {isDraft && (
              <span
                className="inline-flex items-center gap-0.5 shrink-0 text-white font-bold"
                style={{ fontSize: 9, background: "#F9A825", borderRadius: 5, padding: "1px 5px" }}
              >
                <Pencil size={8} /> Rascunho
              </span>
            )}
            {note.isLocked && (
              <Lock size={11} style={{ color: "#F9A825" }} className="shrink-0" />
            )}
            {note.isPinned && (
              <Pin size={11} fill="#F9A825" style={{ color: "#F9A825" }} className="shrink-0" />
            )}
          </div>
          {preview && (
            <HighlightText
              text={preview}
