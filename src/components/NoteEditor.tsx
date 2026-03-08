import { useState, useRef, useCallback, useEffect } from "react";
import { Note } from "@/hooks/useNotes";
import {
  Camera,
  X,
  ImagePlus,
  Copy,
  Check,
  Undo2,
  Redo2,
  ScanSearch,
  Loader2,
  ScanLine,
  Mic,
  MicOff,
  ListChecks,
  Square,
  CheckSquare,
  CalendarPlus,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

// ── Types ──────────────────────────────────────────────
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ContentBlock {
  type: "text" | "image" | "checklist";
  content?: string;
  url?: string;
  items?: ChecklistItem[];
}

// ── Color theme map ────────────────────────────────────
const COLOR_THEMES: Record<string, { bg: string; lines: string; headerBg: string; toolbarBg: string; textMuted: string; borderAccent: string }> = {
  "bg-yellow-100": { bg: "#FFFDE7", lines: "#F0E68C", headerBg: "#F0E68C", toolbarBg: "#FFF9C4", textMuted: "#8B7E3C", borderAccent: "#D4C55A" },
  "bg-orange-100": { bg: "#FFE8D6", lines: "#FFBF9B", headerBg: "#FFBF9B", toolbarBg: "#FFECD2", textMuted: "#8B5E3C", borderAccent: "#E89B6B" },
  "bg-purple-100": { bg: "#EDE7F6", lines: "#C9B8F0", headerBg: "#C9B8F0", toolbarBg: "#E8E0F4", textMuted: "#5E4B8B", borderAccent: "#B39DDB" },
  "bg-green-100": { bg: "#E8F5E9", lines: "#A5D6A7", headerBg: "#A5D6A7", toolbarBg: "#E0F2E1", textMuted: "#3C6B3E", borderAccent: "#81C784" },
  "bg-pink-100": { bg: "#F3E5F5", lines: "#CE93D8", headerBg: "#CE93D8", toolbarBg: "#EFE0F3", textMuted: "#7B3C8B", borderAccent: "#BA68C8" },
  "bg-blue-100": { bg: "#E3F2FD", lines: "#90CAF9", headerBg: "#90CAF9", toolbarBg: "#DCF0FC", textMuted: "#3C5E8B", borderAccent: "#64B5F6" },
  "bg-gray-800": { bg: "#2D2D2D", lines: "#444444", headerBg: "#444444", toolbarBg: "#333333", textMuted: "#AAAAAA", borderAccent: "#666666" },
};

const NOTE_COLORS = [
  { value: "bg-yellow-100", label: "Amarelo", dot: "#FEF9C3" },
  { value: "bg-blue-100", label: "Azul", dot: "#DBEAFE" },
  { value: "bg-green-100", label: "Verde", dot: "#DCFCE7" },
  { value: "bg-pink-100", label: "Rosa", dot: "#FCE7F3" },
  { value: "bg-orange-100", label: "Laranja", dot: "#FED7AA" },
  { value: "bg-purple-100", label: "Roxo", dot: "#E9D5FF" },
  { value: "bg-gray-800", label: "Escura", dot: "#1F2937" },
];

// ── Helpers ────────────────────────────────────────────
export function getFontClass(_f: string) { return "font-body"; }
export function getSizeClass(_f: string) { return "text-sm"; }

function serializeBlocks(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

function deserializeBlocks(raw: string): ContentBlock[] {
  if (!raw) return [{ type: "text", content: "" }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* legacy plain text */ }
  return [{ type: "text", content: raw }];
}

function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content || "")
    .join("\n");
}

function getTheme(color: string) {
  return COLOR_THEMES[color] || COLOR_THEMES["bg-yellow-100"];
}

// ── Props ──────────────────────────────────────────────
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
    fontSize: string,
    status: "rascunho" | "publicada",
  ) => void;
  onSchedule?: (title: string, content: string, date: string, time: string) => void;
}

// ── Component ──────────────────────────────────────────
export function NoteEditor({ open, onOpenChange, editingNote, onSave, onSchedule }: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ type: "text", content: "" }]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  // Undo/redo
  const [history, setHistory] = useState<ContentBlock[][]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const historyTimer = useRef<ReturnType<typeof setTimeout>>();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const ocrCameraRef = useRef<HTMLInputElement>(null);
  const focusedBlockRef = useRef<number>(0);
  const activeFieldRef = useRef<"title" | "content">("content");

  // Voice dictation
  const handleVoiceResult = useCallback((text: string) => {
    if (activeFieldRef.current === "title") {
      setTitle((prev) => (prev + " " + text).trim());
    } else {
      const idx = focusedBlockRef.current;
      setBlocks((prev) => {
        const next = [...prev];
        if (next[idx]?.type === "text") {
          next[idx] = { ...next[idx], content: ((next[idx].content || "") + " " + text).trim() };
        }
        return next;
      });
    }
  }, []);

  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useSpeechRecognition(handleVoiceResult);

  // ── Sync on open ─────────────────────────────────────
  const lastNoteId = useRef<string | null>(null);
  if (open) {
    const noteId = editingNote?.id ?? "__new__";
    if (lastNoteId.current !== noteId) {
      lastNoteId.current = noteId;
      if (editingNote) {
        setTitle(editingNote.title);
        const parsed = deserializeBlocks(editingNote.content);
        setBlocks(parsed);
        setSelectedColor(editingNote.color);
      } else {
        setTitle("");
        setBlocks([{ type: "text", content: "" }]);
        setSelectedColor(NOTE_COLORS[0].value);
      }
      setHistory([]);
      setHistoryIdx(-1);
    }
  } else {
    if (lastNoteId.current !== null) lastNoteId.current = null;
  }

  const theme = getTheme(selectedColor);
  const isDark = selectedColor === "bg-gray-800";
  const textColor = isDark ? "#E0E0E0" : "#1A1A2E";
  const placeholderColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";

  // ── Undo / Redo ──────────────────────────────────────
  const pushHistory = useCallback((newBlocks: ContentBlock[]) => {
    setHistory((h) => {
      const trimmed = h.slice(0, historyIdx + 1);
      const limited = [...trimmed, JSON.parse(JSON.stringify(newBlocks))].slice(-50);
      return limited;
    });
    setHistoryIdx((i) => Math.min(i + 1, 49));
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    if (prev) { setBlocks(JSON.parse(JSON.stringify(prev))); setHistoryIdx((i) => i - 1); }
  }, [historyIdx, history]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    if (next) { setBlocks(JSON.parse(JSON.stringify(next))); setHistoryIdx((i) => i + 1); }
  }, [historyIdx, history]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, undo, redo]);

  // ── Block operations ─────────────────────────────────
  const updateTextBlock = (index: number, text: string) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content: text };
      return next;
    });
    clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setBlocks((current) => { pushHistory(current); return current; });
    }, 500);
  };

  const insertImageAtBlock = (file: File) => {
    const url = URL.createObjectURL(file);
    const idx = focusedBlockRef.current;
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, { type: "image", url }, { type: "text", content: "" });
      pushHistory(next);
      return next;
    });
  };

  const removeImageBlock = (index: number) => {
    setBlocks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const merged: ContentBlock[] = [];
      for (const block of next) {
        const last = merged[merged.length - 1];
        if (block.type === "text" && last?.type === "text") {
          last.content = (last.content || "") + "\n" + (block.content || "");
        } else {
          merged.push({ ...block });
        }
      }
      if (merged.length === 0) merged.push({ type: "text", content: "" });
      pushHistory(merged);
      return merged;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) insertImageAtBlock(file);
    e.target.value = "";
  };

  // ── Checklist operations ─────────────────────────────
  const addChecklist = () => {
    const idx = focusedBlockRef.current;
    const newItem: ChecklistItem = { id: crypto.randomUUID(), text: "", checked: false };
    setBlocks((prev) => {
      const next = [...prev];
      // If current block is already a checklist, add item to it
      if (next[idx]?.type === "checklist" && next[idx].items) {
        next[idx] = { ...next[idx], items: [...next[idx].items!, newItem] };
      } else {
        // Insert new checklist block after current
        next.splice(idx + 1, 0, { type: "checklist", items: [newItem] });
      }
      pushHistory(next);
      return next;
    });
  };

  const updateChecklistItem = (blockIdx: number, itemId: string, updates: Partial<ChecklistItem>) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "checklist" && next[blockIdx].items) {
        next[blockIdx] = {
          ...next[blockIdx],
          items: next[blockIdx].items!.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        };
      }
      return next;
    });
    clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setBlocks((current) => { pushHistory(current); return current; });
    }, 500);
  };

  const removeChecklistItem = (blockIdx: number, itemId: string) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "checklist" && next[blockIdx].items) {
        const remaining = next[blockIdx].items!.filter((item) => item.id !== itemId);
        if (remaining.length === 0) {
          // Remove the whole checklist block
          next.splice(blockIdx, 1);
          if (next.length === 0) next.push({ type: "text", content: "" });
        } else {
          next[blockIdx] = { ...next[blockIdx], items: remaining };
        }
      }
      pushHistory(next);
      return next;
    });
  };

  const addChecklistItemAfter = (blockIdx: number) => {
    const newItem: ChecklistItem = { id: crypto.randomUUID(), text: "", checked: false };
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "checklist" && next[blockIdx].items) {
        next[blockIdx] = { ...next[blockIdx], items: [...next[blockIdx].items!, newItem] };
      }
      return next;
    });
  };

  // ── OCR ──────────────────────────────────────────────
  const handleOcrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setShowOcrModal(false);
    setOcrLoading(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por");
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      if (text.trim()) {
        const idx = focusedBlockRef.current;
        setBlocks((prev) => {
          const next = [...prev];
          if (next[idx]?.type === "text") {
            next[idx] = { ...next[idx], content: (next[idx].content || "") + text.trim() };
          } else {
            next.splice(idx + 1, 0, { type: "text", content: text.trim() });
          }
          return next;
        });
        toast({ title: "Texto extraído e inserido!", description: `${text.trim().split(/\s+/).length} palavras extraídas.` });
      } else {
        toast({ title: "Nenhum texto encontrado", description: "Não foi possível extrair texto desta imagem." });
      }
    } catch {
      toast({ title: "Erro no OCR", description: "Não foi possível processar a imagem." });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCopy = () => {
    const text = `${title}\n\n${blocksToPlainText(blocks)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Nota copiada com sucesso!", description: "Conteúdo copiado para a área de transferência." });
    setTimeout(() => setCopied(false), 2000);
  };

  // ── QR Code Scanner ─────────────────────────────────
  const handleStartQrScanner = async () => {
    setShowQrScanner(true);
    setQrLoading(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 300));
      const scanner = new Html5Qrcode("qr-reader");
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const idx = focusedBlockRef.current;
          setBlocks((prev) => {
            const next = [...prev];
            if (next[idx]?.type === "text") {
              next[idx] = { ...next[idx], content: (next[idx].content || "") + decodedText };
            } else {
              next.splice(idx + 1, 0, { type: "text", content: decodedText });
            }
            return next;
          });
          toast({ title: "QR Code lido!", description: decodedText.length > 60 ? decodedText.slice(0, 60) + "…" : decodedText });
          scanner.stop().catch(() => {});
          setShowQrScanner(false);
        },
        () => {}
      );
      setQrLoading(false);
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao abrir câmera", description: "Não foi possível acessar a câmera para leitura de QR Code." });
      setShowQrScanner(false);
      setQrLoading(false);
    }
  };

  const handleStopQrScanner = async () => {
    try {
      const el = document.getElementById("qr-reader");
      if (el) el.innerHTML = "";
    } catch {}
    setShowQrScanner(false);
  };

  // ── Save handlers ────────────────────────────────────
  const doSave = (status: "rascunho" | "publicada") => {
    if (status === "publicada" && !title.trim() && !blocksToPlainText(blocks).trim()) return;
    const serialized = serializeBlocks(blocks);
    const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
    onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
    onOpenChange(false);
    if (status === "rascunho") {
      toast({ title: "Rascunho salvo ✓" });
    } else {
      toast({ title: editingNote ? "Nota salva ✓" : "Nota criada ✓" });
    }
  };

  const handleSaveDraft = () => doSave("rascunho");
  const handleSavePublish = () => doSave("publicada");

  // Auto-save on close
  const handleClose = () => {
    // Stop voice if active
    if (isListening) toggleVoice();
    
    const hasContent = title.trim() || blocksToPlainText(blocks).trim();
    if (hasContent) {
      const serialized = serializeBlocks(blocks);
      const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
      const status = editingNote?.status || "rascunho";
      onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);

      if (!navigator.onLine) {
        toast({ title: "Salvo localmente", description: "Sincronizando quando houver conexão..." });
      }
    }
    onOpenChange(false);
  };

  const plainText = blocksToPlainText(blocks);
  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = plainText.length;

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !w-screen !max-w-none !max-h-none !rounded-none !shadow-none !border-0 !p-0 !gap-0 !bg-transparent z-50"
        style={{ height: "100dvh" }}
        aria-describedby={undefined}
      >
        <VisuallyHidden><DialogTitle>Editor de Nota</DialogTitle></VisuallyHidden>
        {/* ── NOTEPAD CONTAINER ── */}
        <div
          className="flex flex-col"
          style={{
            height: "100dvh",
            background: theme.bg,
            transition: "background 0.3s ease",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >

          {/* ── HEADER ── */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 shrink-0"
            style={{ background: theme.headerBg, transition: "background 0.3s ease" }}
          >
            <button
              onClick={handleSavePublish}
              disabled={!title.trim() && !blocksToPlainText(blocks).trim()}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors disabled:opacity-40"
              title="Salvar"
            >
              <Check size={20} style={{ color: textColor }} />
            </button>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => { activeFieldRef.current = "title"; }}
              placeholder="Título da nota..."
              className="flex-1 bg-white/90 rounded-lg px-3 py-1.5 text-sm font-semibold placeholder:text-gray-400 outline-none border-0 shadow-sm"
              style={{ color: "#1A1A2E" }}
            />

            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-7 h-7 rounded-md border-2 border-white/60 shadow-sm shrink-0 transition-transform hover:scale-110"
              style={{ background: NOTE_COLORS.find((c) => c.value === selectedColor)?.dot || "#FEF9C3" }}
              title="Cor da nota"
            />

            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors"
              title="Fechar"
            >
              <X size={20} style={{ color: textColor }} />
            </button>
          </div>

          {/* Color picker dropdown */}
          {showColorPicker && (
            <div className="flex gap-2 px-4 py-2 justify-center shrink-0" style={{ background: theme.headerBg, transition: "background 0.3s ease" }}>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => { setSelectedColor(c.value); setShowColorPicker(false); }}
                  className={cn(
                    "w-9 h-9 rounded-full border-2 transition-all duration-200 shrink-0",
                    selectedColor === c.value
                      ? "border-gray-800 scale-110 shadow-md"
                      : "border-white/60 hover:scale-105"
                  )}
                  style={{ background: c.dot }}
                  title={c.label}
                />
              ))}
            </div>
          )}

          {/* ── Sub-header ── */}
          <div className="flex items-center justify-between px-4 py-1.5 text-[11px] shrink-0" style={{ color: theme.textMuted, transition: "color 0.3s ease" }}>
            <span className="font-medium">
              {editingNote ? "Editando" : "Nova nota"}
              {isListening && (
                <span className="ml-2 text-red-500 font-semibold animate-pulse">
                  🎤 {activeFieldRef.current === "title" ? "Ditando no título" : "Ditando no conteúdo"}
                </span>
              )}
            </span>
            <span>
              {format(editingNote?.createdAt ?? new Date(), "d 'de' MMMM, HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* ── LINED PAPER BODY ── */}
          <div
            className="flex-1 overflow-y-auto px-4 min-h-0"
            style={{
              background: `repeating-linear-gradient(to bottom, transparent, transparent 27px, ${theme.lines} 28px)`,
              backgroundPosition: "0 0",
              transition: "background 0.3s ease",
            }}
          >
            <div className="py-2">
              {blocks.map((block, idx) => {
                if (block.type === "text") {
                  return (
                    <textarea
                      key={`text-${idx}`}
                      value={block.content || ""}
                      onChange={(e) => {
                        updateTextBlock(idx, e.target.value);
                        autoResize(e.target);
                      }}
                      onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                      placeholder={idx === 0 && blocks.length === 1 ? "Comece a escrever sua nota..." : ""}
                      className="w-full bg-transparent border-0 outline-none resize-none text-sm"
                      style={{
                        lineHeight: "28px",
                        minHeight: "28px",
                        overflow: "hidden",
                        color: textColor,
                        "--placeholder-color": placeholderColor,
                      } as React.CSSProperties}
                      ref={(el) => { if (el) autoResize(el); }}
                    />
                  );
                }

                if (block.type === "checklist" && block.items) {
                  return (
                    <div key={`checklist-${idx}`} className="my-2 space-y-1">
                      {block.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 group/check">
                          <button
                            onClick={() => updateChecklistItem(idx, item.id, { checked: !item.checked })}
                            className="shrink-0 transition-colors"
                            style={{ color: item.checked ? "#4CAF50" : (isDark ? "#888" : "#BDBDBD") }}
                          >
                            {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          <input
                            value={item.text}
                            onChange={(e) => updateChecklistItem(idx, item.id, { text: e.target.value })}
                            onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addChecklistItemAfter(idx);
                              }
                            }}
                            placeholder="Item da lista..."
                            className="flex-1 bg-transparent border-0 outline-none text-sm"
                            style={{
                              lineHeight: "28px",
                              color: item.checked ? "#999" : textColor,
                              textDecoration: item.checked ? "line-through" : "none",
                              opacity: item.checked ? 0.7 : 1,
                            }}
                          />
                          <button
                            onClick={() => removeChecklistItem(idx, item.id)}
                            className="shrink-0 opacity-0 group-hover/check:opacity-100 transition-opacity p-1 rounded hover:bg-black/5"
                            style={{ color: "#BDBDBD" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addChecklistItemAfter(idx)}
                        className="flex items-center gap-1 text-xs ml-7 py-1 hover:opacity-80 transition-opacity"
                        style={{ color: theme.textMuted }}
                      >
                        + Adicionar item
                      </button>
                    </div>
                  );
                }

                if (block.type === "image" && block.url) {
                  return (
                    <div key={`img-${idx}`} className="relative group/img my-2" style={{ maxWidth: "100%" }}>
                      <img
                        src={block.url}
                        alt=""
                        className="shadow-md"
                        style={{ maxWidth: "calc(100% - 24px)", maxHeight: "250px", objectFit: "contain", borderRadius: "8px", margin: "0 12px" }}
                      />
                      <button
                        onClick={() => removeImageBlock(idx)}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 hover:bg-black/70"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Word/char counter */}
            <div className="flex justify-end gap-3 pb-2">
              <span className="text-[10px]" style={{ color: theme.textMuted }}>
                {wordCount} {wordCount === 1 ? "palavra" : "palavras"}
              </span>
              <span className="text-[10px]" style={{ color: theme.textMuted }}>
                {charCount} caracteres
              </span>
            </div>
          </div>

          {/* ── TOOLBAR (2 rows for mobile) ── */}
          <div
            className="px-3 py-1.5 border-t shrink-0"
            style={{ borderColor: theme.lines, background: theme.toolbarBg, transition: "background 0.3s ease, border-color 0.3s ease" }}
          >
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrImage} />
            <input ref={ocrFileRef} type="file" accept="image/*" className="hidden" onChange={handleOcrImage} />

            {/* Single row with horizontal scroll */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5" style={{ scrollbarWidth: "none" }}>
              <button onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                <Camera size={14} /> Câmera
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                <ImagePlus size={14} /> Galeria
              </button>
              <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} Copiar
              </button>
              <button onClick={() => setShowOcrModal(true)} disabled={ocrLoading} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                {ocrLoading ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />} OCR
              </button>
              <button onClick={handleStartQrScanner} disabled={qrLoading} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                {qrLoading ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} QR
              </button>
              <button onClick={addChecklist} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0" style={{ color: theme.textMuted }}>
                <ListChecks size={14} /> Lista
              </button>
              {onSchedule && (
                <button
                  onClick={() => { setScheduleDate(new Date().toISOString().slice(0, 10)); setScheduleTime("09:00"); setShowScheduleDialog(true); }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap hover:bg-black/5 transition-colors shrink-0"
                  style={{ color: theme.textMuted }}
                >
                  <CalendarPlus size={14} /> Agendar
                </button>
              )}
              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all shrink-0"
                  style={{ color: isListening ? "#E53935" : theme.textMuted, background: isListening ? "rgba(229,57,53,0.1)" : "transparent" }}
                >
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />} Voz
                </button>
              )}
              <div className="w-px h-4 shrink-0" style={{ background: theme.lines }} />
              <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded-lg hover:bg-black/5 transition-all shrink-0" style={{ color: canUndo ? "#555" : "#BDBDBD", opacity: canUndo ? 1 : 0.4 }}>
                <Undo2 size={14} />
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded-lg hover:bg-black/5 transition-all shrink-0" style={{ color: canRedo ? "#555" : "#BDBDBD", opacity: canRedo ? 1 : 0.4 }}>
                <Redo2 size={14} />
              </button>
            </div>

            {/* Schedule Dialog */}
            {showScheduleDialog && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                <div className="rounded-2xl p-5 w-[90%] max-w-sm space-y-4" style={{ background: "#FFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "#1A1A2E" }}>
                    <CalendarPlus size={18} /> Agendar na Agenda
                  </h3>
                  <p className="text-xs" style={{ color: "#9E9E9E" }}>
                    "{title || "Nota sem título"}"
                  </p>
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "#666" }}>Data</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:ring-2 focus:ring-blue-200"
                      style={{ borderColor: "#E0E0E0", color: "#1A1A2E" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "#666" }}>Hora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:ring-2 focus:ring-blue-200"
                      style={{ borderColor: "#E0E0E0", color: "#1A1A2E" }}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setShowScheduleDialog(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ background: "#F5F5F5", color: "#666" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (scheduleDate && onSchedule) {
                          onSchedule(title, blocksToPlainText(blocks), scheduleDate, scheduleTime);
                          toast({ title: "📅 Agendado!", description: `${scheduleDate} às ${scheduleTime}` });
                          setShowScheduleDialog(false);
                        }
                      }}
                      disabled={!scheduleDate}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40"
                      style={{ background: "#1A1A2E" }}
                    >
                      Agendar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── FOOTER BUTTONS ── */}
          <div
            className="flex gap-3 px-4 py-1.5 shrink-0 justify-center"
            style={{
              background: theme.toolbarBg,
              borderTop: `1px solid ${theme.lines}`,
              paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
            }}
          >
            <button
              onClick={handleSaveDraft}
              className="px-5 py-1.5 rounded-full text-[13px] font-semibold border transition-all duration-200 hover:bg-black/5"
              style={{ borderColor: theme.borderAccent, color: theme.textMuted }}
            >
              Rascunho
            </button>
            <button
              onClick={handleSavePublish}
              disabled={!title.trim() && !blocksToPlainText(blocks).trim()}
              className="px-5 py-1.5 rounded-full text-[13px] font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
              style={{ background: "#2D9E7F" }}
            >
              {editingNote ? "Salvar" : "Criar nota"}
            </button>
          </div>
        </div>

        {/* ── OCR MODAL ── */}
        {showOcrModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl p-6 mx-4 shadow-xl max-w-xs w-full">
              <h3 className="text-base font-semibold text-gray-800 mb-1">Extrair texto (OCR)</h3>
              <p className="text-xs text-gray-500 mb-4">De onde deseja extrair o texto?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => ocrCameraRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all"
                >
                  <Camera size={24} className="text-gray-600" />
                  <span className="text-xs font-medium text-gray-700">Câmera</span>
                </button>
                <button
                  onClick={() => ocrFileRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all"
                >
                  <ImagePlus size={24} className="text-gray-600" />
                  <span className="text-xs font-medium text-gray-700">Galeria</span>
                </button>
              </div>
              <button
                onClick={() => setShowOcrModal(false)}
                className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* QR Scanner Modal */}
        {showQrScanner && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
            <div className="bg-white rounded-2xl p-4 mx-4 shadow-xl max-w-sm w-full">
              <h3 className="text-base font-semibold text-gray-800 mb-3 text-center">Leitor de QR Code</h3>
              <div id="qr-reader" className="w-full rounded-lg overflow-hidden" style={{ minHeight: 280 }} />
              <button
                onClick={handleStopQrScanner}
                className="w-full mt-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors border rounded-xl"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* OCR Loading overlay */}
        {ocrLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/30 gap-3">
            <Loader2 size={32} className="animate-spin text-white" />
            <p className="text-white text-sm font-medium">Extraindo texto da imagem...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
