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
  Pencil,
  Share2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
// VisuallyHidden replaced with sr-only span for compatibility
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

// Detect mobile browser
const isMobileBrowser = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Sanitize pasted text on mobile — strip HTML, invisible chars, incompatible line breaks
function handleMobilePaste(e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (!isMobileBrowser()) return; // Don't interfere on desktop
  const html = e.clipboardData.getData("text/html");
  const plain = e.clipboardData.getData("text/plain");
  // Only intercept if there's HTML or suspicious content
  if (!html && !plain) return;
  e.preventDefault();
  // Clean: strip HTML tags, normalize whitespace, remove zero-width chars
  let cleaned = (html ? html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "") : plain)
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, " ") // zero-width & nbsp
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/ {3,}/g, "  ")
    .trim();
  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = cleaned;
  cleaned = textarea.value;
  // Insert at cursor position
  const target = e.currentTarget;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const before = target.value.substring(0, start);
  const after = target.value.substring(end);
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(target, before + cleaned + after);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    // Set cursor position after pasted text
    const newPos = start + cleaned.length;
    target.setSelectionRange(newPos, newPos);
  }
}

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
  readOnly?: boolean;
  onSetReadOnly?: (readOnly: boolean) => void;
  initialSharedData?: { title: string; content: string } | null;
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
export function NoteEditor({ open, onOpenChange, editingNote, readOnly = false, onSetReadOnly, initialSharedData, onSave, onSchedule }: NoteEditorProps) {
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
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  // Snapshot of content when entering edit mode (for cancel)
  const snapshotRef = useRef<{ title: string; blocks: ContentBlock[]; color: string } | null>(null);

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

  // ── Auto-save draft to localStorage ───────────────────
  const DRAFT_KEY = "note_editor_draft";

  const saveDraftToLocal = useCallback(() => {
    if (!open) return;
    const hasContent = title.trim() || blocks.some(b => (b.type === "text" && b.content?.trim()) || b.type === "image" || b.type === "checklist");
    if (!hasContent) return;
    const draft = {
      noteId: editingNote?.id || null,
      title,
      blocks,
      color: selectedColor,
      timestamp: Date.now(),
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [open, title, blocks, selectedColor, editingNote]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  // Auto-save to localStorage every 2 seconds
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(saveDraftToLocal, 2000);
    return () => clearInterval(interval);
  }, [open, saveDraftToLocal]);

  // Auto-sync to cloud every 10 seconds
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      const hasContent = title.trim() || blocksToPlainText(blocks).trim();
      if (!hasContent) return;
      const serialized = serializeBlocks(blocks);
      const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
      const status = editingNote?.status || "rascunho";
      onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
    }, 10000);
    return () => clearInterval(interval);
  }, [open, title, blocks, selectedColor, editingNote, onSave]);

  // Save immediately on visibility change (minimize, tab switch) and beforeunload
  useEffect(() => {
    if (!open) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        saveDraftToLocal();
        // Also trigger cloud save
        const hasContent = title.trim() || blocksToPlainText(blocks).trim();
        if (hasContent) {
          const serialized = serializeBlocks(blocks);
          const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
          const status = editingNote?.status || "rascunho";
          onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
        }
      }
    };
    const handleBeforeUnload = () => {
      saveDraftToLocal();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [open, saveDraftToLocal, title, blocks, selectedColor, editingNote, onSave]);

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

  // ── Sync on open (with draft recovery) ────────────────
  const lastNoteId = useRef<string | null>(null);
  if (open) {
    const noteId = editingNote?.id ?? "__new__";
    if (lastNoteId.current !== noteId) {
      lastNoteId.current = noteId;
      let recovered = false;
      // Try to recover draft from localStorage
      if (!editingNote) {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw);
            // Only recover if draft is for a new note (no noteId) and less than 1 hour old
            if (!draft.noteId && Date.now() - draft.timestamp < 3600000) {
              setTitle(draft.title || "");
              setBlocks(draft.blocks || [{ type: "text", content: "" }]);
              setSelectedColor(draft.color || NOTE_COLORS[0].value);
              recovered = true;
            }
          }
        } catch {}
      } else {
        // For existing notes, check if there's a more recent draft
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw);
            if (draft.noteId === editingNote.id && Date.now() - draft.timestamp < 3600000) {
              setTitle(draft.title || "");
              setBlocks(draft.blocks || deserializeBlocks(editingNote.content));
              setSelectedColor(draft.color || editingNote.color);
              recovered = true;
            }
          }
        } catch {}
      }
      if (!recovered) {
        if (editingNote) {
          setTitle(editingNote.title);
          const parsed = deserializeBlocks(editingNote.content);
          setBlocks(parsed);
          setSelectedColor(editingNote.color);
        } else if (initialSharedData && (initialSharedData.title || initialSharedData.content)) {
          // Pre-fill from shared content received from another app
          setTitle(initialSharedData.title || "");
          setBlocks([{ type: "text", content: initialSharedData.content || "" }]);
          setSelectedColor(NOTE_COLORS[0].value);
        } else {
          setTitle("");
          setBlocks([{ type: "text", content: "" }]);
          setSelectedColor(NOTE_COLORS[0].value);
        }
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

  // Compress image before inserting (max 1200px, quality 0.7)
  const compressImage = (file: File, maxSize = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width;
          let h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
            else { w = Math.round((w * maxSize) / h); h = maxSize; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const insertImageAtBlock = async (file: File) => {
    const url = await compressImage(file);
    const idx = focusedBlockRef.current;
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, { type: "image", url }, { type: "text", content: "" });
      pushHistory(next);
      return next;
    });
    toast({ title: "📷 Imagem adicionada", description: "Imagem comprimida e inserida na nota." });
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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Support multiple images
    for (let i = 0; i < files.length; i++) {
      await insertImageAtBlock(files[i]);
    }
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

  // ── Edit mode helpers ─────────────────────────────────
  const enterEditMode = useCallback(() => {
    snapshotRef.current = { title, blocks: JSON.parse(JSON.stringify(blocks)), color: selectedColor };
    onSetReadOnly?.(false);
  }, [title, blocks, selectedColor, onSetReadOnly]);

  const hasUnsavedChanges = useCallback(() => {
    if (!snapshotRef.current) return false;
    return (
      title !== snapshotRef.current.title ||
      selectedColor !== snapshotRef.current.color ||
      JSON.stringify(blocks) !== JSON.stringify(snapshotRef.current.blocks)
    );
  }, [title, blocks, selectedColor]);

  const cancelEdit = useCallback(() => {
    if (snapshotRef.current) {
      setTitle(snapshotRef.current.title);
      setBlocks(JSON.parse(JSON.stringify(snapshotRef.current.blocks)));
      setSelectedColor(snapshotRef.current.color);
      snapshotRef.current = null;
    }
    onSetReadOnly?.(true);
  }, [onSetReadOnly]);

  // ── Save handlers ────────────────────────────────────
  const doSave = (status: "rascunho" | "publicada") => {
    if (status === "publicada" && !title.trim() && !blocksToPlainText(blocks).trim()) return;
    const serialized = serializeBlocks(blocks);
    const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
    onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
    clearDraft();
    snapshotRef.current = null;
    onSetReadOnly?.(true);
    if (status === "rascunho") {
      toast({ title: "Rascunho salvo ✓" });
    } else {
      toast({ title: editingNote ? "Nota salva ✓" : "Nota criada ✓" });
    }
  };

  const doSaveAndClose = (status: "rascunho" | "publicada") => {
    if (status === "publicada" && !title.trim() && !blocksToPlainText(blocks).trim()) return;
    const serialized = serializeBlocks(blocks);
    const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
    onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
    clearDraft();
    snapshotRef.current = null;
    onOpenChange(false);
    if (status === "rascunho") {
      toast({ title: "Rascunho salvo ✓" });
    } else {
      toast({ title: editingNote ? "Nota salva ✓" : "Nota criada ✓" });
    }
  };

  const handleSaveDraft = () => doSaveAndClose("rascunho");
  const handleSavePublish = () => {
    if (editingNote && readOnly) {
      // In view mode, save just returns to view
      doSave("publicada");
    } else {
      doSaveAndClose("publicada");
    }
  };
  
  const handleSaveAndBackToView = () => {
    doSave("publicada");
  };

  // Close handler with unsaved changes check
  const handleClose = () => {
    if (isListening) toggleVoice();
    
    if (!readOnly && editingNote && hasUnsavedChanges()) {
      setShowUnsavedPrompt(true);
      return;
    }
    
    // In read-only or new note, just close
    const hasContent = title.trim() || blocksToPlainText(blocks).trim();
    if (hasContent && !readOnly) {
      const serialized = serializeBlocks(blocks);
      const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
      const status = editingNote?.status || "rascunho";
      onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);

      if (!navigator.onLine) {
        toast({ title: "Salvo localmente", description: "Sincronizando quando houver conexão..." });
      }
    }
    clearDraft();
    snapshotRef.current = null;
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
        <DialogTitle className="sr-only">Editor de Nota</DialogTitle>
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

          {/* ── EDIT MODE INDICATOR BAR ── */}
          {!readOnly && editingNote && (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 shrink-0" style={{ background: "#2D9E7F", transition: "background 0.3s ease" }}>
              <Pencil size={13} style={{ color: "#FFF" }} />
              <span className="text-[12px] font-bold text-white">Editando...</span>
            </div>
          )}

          {/* ── HEADER ── */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 shrink-0"
            style={{ background: theme.headerBg, transition: "background 0.3s ease" }}
          >
            {/* ← Voltar (left close) */}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors"
              title="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            </button>

            <input
              value={title}
              onChange={(e) => !readOnly && setTitle(e.target.value)}
              onFocus={() => { activeFieldRef.current = "title"; }}
              onPaste={handleMobilePaste}
              readOnly={readOnly}
              placeholder="Título da nota..."
              className="flex-1 bg-white/90 rounded-lg px-3 py-2.5 text-base font-semibold placeholder:text-gray-400 outline-none border-0 shadow-sm"
              style={{ color: "#1A1A2E", fontSize: "17px" }}
            />

            {!readOnly && (
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-7 h-7 rounded-md border-2 border-white/60 shadow-sm shrink-0 transition-transform hover:scale-110"
                style={{ background: NOTE_COLORS.find((c) => c.value === selectedColor)?.dot || "#FEF9C3" }}
                title="Cor da nota"
              />
            )}

            {/* Share button (visible in view mode for existing notes) */}
            {readOnly && editingNote && (
              <button
                onClick={async () => {
                  const plainText = blocksToPlainText(blocks);
                  const shareText = `${title}\n\n${plainText}`.trim();
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: title || "Nota", text: shareText });
                    } catch (err: any) {
                      if (err?.name !== "AbortError") {
                        toast({ title: "Erro ao compartilhar", description: "Não foi possível compartilhar a nota." });
                      }
                    }
                  } else {
                    try {
                      await navigator.clipboard.writeText(shareText);
                      toast({ title: "Copiado!", description: "Texto da nota copiado para a área de transferência." });
                    } catch {
                      toast({ title: "Erro", description: "Não foi possível copiar o texto." });
                    }
                  }
                }}
                className="p-2 rounded-lg hover:bg-black/10 transition-all"
                title="Compartilhar nota"
                style={{ color: textColor }}
              >
                <Share2 size={20} />
              </button>
            )}

            {/* Pencil icon to enter edit mode (only in view mode for existing notes) */}
            {readOnly && editingNote && (
              <button
                onClick={enterEditMode}
                className="p-2 rounded-lg hover:bg-black/10 transition-all"
                title="Editar nota"
                style={{ color: textColor }}
              >
                <Pencil size={20} />
              </button>
            )}

            {/* ✕ Fechar (right close) */}
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
              {readOnly ? "👁️ Visualização" : (editingNote ? "✏️ Editando" : "Nova nota")}
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
              background: `repeating-linear-gradient(to bottom, transparent, transparent 31px, ${theme.lines} 32px)`,
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
                        if (readOnly) return;
                        updateTextBlock(idx, e.target.value);
                        autoResize(e.target);
                      }}
                      onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                      onPaste={handleMobilePaste}
                      readOnly={readOnly}
                      placeholder={idx === 0 && blocks.length === 1 ? "Comece a escrever sua nota..." : ""}
                      className="w-full bg-transparent border-0 outline-none resize-none text-base"
                      style={{
                        lineHeight: "32px",
                        minHeight: "32px",
                        fontSize: "16px",
                        overflow: "hidden",
                        color: textColor,
                        "--placeholder-color": placeholderColor,
                      } as React.CSSProperties}
                      ref={(el) => { if (el) autoResize(el); }}
                    />
                  );
                }

                if (block.type === "checklist" && block.items) {
                  const total = block.items.length;
                  const checked = block.items.filter((i) => i.checked).length;
                  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;
                  return (
                    <div key={`checklist-${idx}`} className="my-2">
                      {/* Progress bar */}
                      {total > 0 && (
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: isDark ? "#444" : "#E0E0E0" }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${progress}%`, background: progress === 100 ? "#4CAF50" : "#2D9E7F" }}
                            />
                          </div>
                          <span className="text-[10px] font-bold shrink-0" style={{ color: progress === 100 ? "#4CAF50" : theme.textMuted }}>
                            {checked}/{total} {progress === 100 && "✓"}
                          </span>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {block.items.map((item, itemIdx) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 group/check rounded-lg px-1 py-0.5 transition-colors"
                            style={{ background: item.checked ? (isDark ? "rgba(76,175,80,0.1)" : "rgba(76,175,80,0.05)") : "transparent" }}
                            draggable={!readOnly}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("checklist-drag", JSON.stringify({ blockIdx: idx, itemIdx }));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                            onDrop={(e) => {
                              e.preventDefault();
                              try {
                                const data = JSON.parse(e.dataTransfer.getData("checklist-drag"));
                                if (data.blockIdx === idx && data.itemIdx !== itemIdx) {
                                  setBlocks((prev) => {
                                    const next = [...prev];
                                    const items = [...(next[idx].items || [])];
                                    const [moved] = items.splice(data.itemIdx, 1);
                                    items.splice(itemIdx, 0, moved);
                                    next[idx] = { ...next[idx], items };
                                    pushHistory(next);
                                    return next;
                                  });
                                }
                              } catch {}
                            }}
                          >
                            {/* Drag handle */}
                            {!readOnly && (
                              <span className="cursor-grab opacity-0 group-hover/check:opacity-40 transition-opacity text-xs select-none" style={{ color: theme.textMuted }}>⠿</span>
                            )}
                            <button
                              onClick={() => updateChecklistItem(idx, item.id, { checked: !item.checked })}
                              className="shrink-0 transition-all duration-200"
                              style={{ color: item.checked ? "#4CAF50" : (isDark ? "#888" : "#BDBDBD") }}
                            >
                              {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                            <input
                              value={item.text}
                              onChange={(e) => !readOnly && updateChecklistItem(idx, item.id, { text: e.target.value })}
                              onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                              onPaste={handleMobilePaste}
                              readOnly={readOnly}
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
                            {!readOnly && (
                              <button
                                onClick={() => removeChecklistItem(idx, item.id)}
                                className="shrink-0 opacity-0 group-hover/check:opacity-100 transition-opacity p-1 rounded hover:bg-black/5"
                                style={{ color: "#BDBDBD" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => addChecklistItemAfter(idx)}
                          className="flex items-center gap-1 text-xs ml-7 py-1 hover:opacity-80 transition-opacity"
                          style={{ color: theme.textMuted }}
                        >
                          + Adicionar item
                        </button>
                      )}
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
          {!readOnly && (
          <div
            className="px-3 py-1.5 border-t shrink-0"
            style={{ borderColor: theme.lines, background: theme.toolbarBg, transition: "background 0.3s ease, border-color 0.3s ease" }}
          >
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrImage} />
            <input ref={ocrFileRef} type="file" accept="image/*" className="hidden" onChange={handleOcrImage} />

            {/* Row 1 */}
            <div className="flex items-center justify-center gap-0.5 flex-wrap">
              <button onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                <Camera size={13} /> Câmera
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                <ImagePlus size={13} /> Galeria
              </button>
              <button onClick={handleCopy} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />} Copiar
              </button>
              <button onClick={() => setShowOcrModal(true)} disabled={ocrLoading} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                {ocrLoading ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />} OCR
              </button>
              <button onClick={handleStartQrScanner} disabled={qrLoading} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} />} QR
              </button>
            </div>
            {/* Row 2 */}
            <div className="flex items-center justify-center gap-0.5 flex-wrap mt-0.5">
              <button onClick={addChecklist} className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors" style={{ color: theme.textMuted }}>
                <ListChecks size={13} /> Lista
              </button>
              {onSchedule && (
                <button
                  onClick={() => { setScheduleDate(new Date().toISOString().slice(0, 10)); setScheduleTime("09:00"); setShowScheduleDialog(true); }}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 transition-colors"
                  style={{ color: theme.textMuted }}
                >
                  <CalendarPlus size={13} /> Agendar
                </button>
              )}
              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{ color: isListening ? "#E53935" : theme.textMuted, background: isListening ? "rgba(229,57,53,0.1)" : "transparent" }}
                >
                  {isListening ? <MicOff size={13} /> : <Mic size={13} />} Voz
                </button>
              )}
              <div className="w-px h-3.5 mx-0.5" style={{ background: theme.lines }} />
              <button onClick={undo} disabled={!canUndo} className="p-1 rounded-md hover:bg-black/5 transition-all" style={{ color: canUndo ? "#555" : "#BDBDBD", opacity: canUndo ? 1 : 0.4 }}>
                <Undo2 size={13} />
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-1 rounded-md hover:bg-black/5 transition-all" style={{ color: canRedo ? "#555" : "#BDBDBD", opacity: canRedo ? 1 : 0.4 }}>
                <Redo2 size={13} />
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
          )}

          {/* ── FOOTER BUTTONS ── */}
          {!readOnly ? (
            editingNote ? (
              /* Edit mode for existing note: Save + Cancel */
              <div
                className="flex gap-3 px-4 py-1.5 shrink-0 justify-center"
                style={{
                  background: theme.toolbarBg,
                  borderTop: `1px solid ${theme.lines}`,
                  paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
                }}
              >
                <button
                  onClick={cancelEdit}
                  className="px-5 py-1.5 rounded-full text-[13px] font-semibold border transition-all duration-200 hover:bg-black/5"
                  style={{ borderColor: theme.borderAccent, color: theme.textMuted }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAndBackToView}
                  disabled={!title.trim() && !blocksToPlainText(blocks).trim()}
                  className="px-5 py-1.5 rounded-full text-[13px] font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
                  style={{ background: "#2D9E7F" }}
                >
                  Salvar
                </button>
              </div>
            ) : (
              /* New note: Draft + Create */
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
                  onClick={() => doSaveAndClose("publicada")}
                  disabled={!title.trim() && !blocksToPlainText(blocks).trim()}
                  className="px-5 py-1.5 rounded-full text-[13px] font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
                  style={{ background: "#2D9E7F" }}
                >
                  Criar nota
                </button>
              </div>
            )
          ) : (
            <div
              className="flex gap-3 px-4 py-2.5 shrink-0 justify-center items-center"
              style={{
                background: theme.toolbarBg,
                borderTop: `1px solid ${theme.lines}`,
                paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
              }}
            >
              <span className="text-xs font-semibold" style={{ color: theme.textMuted }}>👁️ Modo visualização</span>
              {editingNote && (
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
                  style={{ background: "#2D9E7F" }}
                >
                  <Pencil size={13} /> Editar
                </button>
              )}
            </div>
          )}

          {/* ── UNSAVED CHANGES PROMPT ── */}
          {showUnsavedPrompt && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
              <div className="rounded-2xl p-5 w-[90%] max-w-xs space-y-4" style={{ background: "#FFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                <h3 className="text-base font-bold text-center" style={{ color: "#1A1A2E" }}>
                  Alterações não salvas
                </h3>
                <p className="text-sm text-center" style={{ color: "#666" }}>
                  Deseja salvar as alterações antes de sair?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setShowUnsavedPrompt(false);
                      const serialized = serializeBlocks(blocks);
                      const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
                      onSave(title, serialized, imageUrls, selectedColor, "default", "medium", editingNote?.status === "rascunho" ? "rascunho" : "publicada");
                      clearDraft();
                      snapshotRef.current = null;
                      onOpenChange(false);
                      toast({ title: "Nota salva ✓" });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                    style={{ background: "#2D9E7F" }}
                  >
                    Salvar e sair
                  </button>
                  <button
                    onClick={() => {
                      setShowUnsavedPrompt(false);
                      cancelEdit();
                      clearDraft();
                      snapshotRef.current = null;
                      onOpenChange(false);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: "#F5F5F5", color: "#E53935" }}
                  >
                    Descartar alterações
                  </button>
                  <button
                    onClick={() => setShowUnsavedPrompt(false)}
                    className="w-full text-center text-xs font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    style={{ color: "#9E9E9E" }}
                  >
                    Continuar editando
                  </button>
                </div>
              </div>
            </div>
          )}
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
