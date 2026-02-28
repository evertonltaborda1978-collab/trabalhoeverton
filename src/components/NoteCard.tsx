import { Note } from "@/hooks/useNotes";
import { Trash2, Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
}

export function NoteCard({ note, onDelete, onClick }: NoteCardProps) {
  return (
    <div
      onClick={() => onClick(note)}
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.01] note-shadow animate-fade-in border border-border/30",
        note.color
      )}
    >
      <div className={cn("w-3 h-3 rounded-full shrink-0 border border-border/50", note.color)} />

      <div className="flex-1 min-w-0">
        <h3 className="font-display font-semibold text-foreground text-sm line-clamp-1">
          {note.title || "Sem título"}
        </h3>
        <div className="flex items-center gap-1 text-muted-foreground/60 mt-0.5">
          <Clock size={10} />
          <span className="text-[10px]">
            {format(note.updatedAt, "d MMM, HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
        <ChevronRight size={16} className="text-muted-foreground/40" />
      </div>
    </div>
  );
}
