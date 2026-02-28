import { useState, useRef } from "react";
import { NoteCard } from "./NoteCard";
import { Note } from "@/hooks/useNotes";
import { Plus, Search, ImagePlus, Camera, X, Type, ALargeSmall } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NOTE_COLORS = [
  { value: "bg-yellow-100", label: "Amarelo" },
  { value: "bg-blue-100", label: "Azul" },
  { value: "bg-green-100", label: "Verde" },
  { value: "bg-pink-100", label: "Rosa" },
  { value: "bg-orange-100", label: "Laranja" },
  { value: "bg-purple-100", label: "Roxo" },
];

const NOTE_FONTS = [
  { value: "default", label: "Padrão", style: "font-family: 'Plus Jakarta Sans', sans-serif" },
  { value: "playfair", label: "Elegante", style: "font-family: 'Playfair Display', serif" },
  { value: "caveat", label: "Manuscrita", style: "font-family: 'Caveat', cursive" },
  { value: "lora", label: "Clássica", style: "font-family: 'Lora', serif" },
  { value: "nunito", label: "Arredondada", style: "font-family: 'Nunito', sans-serif" },
  { value: "dancing", label: "Caligráfica", style: "font-family: 'Dancing Script', cursive" },
];

const NOTE_SIZES = [
  { value: "small", label: "P", className: "text-xs" },
  { value: "medium", label: "M", className: "text-sm" },
  { value: "large", label: "G", className: "text-base" },
  { value: "xlarge", label: "GG", className: "text-lg" },
];

export function getFontClass(fontFamily: string) {
  const map: Record<string, string> = {
    default: "font-body",
    playfair: "font-display",
    caveat: "font-[Caveat]",
    lora: "font-[Lora]",
    nunito: "font-[Nunito]",
    dancing: "font-[Dancing_Script]",
  };
  return map[fontFamily] || "font-body";
}

export function getSizeClass(fontSize: string) {
  const map: Record<string, string> = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
    xlarge: "text-lg",
  };
  return map[fontSize] || "text-sm";
}

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [selectedFont, setSelectedFont] = useState("default");
  const [selectedSize, setSelectedSize] = useState("medium");
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
    setSelectedColor(NOTE_COLORS[0].value);
    setSelectedFont("default");
    setSelectedSize("medium");
    setDialogOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setImages(note.images);
    setSelectedColor(note.color);
    setSelectedFont(note.fontFamily || "default");
    setSelectedSize(note.fontSize || "medium");
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
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if (editingNote) {
      onUpdate(editingNote.id, title, content, images, selectedColor, selectedFont, selectedSize);
    } else {
      onAdd(title, content, images, selectedColor, selectedFont, selectedSize);
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
        <div className="flex flex-col gap-2">
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
              className={cn("font-semibold", getFontClass(selectedFont))}
            />
            <Textarea
              placeholder="Escreva sua anotação..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={cn("resize-none flex-1 min-h-[200px]", getFontClass(selectedFont), getSizeClass(selectedSize))}
            />

            {/* Font & Size selectors */}
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Type size={12} /> Fonte
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {NOTE_FONTS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setSelectedFont(f.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs border transition-all",
                        selectedFont === f.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/50 text-muted-foreground hover:border-primary/50"
                      )}
                      style={{ fontFamily: f.style.split(": ")[1]?.replace(/'/g, "") }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ALargeSmall size={12} /> Tamanho
              </p>
              <div className="flex gap-1.5">
                {NOTE_SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSelectedSize(s.value)}
                    className={cn(
                      "w-10 h-8 rounded-lg border text-xs font-medium transition-all",
                      selectedSize === s.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

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
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor da nota</p>
              <div className="flex gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setSelectedColor(c.value)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      c.value,
                      selectedColor === c.value
                        ? "border-primary scale-110 ring-2 ring-primary/30"
                        : "border-border/50 hover:scale-105"
                    )}
                    title={c.label}
                  />
                ))}
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
