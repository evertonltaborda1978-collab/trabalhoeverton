import { useState } from "react";
import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";
import { Note } from "@/hooks/useNotes";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Re-export helpers for NoteCard usage
export { getFontClass, getSizeClass } from "./NoteEditor";

interface NotesViewProps {
  notes: Note[];
  onAdd: (title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string) => void;
}

export function NotesView({ notes, onAdd, onDelete, onUpdate }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingNote(null);
    setDialogOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setDialogOpen(true);
  };

  const handleSave = (
    title: string,
    content: string,
    images: string[],
    color: string,
    fontFamily: string,
    fontSize: string
  ) => {
    if (editingNote) {
      onUpdate(editingNote.id, title, content, images, color, fontFamily, fontSize);
    } else {
      onAdd(title, content, images, color, fontFamily, fontSize);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50 font-body text-sm"
          />
        </div>
        <Button
          onClick={openNew}
          size="icon"
          className="shrink-0 rounded-xl bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-shadow"
        >
          <Plus size={20} />
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary">
            <span className="text-3xl">📝</span>
          </div>
          <p className="mt-4 text-sm">Nenhuma nota encontrada</p>
          <p className="text-xs mt-1">Toque em + para criar uma nova nota</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={onDelete} onClick={openEdit} />
          ))}
        </div>
      )}

      <NoteEditor
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingNote={editingNote}
        onSave={handleSave}
      />
    </div>
  );
}
