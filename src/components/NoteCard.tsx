import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Note } from "@/hooks/useNotes";
import { Trash2, Clock, ChevronRight, Bell, Lock, Pin, MoreVertical, ChevronUp, ChevronDown } from "lucide-react";
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

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
  onBellClick?: (note: Note) => void;
  onLockClick?: (note: Note) => void;
  onPinClick?: (note: Note) => void;
  searchQuery?: string;
  fontSize?: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function NoteCard({ note, onDelete, onClick, onBellClick, onLockClick, onPinClick, searchQuery = "", fontSize = 13, onMoveUp, onMoveDown }: NoteCardProps) {
  const colors = COLOR_MAP[note.color] || { bg: "#F3E5F5", bar: "#C9B8F0" };
  const hasReminder = !!note.reminderDate;
  const wasModified = Math.abs(note.updatedAt.getTime() - note.createdAt.getTime()) > 1000;
  const displayedDate = wasModified ? note.updatedAt : note.createdAt;

  // Menu "•••" — esconde Alarme/Bloquear/Excluir, deixando só Fixar visível
  // de cara. Ganha espaço na lista e reduz o risco de excluir sem querer.
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  return (
    <div
      onClick={() => onClick(note)}
      className="group relative flex min-h-14 items-stretch rounded-lg cursor-pointer overflow-hidden"
      style={{
        background: colors.bg,
        boxShadow: note.isPinned
          ? "0 2px 12px -2px rgba(249,168,37,0.25), 0 1px 4px -1px rgba(0,0,0,0.04)"
          : "0 2px 12px -2px rgba(0,0,0,0.06), 0 1px 4px -1px rgba(0,0,0,0.04)",
        border: note.isPinned ? "1px solid rgba(249,168,37,0.5)" : "1px solid rgba(255,255,255,0.7)",
        touchAction: "manipulation",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        isolation: "isolate" as const,
      }}
    >
      <div className="w-1 shrink-0" style={{ background: colors.bar }} />
      {note.isPinned && (onMoveUp || onMoveDown) && (
        <div className="flex w-9 shrink-0 flex-col items-center justify-center pl-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="flex h-[22px] w-8 items-center justify-center rounded-t"
            style={{ color: onMoveUp ? "#F9A825" : "#E0E0E0", cursor: onMoveUp ? "pointer" : "default" }}
            title="Mover para cima"
            aria-label="Mover nota para cima"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="flex h-[22px] w-8 items-center justify-center rounded-b"
            style={{ color: onMoveDown ? "#F9A825" : "#E0E0E0", cursor: onMoveDown ? "pointer" : "default" }}
            title="Mover para baixo"
            aria-label="Mover nota para baixo"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}
      {note.isPinned && (
        <Pin
          size={11}
          fill="#F9A825"
          className="absolute top-1.5 right-1.5 rotate-45"
          style={{ color: "#F9A825" }}
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1 py-1 pl-2 pr-1">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <HighlightText
              text={note.title || "Sem título"}
              highlight={searchQuery}
              className="block flex-1 min-w-0 font-bold leading-tight truncate"
              style={{ color: "#1A1A2E", fontSize: fontSize }}
            />
            {note.isLocked && (
              <Lock size={11} style={{ color: "#F9A825" }} className="shrink-0" />
            )}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Clock size={9} style={{ color: "#999" }} />
            <span className="text-[10px] font-semibold" style={{ color: "#999" }}>
              {wasModified ? "Modificada" : "Criada"} {format(displayedDate, "d MMM, HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 relative">
          <button
            onClick={(e) => { e.stopPropagation(); onPinClick?.(note); }}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors"
            style={{
              color: note.isPinned ? "#F9A825" : "#9E9E9E",
              background: note.isPinned ? "rgba(249,168,37,0.14)" : "rgba(158,158,158,0.10)",
            }}
            title={note.isPinned ? "Desafixar nota" : "Fixar nota"}
          >
            <Pin size={14} fill={note.isPinned ? "#F9A825" : "none"} className={note.isPinned ? "rotate-45" : ""} />
          </button>

          {/* Menu "•••" — Alarme, Bloquear e Excluir ficam aqui dentro. Renderizado
              via portal (fora do card) porque o card usa overflow-hidden pros
              cantos arredondados, o que cortava o menu antes. */}
          <button
            ref={menuBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              if (!showMenu && menuBtnRef.current) {
                const r = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
              }
              setShowMenu((v) => !v);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors"
            style={{
              color: (hasReminder || note.isLocked) ? "#F9A825" : "#9E9E9E",
              background: showMenu ? "rgba(0,0,0,0.10)" : (hasReminder || note.isLocked) ? "rgba(249,168,37,0.14)" : "rgba(158,158,158,0.10)",
            }}
            title="Mais opções"
          >
            <MoreVertical size={14} />
          </button>

          {showMenu && menuPos && createPortal(
            <div
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
              className="fixed rounded-xl overflow-hidden"
              style={{ top: menuPos.top, right: menuPos.right, background: "#FFF", border: "1px solid #F0F0F0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.15)", minWidth: 168, zIndex: 1000 }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onBellClick?.(note); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full transition-colors hover:bg-black/5"
                style={{ padding: "10px 14px" }}
              >
                <Bell size={15} style={{ color: hasReminder ? "#F9A825" : "#6B6B7D" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#1A1A2E" }}>
                  {hasReminder ? "Editar lembrete" : "Adicionar lembrete"}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onLockClick?.(note); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full transition-colors hover:bg-black/5"
                style={{ padding: "10px 14px" }}
              >
                <Lock size={15} style={{ color: note.isLocked ? "#F9A825" : "#6B6B7D" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#1A1A2E" }}>
                  {note.isLocked ? "Gerenciar bloqueio" : "Bloquear nota"}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(note.id); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full transition-colors hover:bg-red-50"
                style={{ padding: "10px 14px" }}
              >
                <Trash2 size={15} style={{ color: "#E53935" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#E53935" }}>Excluir nota</span>
              </button>
            </div>,
            document.body
          )}

          <ChevronRight
            size={13}
            onClick={(e) => { e.stopPropagation(); onClick(note); }}
            className="shrink-0"
            style={{ color: "#BDBDBD" }}
          />
        </div>
      </div>
    </div>
  );
}
