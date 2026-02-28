import { useState, useRef } from "react";
import { NoteCard } from "./NoteCard";
import { Note } from "@/hooks/useNotes";
import { Plus, Search, ImagePlus, Camera, X } from "lucide-react";
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
  onAdd: (title: string, content: string, images?: string[]) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, title: string, content: string, images?: string[]) => void;
}

export function NotesView({ notes, onAdd, onDelete, onUpdate }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingNote(null);
    setTitle("");
    setContent("");
    setImages([]);
    setDialogOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setImages(note.images);
    setDialogOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setImages((prev) => [...prev, url]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if (editingNote) {
      onUpdate(editingNote.id, title, content, images);
    } else {
      onAdd(title, content, images);
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
        <DialogContent className="sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingNote ? "Editar nota" : "Nova nota"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 flex-1 flex flex-col">
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
              className="resize-none flex-1 min-h-[200px]"
            />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageSelect}
              />
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt="" className="w-full h-24 object-cover rounded-lg" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={16} />
                  Tirar foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus size={16} />
                  Galeria
                </Button>
              </div>
            </div>
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
