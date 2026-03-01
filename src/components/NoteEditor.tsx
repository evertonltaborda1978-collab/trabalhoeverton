import { useState, useRef, useMemo } from "react";
import { Note } from "@/hooks/useNotes";
import {
  Camera,
  X,
  ImagePlus,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

const NOTE_COLORS = [
  { value: "bg-yellow-100", label: "Amarelo", ring: "ring-yellow-400" },
  { value: "bg-blue-100", label: "Azul", ring: "ring-blue-400" },
  { value: "bg-green-100", label: "Verde", ring: "ring-green-400" },
  { value: "bg-pink-100", label: "Rosa", ring: "ring-pink-400" },
  { value: "bg-orange-100", label: "Laranja", ring: "ring-orange-400" },
  { value: "bg-purple-100", label: "Roxo", ring: "ring-purple-400" },
  { value: "bg-gray-800", label: "Escura", ring: "ring-gray-500" },
];

export function getFontClass(_fontFamily: string) {
  return "font-body";
}

export function getSizeClass(_fontSize: string) {
  return "text-sm";
}

interface NoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingNote: Note | null;
  onSave: (
    title: string,
    content: string,
    images: string[],
    color: string,
    fontFamily: string,
    fontSize: string
  ) => void;
}

export function NoteEditor({
  open,
  onOpenChange,
  editingNote,
  onSave,
}: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync state when dialog opens
  const lastNoteId = useRef<string | null>(null);
  if (open) {
    const noteId = editingNote?.id ?? "__new__";
    if (lastNoteId.current !== noteId) {
      lastNoteId.current = noteId;
      if (editingNote) {
        setTitle(editingNote.title);
        setContent(editingNote.content);
        setImages(editingNote.images);
        setSelectedColor(editingNote.color);
      } else {
        setTitle("");
        setContent("");
        setImages([]);
        setSelectedColor(NOTE_COLORS[0].value);
      }
    }
  } else {
    if (lastNoteId.current !== null) lastNoteId.current = null;
  }

  const wordCount = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    return { words, chars };
  }, [content]);

  const isDarkNote = selectedColor === "bg-gray-800";

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleCopy = () => {
    const text = `${title}\n\n${content}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Nota copiada com sucesso!", description: "Conteúdo copiado para a área de transferência." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title, content, images, selectedColor, "default", "medium");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => onOpenChange(val)}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden flex flex-col border-0 sm:border sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {editingNote ? "Editar nota" : "Nova nota"}
            </h2>
            {editingNote && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock size={10} />
                Criada em {format(editingNote.createdAt, "d 'de' MMMM, HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {/* Title - Material Design style */}
          <div className="relative group">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da nota..."
              className="w-full bg-transparent border-0 border-b-2 border-border/60 focus:border-primary px-1 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors duration-300 font-body"
            />
            <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-focus-within:w-full" />
          </div>

          {/* Content textarea */}
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Comece a escrever sua nota..."
              className="w-full min-h-[220px] bg-secondary/30 rounded-xl px-4 py-3 resize-none outline-none border border-border/30 focus:border-primary/40 focus:bg-secondary/50 transition-all duration-300 placeholder:text-muted-foreground/40 text-sm font-body note-shadow"
            />
            {/* Word & char counter */}
            <div className="flex justify-end gap-3 mt-1.5 px-1">
              <span className="text-[10px] text-muted-foreground/60">
                {wordCount.words} {wordCount.words === 1 ? "palavra" : "palavras"}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {wordCount.chars} caracteres
              </span>
            </div>
          </div>

          {/* Toolbar: Camera, Gallery, Copy */}
          <div className="flex items-center gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageSelect}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50 transition-all duration-200 text-xs"
            >
              <Camera size={16} />
              Câmera
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50 transition-all duration-200 text-xs"
            >
              <ImagePlus size={16} />
              Galeria
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50 transition-all duration-200 text-xs"
            >
              {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
              Copiar
            </button>
          </div>

          {/* Inline image previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative group/img rounded-lg overflow-hidden shadow-md" style={{ width: "40%", maxWidth: "200px" }}>
                  <img
                    src={img}
                    alt=""
                    className="w-full h-auto object-cover rounded-lg"
                  />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/90 shadow-sm opacity-0 group-hover/img:opacity-100 transition-all duration-200 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Color selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2.5 font-medium">Cor da nota</p>
            <div className="flex gap-3 flex-wrap">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelectedColor(c.value)}
                  className={cn(
                    "w-11 h-11 rounded-full border-2 transition-all duration-300 relative",
                    c.value,
                    selectedColor === c.value
                      ? `${c.ring} ring-2 ring-offset-2 ring-offset-background border-transparent scale-110`
                      : "border-border/40 hover:scale-105"
                  )}
                  title={c.label}
                >
                  {selectedColor === c.value && (
                    <Check
                      size={16}
                      className={cn(
                        "absolute inset-0 m-auto",
                        isDarkNote && selectedColor === c.value ? "text-white" : "text-foreground"
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer buttons - always visible */}
        <div className="px-4 py-3 border-t border-border/30 bg-background/80 backdrop-blur-sm flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-[52px] rounded-xl text-sm font-semibold border-border/50 hover:bg-secondary/50 transition-all duration-200"
            onClick={() => onOpenChange(false)}
          >
            {editingNote ? "Cancelar" : "Salvar rascunho"}
          </Button>
          <Button
            type="button"
            className="flex-1 h-[52px] rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            {editingNote ? "Salvar" : "Criar nota"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
