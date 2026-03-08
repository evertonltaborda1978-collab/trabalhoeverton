import { Note } from "@/hooks/useNotes";
import { Trash2, Clock, ChevronRight, Pencil, Bell, Lock } from "lucide-react";
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

function getPlainContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b: any) => b.type === "text" || b.type === "checklist")
        .map((b: any) => {
          if (b.type === "checklist" && Array.isArray(b.items)) {
            return b.items.map((item: any) => item.text || "").join(" ");
          }
          return b.content || "";
        })
        .join(" ");
    }
  } catch {}
  return content;
}

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
  onBellClick?: (note: Note) => void;
  onLockClick?: (note: Note) => void;
  index?: number;
  searchQuery?: string;
}

export function NoteCard({ note, onDelete, onClick, onBellClick, onLockClick, index = 0, searchQuery = "" }: NoteCardProps) {
  const colors = COLOR_MAP[note.color] || { bg: "#F3E5F5", bar: "#C9B8F0" };
  const isDraft = note.status === "rascunho";
  const hasReminder = !!note.reminderDate;
  const plainContent = getPlainContent(note.content);
  const preview = note.isLocked ? "🔒 Nota protegida" : (plainContent.length > 80 ? plainContent.slice(0, 80) + "…" : plainContent);

  return (
    <div
      onClick={() => onClick(note)}
      className="group relative flex items-stretch rounded-[18px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
      style={{
        background: colors.bg,
        boxShadow: "0 2px 12px -2px rgba(0,0,0,0.06), 0 1px 4px -1px rgba(0,0,0,0.04)",
        border: "1px solid rgba(255,255,255,0.7)",
        animationDelay: `${index * 0.05}s`,
        animationFillMode: "both",
      }}
    >
      <div className="w-1 shrink-0 rounded-l-[18px]" style={{ background: colors.bar }} />

      <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <HighlightText
              text={note.title || "Sem título"}
              highlight={searchQuery}
              className="font-bold text-[15px] leading-tight line-clamp-1"
              style={{ color: "#1A1A2E" }}
            />
            {isDraft && (
              <span
                className="inline-flex items-center gap-0.5 shrink-0 text-white font-bold"
                style={{ fontSize: 10, background: "#F9A825", borderRadius: 6, padding: "2px 8px" }}
              >
                <Pencil size={9} /> Rascunho
              </span>
            )}
            {note.isLocked && (
              <Lock size={13} style={{ color: "#F9A825" }} className="shrink-0" />
            )}
          </div>
          {preview && (
            <HighlightText
              text={preview}
              highlight={note.isLocked ? "" : searchQuery}
              className="text-[12px] mt-0.5 line-clamp-1"
              style={{ color: "#777" }}
            />
          )}
          <div className="flex items-center gap-1 mt-1">
            <Clock size={11} style={{ color: "#999" }} />
            <span className="text-[11.5px] font-semibold" style={{ color: "#999" }}>
              {format(note.updatedAt, "d MMM, HH:mm", { locale: ptBR })}
            </span>
            {hasReminder && (
              <span className="flex items-center gap-0.5 ml-1 text-[10px] font-semibold" style={{ color: "#F9A825" }}>
                <Bell size={10} /> {note.reminderDate} {note.reminderTime}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Bell button */}
          <button
            onClick={(e) => { e.stopPropagation(); onBellClick?.(note); }}
            className="p-1.5 rounded-md transition-all hover:bg-black/5"
            style={{ color: hasReminder ? "#F9A825" : "#BDBDBD" }}
            title={hasReminder ? "Editar lembrete" : "Adicionar lembrete"}
          >
            <Bell size={14} />
          </button>
          {/* Lock button */}
          <button
            onClick={(e) => { e.stopPropagation(); onLockClick?.(note); }}
            className="p-1.5 rounded-md transition-all hover:bg-black/5"
            style={{ color: note.isLocked ? "#F9A825" : "#BDBDBD" }}
            title={note.isLocked ? "Gerenciar bloqueio" : "Bloquear nota"}
          >
            <Lock size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-black/5"
            style={{ color: "#999" }}
          >
            <Trash2 size={14} />
          </button>
          <ChevronRight
            size={16}
            className="transition-transform duration-200 group-hover:translate-x-[3px]"
            style={{ color: "#BDBDBD" }}
          />
        </div>
      </div>
    </div>
  );
}
