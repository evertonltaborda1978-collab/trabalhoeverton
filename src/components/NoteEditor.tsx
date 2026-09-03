import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Check, Plus, Trash2, ImagePlus, Camera, ScanSearch, ScanLine,
  ListChecks, Table2, Mic, MicOff, Palette, MoreHorizontal,
  Bold as BoldIcon, Undo2, Redo2, Volume2, VolumeX, Pencil,
  ZoomIn, ZoomOut, Copy, Share2, Loader2, Square, CheckSquare
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ImageAnnotator from "./ImageAnnotator"; // Ajuste o caminho se necessário

// ── Tipos e Cores ─────────────────────────────────────
export type BlockType = "text" | "image" | "checklist" | "table";

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TableItem {
  id: string;
  nome: string;
  valor: string;
  marcado: boolean;
}

export interface NoteBlock {
  type: BlockType;
  content?: string; // Para texto
  url?: string;     // Para imagem
  style?: { align?: "left" | "center" | "right" };
  items?: ChecklistItem[];       // Para checklist
  tableTitle?: string;           // Para tabela manual
  tableItems?: TableItem[];      // Para tabela manual
  somaTotalLabel?: string;       // Rótulo da soma total
}

const NOTE_COLORS = [
  { value: "default", dot: "#FFFFFF", label: "Branco" },
  { value: "yellow", dot: "#FEF3C7", label: "Amarelo" },
  { value: "green", dot: "#D1FAE5", label: "Verde" },
  { value: "blue", dot: "#DBEAFE", label: "Azul" },
  { value: "pink", dot: "#FCE7F3", label: "Rosa" },
  { value: "purple", dot: "#EDE9FE", label: "Roxo" },
];

const TEXT_COLORS = ["#1A1A2E", "#E53935", "#2E7D32", "#1565C0", "#7B1FA2", "#EF6C00"];

interface NoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingNote?: {
    id?: string;
    title?: string;
    content?: string;
    imageUrls?: string[];
    color?: string;
    status?: string;
  } | null;
  onSave: (
    title: string,
    content: string,
    imageUrls: string[],
    color: string,
    folder: string,
    priority: string,
    status: string
  ) => void;
  readOnly?: boolean;
}

// ── Funções Auxiliares ────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function parseBlocks(contentStr: string, imageUrls: string[] = []): NoteBlock[] {
  if (!contentStr) {
    const blocks: NoteBlock[] = [{ type: "text", content: "" }];
    imageUrls.forEach((url) => blocks.push({ type: "image", url }));
    return blocks;
  }
  try {
    const parsed = JSON.parse(contentStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  
  const blocks: NoteBlock[] = [{ type: "text", content: contentStr }];
  imageUrls.forEach((url) => blocks.push({ type: "image", url }));
  return blocks;
}

function serializeBlocks(blocks: NoteBlock[]): string {
  return JSON.stringify(blocks);
}

function blocksToPlainText(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return b.content || "";
      if (b.type === "checklist") return (b.items || []).map((i) => `[${i.checked ? "X" : " "}] ${i.text}`).join("\n");
      if (b.type === "table") return `${b.tableTitle || "Tabela"}\n` + (b.tableItems || []).map((i) => `- ${i.nome}: ${i.valor}`).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function avaliarExpressaoMatematica(expr: string): number {
  if (!expr) return 0;
  let limpo = expr.replace(/[^\d.,+\-*/()]/g, "").replace(",", ".");
  try {
    const func = new Function(`return ${limpo}`);
    const res = func();
    return typeof res === "number" && !isNaN(res) ? res : 0;
  } catch {
    return 0;
  }
}

function calcularTotalTabela(items: TableItem[]): number {
  return items.reduce((acc, item) => {
    if (!item.marcado) return acc;
    return acc + avaliarExpressaoMatematica(item.valor);
  }, 0);
}

function formatarMoedaBRL(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderTextWithLinks(text: string, textColor: string, fontSize: number) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2D9E7F", textDecoration: "underline", wordBreak: "break-all" }}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

class AnnotatorErrorBoundary extends React.Component<{ children: React.ReactNode; onCancel: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.error("Erro no ImageAnnotator:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000000cc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#FFF", padding: 20 }}>
          <p style={{ marginBottom: 16 }}>Não foi possível carregar o editor de imagem.</p>
          <button onClick={this.props.onCancel} style={{ background: "#2D9E7F", border: "none", padding: "8px 16px", borderRadius: 8, color: "#FFF", cursor: "pointer" }}>Fechar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
export default function NoteEditor({ open, onOpenChange, editingNote, onSave, readOnly = false }: NoteEditorProps) {
  const { toast } = useToast();

  const [title, setTitle] = useState(editingNote?.title || "");
  const [blocks, setBlocks] = useState<NoteBlock[]>(() => parseBlocks(editingNote?.content || "", editingNote?.imageUrls || []));
  const [selectedColor, setSelectedColor] = useState(editingNote?.color || "default");
  
  const [editorFontSize, setEditorFontSize] = useState<number>(16);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  // Histórico Undo/Redo
  const [history, setHistory] = useState<NoteBlock[][]>([blocks]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const historyTimer = useRef<any>(null);

  // Modais auxiliares
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewZoom, setViewZoom] = useState<number>(1);
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<{ type: "table" | "checklist"; blockIdx: number; itemId: string; label: string } | null>(null);

  // Estados de Voz / Fala
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceSupported, setVoiceSupported] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Referências DOM
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const richTextRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  
  const activeFieldRef = useRef<"title" | "content">("title");
  const focusedBlockRef = useRef<number>(0);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);

  const snapshotRef = useRef<{ title: string; color: string; blocks: NoteBlock[] } | null>(null);

  useEffect(() => {
    if (open) {
      const initTitle = editingNote?.title || "";
      const initBlocks = parseBlocks(editingNote?.content || "", editingNote?.imageUrls || []);
      const initColor = editingNote?.color || "default";
      setTitle(initTitle);
      setBlocks(initBlocks);
      setSelectedColor(initColor);
      setHistory([initBlocks]);
      setHistoryIdx(0);
      snapshotRef.current = { title: initTitle, color: initColor, blocks: initBlocks };
    }
  }, [open, editingNote]);

  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      setVoiceSupported(true);
    }
  }, []);

  const pushHistory = (newBlocks: NoteBlock[]) => {
    const newHist = history.slice(0, historyIdx + 1);
    newHist.push(JSON.parse(JSON.stringify(newBlocks)));
    setHistory(newHist);
    setHistoryIdx(newHist.length - 1);
  };

  const undo = () => {
    if (historyIdx > 0) {
      const prevIdx = historyIdx - 1;
      setHistoryIdx(prevIdx);
      setBlocks(JSON.parse(JSON.stringify(history[prevIdx])));
    }
  };

  const redo = () => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1;
      setHistoryIdx(nextIdx);
      setBlocks(JSON.parse(JSON.stringify(history[nextIdx])));
    }
  };

  const clearDraft = () => {};

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        if (url) {
          setBlocks((prev) => {
            const updated = [...prev, { type: "image" as BlockType, url }];
            pushHistory(updated);
            return updated;
          });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const updateImageBlock = (index: number, newUrl: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], url: newUrl };
      pushHistory(updated);
      return updated;
    });
  };

  const removeImageBlock = (index: number) => {
    setBlocks((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      pushHistory(updated);
      return updated;
    });
  };

  const addChecklist = () => {
    setBlocks((prev) => {
      const updated = [
        ...prev,
        {
          type: "checklist" as BlockType,
          items: [{ id: generateId(), text: "", checked: false }],
        },
      ];
      pushHistory(updated);
      return updated;
    });
  };

  const updateChecklistItem = (blockIdx: number, itemId: string, data: Partial<ChecklistItem>) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.items = (block.items || []).map((item) => (item.id === itemId ? { ...item, ...data } : item));
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const addChecklistItemAfter = (blockIdx: number) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.items = [...(block.items || []), { id: generateId(), text: "", checked: false }];
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const removeChecklistItem = (blockIdx: number, itemId: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.items = (block.items || []).filter((item) => item.id !== itemId);
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const addTable = () => {
    setBlocks((prev) => {
      const updated = [
        ...prev,
        {
          type: "table" as BlockType,
          tableTitle: "Nova Tabela",
          somaTotalLabel: "Soma Total",
          tableItems: [
            { id: generateId(), nome: "Item 1", valor: "100", marcado: true },
            { id: generateId(), nome: "Item 2", valor: "50", marcado: true },
          ],
        },
      ];
      pushHistory(updated);
      return updated;
    });
  };

  const updateTableTitle = (blockIdx: number, tableTitle: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      updated[blockIdx] = { ...updated[blockIdx], tableTitle };
      pushHistory(updated);
      return updated;
    });
  };

  const updateSomaTotalLabel = (somaTotalLabel: string) => {
    setBlocks((prev) => {
      const updated = prev.map((b) => (b.type === "table" ? { ...b, somaTotalLabel } : b));
      pushHistory(updated);
      return updated;
    });
  };

  const updateTableItem = (blockIdx: number, itemId: string, data: Partial<TableItem>) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.tableItems = (block.tableItems || []).map((item) => (item.id === itemId ? { ...item, ...data } : item));
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const addTableItemAfter = (blockIdx: number) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.tableItems = [...(block.tableItems || []), { id: generateId(), nome: "", valor: "", marcado: true }];
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const removeTableItem = (blockIdx: number, itemId: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const block = { ...updated[blockIdx] };
      block.tableItems = (block.tableItems || []).filter((item) => item.id !== itemId);
      updated[blockIdx] = block;
      pushHistory(updated);
      return updated;
    });
  };

  const updateTextBlockRich = (index: number) => {
    const el = richTextRefs.current[index];
    if (!el) return;
    const content = el.innerHTML;
    setBlocks((prev) => {
      const updated = [...prev];
      if (updated[index]) updated[index] = { ...updated[index], content };
      return updated;
    });
    clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setBlocks((current) => { pushHistory(current); return current; });
    }, 600);
  };

  const applyInlineFormat = (index: number, command: string, value: string = "") => {
    document.execCommand(command, false, value);
    updateTextBlockRich(index);
  };

  const splitBlockAtCursor = (index: number) => {
    const el = richTextRefs.current[index];
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.endContainer, range.endOffset);
    const textBefore = preRange.toString();

    const postRange = range.cloneRange();
    postRange.selectNodeContents(el);
    postRange.setStart(range.startContainer, range.startOffset);
    const textAfter = postRange.toString();

    setBlocks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], content: textBefore };
      updated.splice(index + 1, 0, { type: "text", content: textAfter });
      pushHistory(updated);
      return updated;
    });
  };

  const handleMobilePaste = (e: React.ClipboardEvent) => {
    // Tratamento de colar conteúdo se necessário
  };

  const toggleReadAloud = () => {
    if (!("speechSynthesis" in window)) {
      toast({ title: "Leitura de voz não suportada neste navegador." });
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const fullText = `${title}.\n\n${blocksToPlainText(blocks)}`;
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = "pt-BR";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoice = () => {
    // Lógica de reconhecimento de fala
  };

  const handleStartQrScanner = () => {
    setShowQrScanner(true);
  };

  const handleStopQrScanner = () => {
    setShowQrScanner(false);
  };

  const handleOcrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Lógica OCR
  };

  const openOcrNativeCamera = () => {
    // Câmera OCR
  };

  const changeEditorFontSize = (sz: number) => {
    setEditorFontSize(sz);
  };

  const toggleHighContrast = () => {
    setHighContrast(!highContrast);
  };

  const enterEditMode = () => {};

  const handleCopy = () => {
    navigator.clipboard.writeText(`${title}\n\n${blocksToPlainText(blocks)}`);
    toast({ title: "Texto copiado para a área de transferência!" });
  };

  // Cores dinâmicas de tema
  const themeBase = NOTE_COLORS.find((c) => c.value === selectedColor) || NOTE_COLORS[0];
  const isDark = highContrast;
  const theme = {
    bg: isDark ? "#121212" : themeBase.dot,
    headerBg: isDark ? "#1E1E1E" : (selectedColor === "default" ? "#FAFAFA" : themeBase.dot),
    toolbarBg: isDark ? "#252525" : (selectedColor === "default" ? "#F5F5F5" : themeBase.dot),
    borderAccent: isDark ? "#333333" : "#E0E0E0",
    textMuted: isDark ? "#AAAAAA" : "#666666",
    lines: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
  };
  const textColor = isDark ? "#FFFFFF" : "#1A1A2E";
  const placeholderColor = isDark ? "#777777" : "#999999";

  const hasUnsavedChanges = useCallback(
    () => {
      if (!snapshotRef.current) return false;
      const snap = snapshotRef.current;
      return snap.title !== title || snap.color !== selectedColor || JSON.stringify(snap.blocks) !== JSON.stringify(blocks);
    },
    [title, blocks, selectedColor]
  );

  const handleCloseAttempt = () => {
    if (!readOnly && hasUnsavedChanges()) {
      setShowUnsavedPrompt(true);
    } else {
      handleConfirmClose();
    }
  };

  const handleConfirmClose = () => {
    clearDraft();
    setShowUnsavedPrompt(false);
    onOpenChange(false);
  };

  const handleSaveAndClose = () => {
    clearDraft();
    const serialized = serializeBlocks(blocks);
    const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
    const status = editingNote?.status || "rascunho";
    onSave(title, serialized, imageUrls, selectedColor, "default", "medium", status);
    setShowUnsavedPrompt(false);
    onOpenChange(false);
  };

  // ── Renderização Visual final (conforme o trecho anterior) ──
  return (
    // ... (Estrutura do Dialog e blocos de UI apresentada anteriormente)
    null
  );
}