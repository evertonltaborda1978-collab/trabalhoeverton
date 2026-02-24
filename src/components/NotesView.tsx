import { useState } from "react";
import { NoteCard } from "./NoteCard";
import { Note } from "@/hooks/useNotes";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface NotesViewProps {
  notes: Note[];
  onAdd: (title: string, content: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, title: string, content: string) => void;
}

export function NotesView({ notes, onAdd, onDelete, onUpdate }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingNote(null);
    setTitle("");
    setContent("");
    setDialogOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if (editingNote) {
      onUpdate(editingNote.id, title, content);
    } else {
      onAdd(title, content);
    }
    setDialogOpen(false);
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
          <StickyNoteIllustration />
          <p className="mt-4 text-sm">Nenhuma nota encontrada</p>
          <p className="text-xs mt-1">Toque em + para criar uma nova nota</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={onDelete} onClick={openEdit} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingNote ? "Editar nota" : "Nova nota"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-semibold"
            />
            <Textarea
              placeholder="Escreva sua anotação..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <Button onClick={handleSave} className="w-full">
              {editingNote ? "Salvar" : "Criar nota"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StickyNoteIllustration() {
  return (
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary">
      <span className="text-3xl">📝</span>
    </div>
  );
}
