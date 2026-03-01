import { useState, useRef, useMemo } from "react";
import { Note } from "@/hooks/useNotes";
import {
  Camera,
  X,
  Type,
  ALargeSmall,
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

const NOTE_FONTS = [
  { value: "default", label: "Padrão" },
  { value: "playfair", label: "Elegante" },
  { value: "caveat", label: "Manuscrita" },
  { value: "lora", label: "Clássica" },
  { value: "nunito", label: "Arredondada" },
  { value: "dancing", label: "Caligráfica" },
];

const NOTE_SIZES = [
  { value: "small", label: "P" },
  { value: "medium", label: "M" },
  { value: "large", label: "G" },
  { value: "xlarge", label: "GG" },
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
  const [selectedFont, setSelectedFont] = useState("default");
  const [selectedSize, setSelectedSize] = useState("medium");
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
        setSelectedFont(editingNote.fontFamily || "default");
        setSelectedSize(editingNote.fontSize || "medium");
      } else {
        setTitle("");
        setContent("");
        setImages([]);
        setSelectedColor(NOTE_COLORS[0].value);
        setSelectedFont("default");
        setSelectedSize("medium");
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

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopy = () => {
    const text = `${title}\n\n${content}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Nota copiada!", description: "Conteúdo copiado para a área de transferência." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title, content, images, selectedColor, selectedFont, selectedSize);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); }}>
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
            onClick={handleCopy}
            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="Copiar nota"
          >
            {copied ? <Check size={18} className="text-primary" /> : <Copy size={18} />}
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
              className={cn(
                "w-full bg-transparent border-0 border-b-2 border-border/60 focus:border-primary px-1 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors duration-300",
                getFontClass(selectedFont)
              )}
            />
            <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-focus-within:w-full" />
          </div>

          {/* Content textarea */}
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Comece a escrever sua nota..."
              className={cn(
                "w-full min-h-[180px] bg-secondary/30 rounded-xl px-4 py-3 resize-none outline-none border border-border/30 focus:border-primary/40 focus:bg-secondary/50 transition-all duration-300 placeholder:text-muted-foreground/40 note-shadow",
                getFontClass(selectedFont),
                getSizeClass(selectedSize)
              )}
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

          {/* Font selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 font-medium">
              <Type size={13} /> Fonte
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_FONTS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setSelectedFont(f.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs border transition-all duration-200",
                    getFontClass(f.value),
                    selectedFont === f.value
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                      : "border-border/40 text-muted-foreground hover:border-primary/40 hover:bg-secondary/50"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 font-medium">
              <ALargeSmall size={13} /> Tamanho
            </p>
            <div className="flex gap-2">
              {NOTE_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSelectedSize(s.value)}
                  className={cn(
                    "w-11 h-9 rounded-xl border text-xs font-semibold transition-all duration-200",
                    selectedSize === s.value
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border/40 text-muted-foreground hover:border-primary/40 hover:bg-secondary/50"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Image section */}
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
              <div className="grid grid-cols-3 gap-2.5 mb-3">
                {images.map((img, i) => (
                  <div key={i} className="relative group/img rounded-xl overflow-hidden note-shadow">
                    <img
                      src={img}
                      alt=""
                      className="w-full h-24 object-cover transition-transform duration-300 group-hover/img:scale-105"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/90 shadow-sm opacity-0 group-hover/img:opacity-100 transition-all duration-200 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl h-11 border-border/40 hover:border-primary/40 hover:bg-secondary/50 transition-all duration-200"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={16} />
                Câmera
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl h-11 border-border/40 hover:border-primary/40 hover:bg-secondary/50 transition-all duration-200"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={16} />
                Galeria
              </Button>
            </div>
          </div>

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
