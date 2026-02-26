import { Note } from "@/hooks/useNotes";
import { Trash2, Clock } from "lucide-react";
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
        "group relative p-4 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02] note-shadow animate-fade-in",
        note.color,
        "border border-border/30"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(note.id);
        }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} />
      </button>

      <h3 className="font-display font-semibold text-foreground text-sm mb-1.5 pr-6 line-clamp-1">
        {note.title}
      </h3>
      {note.imageUrl && (
        <img src={note.imageUrl} alt="" className="w-full max-h-32 object-contain rounded-lg mb-2" />
      )}
      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-3">
        {note.content}
      </p>
      <div className="flex items-center gap-1 text-muted-foreground/60">
        <Clock size={10} />
        <span className="text-[10px]">
          {format(note.updatedAt, "d MMM, HH:mm", { locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
