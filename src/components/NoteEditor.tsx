import { useState, useRef, useCallback, useEffect, useLayoutEffect, Component, ReactNode } from "react";
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
  Table2,
  Plus,
  ArrowUpRight,
  Minus,
  Circle,
  Type,
  Eraser,
  ZoomIn,
  ZoomOut,
  Palette,
  Bold as BoldIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paintbrush,
  Scissors,
  Contrast,
  Volume2,
  VolumeX,
  BookOpen,
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
  bold?: boolean;
}

export interface TableItem {
  id: string;
  nome: string;
  valor: string; // ex: "150", "-100", "-10%", "5%"
  marcado: boolean;
}

export interface TextStyle {
  color?: string;
  font?: string; // "default" | "serif" | "mono" | "hand"
  bold?: boolean;
  align?: "left" | "center" | "right";
}

export interface ContentBlock {
  type: "text" | "image" | "checklist" | "table";
  content?: string;
  contentHtml?: string; // versão com formatação por trecho (cor/negrito), gerada pelo editor rico
  url?: string;
  items?: ChecklistItem[];
  tableItems?: TableItem[];
  style?: TextStyle;
}

// Cores disponíveis pra formatação de texto
export const TEXT_COLORS = ["#1A1A2E", "#E53935", "#2D9E7F", "#1E88E5", "#F9A825", "#8E24AA", "#546E7A"];

// Famílias de fonte disponíveis (usando fontes seguras, sem precisar carregar nada extra)
export const FONT_OPTIONS: Record<string, { label: string; family: string }> = {
  default: { label: "Padrão", family: "inherit" },
  serif: { label: "Serifada", family: "Georgia, 'Times New Roman', serif" },
  mono: { label: "Monoespaçada", family: "'Courier New', monospace" },
  hand: { label: "Manuscrita", family: "'Comic Sans MS', 'Comic Sans', cursive" },
};

// ── Color theme map ────────────────────────────────────
const COLOR_THEMES: Record<string, { bg: string; lines: string; headerBg: string; toolbarBg: string; textMuted: string; borderAccent: string }> = {
  "bg-yellow-100": { bg: "#FFFDE7", lines: "#F0E68C", headerBg: "#F0E68C", toolbarBg: "#FFF9C4", textMuted: "#8B7E3C", borderAccent: "#D4C55A" },
  "bg-orange-100": { bg: "#FFE8D6", lines: "#FFBF9B", headerBg: "#FFBF9B", toolbarBg: "#FFECD2", textMuted: "#8B5E3C", borderAccent: "#E89B6B" },
  "bg-purple-100": { bg: "#EDE7F6", lines: "#C9B8F0", headerBg: "#C9B8F0", toolbarBg: "#E8E0F4", textMuted: "#5E4B8B", borderAccent: "#B39DDB" },
  "bg-green-100": { bg: "#E8F5E9", lines: "#A5D6A7", headerBg: "#A5D6A7", toolbarBg: "#E0F2E1", textMuted: "#3C6B3E", borderAccent: "#81C784" },
  "bg-pink-100": { bg: "#F3E5F5", lines: "#CE93D8", headerBg: "#CE93D8", toolbarBg: "#EFE0F3", textMuted: "#7B3C8B", borderAccent: "#BA68C8" },
  "bg-blue-100": { bg: "#E3F2FD", lines: "#90CAF9", headerBg: "#90CAF9", toolbarBg: "#DCF0FC", textMuted: "#3C5E8B", borderAccent: "#64B5F6" },
  "bg-gray-800": { bg: "#2D2D2D", lines: "#444444", headerBg: "#444444", toolbarBg: "#333333", textMuted: "#AAAAAA", borderAccent: "#666666" },
  "bg-paper": { bg: "#F5F0E8", lines: "#D3CFC5", headerBg: "#EDE8DF", toolbarBg: "#EDE8DF", textMuted: "#7A7468", borderAccent: "#C5BFB5" },
};

const NOTE_COLORS = [
  { value: "bg-yellow-100", label: "Amarelo", dot: "#FEF9C3" },
  { value: "bg-blue-100", label: "Azul", dot: "#DBEAFE" },
  { value: "bg-green-100", label: "Verde", dot: "#DCFCE7" },
  { value: "bg-pink-100", label: "Rosa", dot: "#FCE7F3" },
  { value: "bg-orange-100", label: "Laranja", dot: "#FED7AA" },
  { value: "bg-purple-100", label: "Roxo", dot: "#E9D5FF" },
  { value: "bg-gray-800", label: "Escura", dot: "#1F2937" },
  { value: "bg-paper", label: "Papel", dot: "#F5F0E8" },
];

// ── Helpers ────────────────────────────────────────────
export function getFontClass(_f: string) { return "font-body"; }
export function getSizeClass(_f: string) { return "text-sm"; }

// Detect mobile browser
const isMobileBrowser = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Renderiza texto com links clicáveis
function renderTextWithLinks(text: string, textColor: string, fontSize: number) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: "#2D9E7F",
            textDecoration: "underline",
            fontSize: `${fontSize}px`,
            wordBreak: "break-all",
          }}
        >
          {part}
        </a>
      );
    }
    return <span key={i} style={{ color: textColor, fontSize: `${fontSize}px` }}>{part}</span>;
  });
}

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

// Limpeza de segurança básica do HTML gerado pelo editor de texto rico —
// como o conteúdo vem só do próprio navegador (execCommand), o risco é baixo,
// mas ainda removemos qualquer coisa perigosa por precaução.
function sanitizeRichHtml(html: string): string {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<(?!\/?(span|br|div|b|strong|i|em|u)\b)[^>]+>/gi, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Converte texto simples (sem formatação ainda) em HTML seguro pra semear o editor rico
function textToHtml(text: string): string {
  return escapeHtml(text || "").replace(/\n/g, "<br>");
}

// Posiciona o cursor num contentEditable numa posição de caractere específica
// (equivalente ao setSelectionRange de uma textarea, que não existe em contentEditable)
function placeCaretAt(el: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;

  function walk(node: Node) {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, Math.max(0, remaining));
        placed = true;
      } else {
        remaining -= len;
      }
    } else {
      for (const child of Array.from(node.childNodes)) {
        walk(child);
        if (placed) return;
      }
    }
  }

  walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function htmlToPlainText(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, "\n");
  return tmp.textContent || "";
}

function serializeBlocks(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

function stripImagePlaceholders(s: string): string {
  return (s || "").replace(/\[imagem-?\d*\]/gi, "").replace(/\n{3,}/g, "\n\n");
}

function deserializeBlocks(raw: string): ContentBlock[] {
  if (!raw) return [{ type: "text", content: "" }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((b: any) => {
        if (b.type === "text") return { ...b, content: stripImagePlaceholders(b.content || "") };
        return b;
      });
    }
  } catch { /* legacy plain text */ }
  return [{ type: "text", content: stripImagePlaceholders(raw) }];
}

// ── Tabela Manual: helpers de cálculo ─────────────────
function tableValorEhPorcentagem(valor: string): boolean {
  return valor.trim().endsWith("%");
}

function tableValorParaNumero(valor: string): number {
  const limpo = valor.trim().replace("%", "").replace(",", ".");
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

function formatarMoedaBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * 1. Subtotal = soma dos itens marcados cujo valor NÃO é porcentagem.
 * 2. Cada item marcado com porcentagem aplica o percentual sobre esse subtotal.
 * 3. Total = subtotal + soma dos ajustes percentuais.
 */
function calcularTotalTabela(items: TableItem[]): number {
  const marcados = items.filter((i) => i.marcado);
  const subtotal = marcados
    .filter((i) => !tableValorEhPorcentagem(i.valor))
    .reduce((acc, i) => acc + tableValorParaNumero(i.valor), 0);
  const ajuste = marcados
    .filter((i) => tableValorEhPorcentagem(i.valor))
    .reduce((acc, i) => acc + (subtotal * tableValorParaNumero(i.valor)) / 100, 0);
  return subtotal + ajuste;
}

function tableItemsToPlainText(items: TableItem[]): string {
  if (!items.length) return "";
  const linhas = items.map((i) => {
    const marca = i.marcado ? "[X]" : "[ ]";
    return `${marca} ${i.nome}: ${i.valor}`;
  });
  linhas.push(`Total: ${formatarMoedaBRL(calcularTotalTabela(items))}`);
  return linhas.join("\n");
}

function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return b.content || "";
      if (b.type === "table" && b.tableItems) return tableItemsToPlainText(b.tableItems);
      return "";
    })
    .filter(Boolean)
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

// ── ImageAnnotator: editor de desenho tipo Paint (caneta, seta, linha, ──
// ── retângulo, círculo, texto, borracha de objeto, cores, zoom/lupa) ──
type DrawTool = "pen" | "arrow" | "line" | "rect" | "circle" | "text" | "eraser";

type DrawObject =
  | { type: "pen"; points: { x: number; y: number }[]; color: string; width: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: "rect"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: "circle"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: "text"; x: number; y: number; text: string; color: string; size: number };

const DRAW_COLORS = ["#E53935", "#FB8C00", "#FDD835", "#2D9E7F", "#1E88E5", "#8E24AA", "#1A1A2E", "#FFFFFF"];

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function hitTestObject(obj: DrawObject, p: { x: number; y: number }): boolean {
  const pad = 14;
  if (obj.type === "pen") return obj.points.some((pt, i) => i > 0 && distToSegment(p, obj.points[i - 1], pt) < pad);
  if (obj.type === "line" || obj.type === "arrow") return distToSegment(p, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }) < pad;
  if (obj.type === "rect") {
    const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
    const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
    return p.x >= x1 - pad && p.x <= x2 + pad && p.y >= y1 - pad && p.y <= y2 + pad &&
      (p.x < x1 + pad || p.x > x2 - pad || p.y < y1 + pad || p.y > y2 - pad);
  }
  if (obj.type === "circle") {
    const rx = Math.abs(obj.x2 - obj.x1) / 2, ry = Math.abs(obj.y2 - obj.y1) / 2;
    const cx = (obj.x1 + obj.x2) / 2, cy = (obj.y1 + obj.y2) / 2;
    if (rx === 0 || ry === 0) return false;
    const norm = ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2;
    return norm > 0.75 && norm < 1.25;
  }
  if (obj.type === "text") return p.x >= obj.x - pad && p.x <= obj.x + obj.text.length * obj.size * 0.6 + pad && p.y >= obj.y - pad && p.y <= obj.y + obj.size + pad;
  return false;
}

function drawObjectOnCanvas(ctx: CanvasRenderingContext2D, obj: DrawObject) {
  ctx.strokeStyle = obj.color;
  ctx.fillStyle = obj.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (obj.type === "pen") {
    ctx.lineWidth = obj.width;
    if (obj.points.length < 2) {
      if (obj.points.length === 1) { ctx.beginPath(); ctx.arc(obj.points[0].x, obj.points[0].y, obj.width / 2, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(obj.points[0].x, obj.points[0].y);
    obj.points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  } else if (obj.type === "line" || obj.type === "arrow") {
    ctx.lineWidth = obj.width;
    ctx.beginPath();
    ctx.moveTo(obj.x1, obj.y1);
    ctx.lineTo(obj.x2, obj.y2);
    ctx.stroke();
    if (obj.type === "arrow") {
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const headLen = Math.max(14, obj.width * 3.5);
      ctx.beginPath();
      ctx.moveTo(obj.x2, obj.y2);
      ctx.lineTo(obj.x2 - headLen * Math.cos(angle - Math.PI / 6), obj.y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(obj.x2, obj.y2);
      ctx.lineTo(obj.x2 - headLen * Math.cos(angle + Math.PI / 6), obj.y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  } else if (obj.type === "rect") {
    ctx.lineWidth = obj.width;
    ctx.strokeRect(Math.min(obj.x1, obj.x2), Math.min(obj.y1, obj.y2), Math.abs(obj.x2 - obj.x1), Math.abs(obj.y2 - obj.y1));
  } else if (obj.type === "circle") {
    ctx.lineWidth = obj.width;
    const rx = Math.abs(obj.x2 - obj.x1) / 2, ry = Math.abs(obj.y2 - obj.y1) / 2;
    const cx = (obj.x1 + obj.x2) / 2, cy = (obj.y1 + obj.y2) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obj.type === "text") {
    ctx.font = `700 ${obj.size}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(obj.text, obj.x, obj.y);
  }
}

function ImageAnnotator({ imageUrl, onSave, onCancel }: { imageUrl: string; onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<{ active: boolean; current: DrawObject | null }>({ active: false, current: null });
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#E53935");
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [objects, setObjects] = useState<DrawObject[]>([]);
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ w: 300, h: 300 });
  const [ready, setReady] = useState(false);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setCanvasSize({ w: img.naturalWidth || 300, h: img.naturalHeight || 300 });
      setReady(true);
    };
    img.onerror = () => {
      // Se a imagem vier de outro domínio sem permissão de CORS, tenta de novo sem
      // marcar como cross-origin (perde a capacidade de salvar depois, mas não trava).
      const fallback = new Image();
      fallback.onload = () => {
        imgRef.current = fallback;
        setCanvasSize({ w: fallback.naturalWidth || 300, h: fallback.naturalHeight || 300 });
        setReady(true);
      };
      fallback.onerror = () => setLoadError(true);
      fallback.src = imageUrl;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    if (canvas.width !== canvasSize.w) canvas.width = canvasSize.w;
    if (canvas.height !== canvasSize.h) canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const all = drawingRef.current.current ? [...objects, drawingRef.current.current] : objects;
    all.forEach((obj) => drawObjectOnCanvas(ctx, obj));
  }, [objects, canvasSize]);

  useEffect(() => { if (ready) redraw(); }, [ready, redraw]);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const p = getPoint(e);

    if (tool === "text") { setTextPrompt(p); return; }

    if (tool === "eraser") {
      // Remove o objeto desenhado mais próximo do toque (apaga a forma inteira, não pixel a pixel)
      setObjects((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (hitTestObject(prev[i], p)) return prev.filter((_, idx) => idx !== i);
        }
        return prev;
      });
      return;
    }

    drawingRef.current.active = true;
    if (tool === "pen") drawingRef.current.current = { type: "pen", points: [p], color, width: strokeWidth };
    else if (tool === "arrow") drawingRef.current.current = { type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth };
    else if (tool === "line") drawingRef.current.current = { type: "line", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth };
    else if (tool === "rect") drawingRef.current.current = { type: "rect", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth };
    else if (tool === "circle") drawingRef.current.current = { type: "circle", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth };
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current.active || !drawingRef.current.current) return;
    e.preventDefault();
    const p = getPoint(e);
    const cur = drawingRef.current.current;
    if (cur.type === "pen") cur.points.push(p);
    else { (cur as any).x2 = p.x; (cur as any).y2 = p.y; }
    redraw();
  }

  function handlePointerUp() {
    if (!drawingRef.current.active || !drawingRef.current.current) return;
    setObjects((prev) => [...prev, drawingRef.current.current!]);
    drawingRef.current.active = false;
    drawingRef.current.current = null;
  }

  function confirmText() {
    if (textPrompt && textInput.trim()) {
      setObjects((prev) => [...prev, { type: "text", x: textPrompt.x, y: textPrompt.y, text: textInput.trim(), color, size: 18 + strokeWidth * 3 }]);
    }
    setTextPrompt(null);
    setTextInput("");
  }

  const [saveError, setSaveError] = useState(false);

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      onSave(dataUrl);
    } catch (err) {
      setSaveError(true);
    }
  }

  const TOOLS: { id: DrawTool; icon: JSX.Element; label: string }[] = [
    { id: "pen", icon: <Paintbrush size={18} />, label: "Caneta" },
    { id: "arrow", icon: <ArrowUpRight size={18} />, label: "Seta" },
    { id: "line", icon: <Minus size={18} />, label: "Linha" },
    { id: "rect", icon: <Square size={18} />, label: "Retângulo" },
    { id: "circle", icon: <Circle size={18} />, label: "Círculo" },
    { id: "text", icon: <Type size={18} />, label: "Texto" },
    { id: "eraser", icon: <Eraser size={18} />, label: "Apagar" },
  ];

  return (
    <div className="absolute inset-0 z-[85] flex flex-col bg-black" style={{ touchAction: "none" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={onCancel} style={{ color: "#FFF", fontSize: 14, fontWeight: 600, background: "none", border: "none" }}>Cancelar</button>
        <span style={{ color: "#FFF", fontWeight: 700, fontSize: 14 }}>✏️ Editar imagem</span>
        <button onClick={handleSave} style={{ color: "#2D9E7F", fontSize: 14, fontWeight: 700, background: "none", border: "none" }}>Salvar</button>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
        {loadError ? (
          <div style={{ textAlign: "center", padding: 20, color: "#FFF" }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>😕 Não consegui carregar essa imagem pra editar.</p>
            <p style={{ fontSize: 12, color: "#AAA" }}>Toque em "Cancelar" e tente novamente.</p>
          </div>
        ) : ready ? (
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize.w * zoom, maxWidth: zoom <= 1 ? "100%" : "none", height: "auto", touchAction: "none", background: "#fff", borderRadius: 4 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        ) : (
          <Loader2 size={32} className="animate-spin text-white" />
        )}
      </div>

      {/* Aviso se não conseguir salvar (bloqueio de segurança do navegador) */}
      {saveError && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 96, padding: 20 }} onClick={() => setSaveError(false)}>
          <div style={{ background: "#FFF", borderRadius: 14, padding: 18, maxWidth: 300, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px" }}>😕 Não consegui salvar</p>
            <p style={{ fontSize: 12, color: "#9E9E9E", margin: "0 0 14px" }}>O navegador bloqueou o salvamento por segurança (a imagem vem de outro endereço). Tente tirar a foto de novo, ou avise o suporte.</p>
            <button onClick={() => setSaveError(false)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: "#2D9E7F", color: "#FFF", fontWeight: 600, fontSize: 13 }}>Entendi</button>
          </div>
        </div>
      )}

      {/* Text input prompt */}
      {textPrompt && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95, padding: 20 }} onClick={() => { setTextPrompt(null); setTextInput(""); }}>
          <div style={{ background: "#FFF", borderRadius: 14, padding: 16, width: "100%", maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px" }}>Digite o texto</p>
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmText(); }}
              placeholder="Escreva aqui..."
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #E0E0E0", borderRadius: 8, fontSize: 14, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => { setTextPrompt(null); setTextInput(""); }} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#F0F0F0", color: "#1A1A2E", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmText} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#2D9E7F", color: "#FFF", fontWeight: 600, fontSize: 13 }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div style={{ padding: "10px 10px calc(10px + env(safe-area-inset-bottom))", background: "#161616", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        {/* Tools */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }} className="no-scrollbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              style={{ padding: 8, borderRadius: 8, background: tool === t.id ? "#2D9E7F" : "#2E2E2E", color: "#FFF", flexShrink: 0, border: "none" }}
            >
              {t.icon}
            </button>
          ))}
          <div style={{ width: 1, background: "#3A3A3A", margin: "0 2px" }} />
          <button onClick={() => setObjects((prev) => prev.slice(0, -1))} title="Desfazer último" style={{ padding: 8, borderRadius: 8, background: "#2E2E2E", color: "#FFF", flexShrink: 0, border: "none" }}>
            <Undo2 size={18} />
          </button>
          <button onClick={() => setObjects([])} title="Limpar tudo" style={{ padding: 8, borderRadius: 8, background: "#2E2E2E", color: "#FFF", flexShrink: 0, border: "none", fontSize: 11, fontWeight: 700 }}>
            Limpar
          </button>
        </div>

        {/* Colors + width + zoom */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid #2D9E7F" : "2px solid #444", flexShrink: 0 }}
            />
          ))}
          <label style={{ position: "relative", width: 24, height: 24, borderRadius: "50%", overflow: "hidden", border: "2px solid #444", flexShrink: 0, display: "flex" }}>
            <Palette size={14} style={{ margin: "auto", color: "#FFF" }} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </label>
          <input
            type="range" min={2} max={20} value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            style={{ flex: 1, marginLeft: 4 }}
          />
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} title="Diminuir zoom (lupa)" style={{ padding: 6, borderRadius: 8, background: "#2E2E2E", color: "#FFF", border: "none", flexShrink: 0 }}>
            <ZoomOut size={16} />
          </button>
          <span style={{ color: "#FFF", fontSize: 11, minWidth: 34, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} title="Aumentar zoom (lupa)" style={{ padding: 6, borderRadius: 8, background: "#2E2E2E", color: "#FFF", border: "none", flexShrink: 0 }}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rede de segurança: se o editor de desenho der algum erro inesperado, ──
// ── mostra um aviso só ali dentro, em vez de derrubar o app inteiro (tela branca). ──
class AnnotatorErrorBoundary extends Component<
  { children: ReactNode; onCancel: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onCancel: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Erro no editor de desenho:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-[85] flex flex-col items-center justify-center bg-black gap-4 px-8">
          <p style={{ color: "#FFF", fontSize: 14, fontWeight: 600, textAlign: "center" }}>😕 Não consegui abrir o editor de desenho pra essa imagem.</p>
          <button onClick={this.props.onCancel} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#2D9E7F", color: "#FFF", fontWeight: 600, fontSize: 13 }}>
            Voltar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Component ──────────────────────────────────────────
export function NoteEditor({ open, onOpenChange, editingNote, readOnly = false, onSetReadOnly, initialSharedData, onSave, onSchedule }: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ type: "text", content: "" }]);
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewZoom, setViewZoom] = useState(1);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [editorFontSize, setEditorFontSize] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem("editor_font_size") || "", 10);
    return [14, 16, 20, 24, 30].includes(stored) ? stored : 16;
  });
  const changeEditorFontSize = (size: number) => {
    setEditorFontSize(size);
    localStorage.setItem("editor_font_size", String(size));
  };

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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const richTextRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pendingFocusRef = useRef<"title" | "content" | null>(null);
  const pendingCursorRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef<number>(0);
  const justEnteredEditRef = useRef(false);

  // ── Auto-save draft to localStorage ───────────────────
  const DRAFT_KEY = "note_editor_draft";

  const saveDraftToLocal = useCallback(() => {
    if (!open) return;
    const hasContent = title.trim() || blocks.some(b => (b.type === "text" && b.content?.trim()) || b.type === "image" || b.type === "checklist" || (b.type === "table" && (b.tableItems?.length ?? 0) > 0));
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

  // Restore scroll position immediately after entering edit mode (before browser paints)
  useLayoutEffect(() => {
    if (!readOnly && justEnteredEditRef.current && scrollContainerRef.current && savedScrollRef.current > 0) {
      scrollContainerRef.current.scrollTop = savedScrollRef.current;
      justEnteredEditRef.current = false;
    }
  });

  // Fix keyboard overlap on mobile — scroll focused element into view when keyboard opens
  useEffect(() => {
    if (!open) return;
    const handleViewportResize = () => {
      if (!window.visualViewport) return;
      const kbHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
      if (kbHeight > 100) {
        const focused = document.activeElement as HTMLElement;
        if (focused && (focused.tagName === "TEXTAREA" || focused.tagName === "INPUT")) {
          setTimeout(() => focused.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
        }
      }
    };
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, [open]);

  // Auto-sync to cloud every 10 seconds
  useEffect(() => {
    if (!open || !editingNote) return;
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
        if (hasContent && editingNote) {
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
  useEffect(() => {
    if (!open) {
      if (lastNoteId.current !== null) lastNoteId.current = null;
      return;
    }

    const noteId = editingNote?.id ?? "__new__";
    if (lastNoteId.current === noteId) return;

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
  }, [open, editingNote?.id, initialSharedData?.title, initialSharedData?.content]);

  const [highContrast, setHighContrast] = useState<boolean>(() => localStorage.getItem("editor_high_contrast") === "true");
  const toggleHighContrast = () => {
    setHighContrast((prev) => { localStorage.setItem("editor_high_contrast", String(!prev)); return !prev; });
  };

  const [readingMode, setReadingMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const getPlainTextForSpeech = () => {
    const parts: string[] = [];
    if (title.trim()) parts.push(title.trim());
    blocks.forEach((b) => {
      if (b.type === "text" && b.content?.trim()) parts.push(b.content.trim());
      else if (b.type === "checklist" && b.items) {
        b.items.forEach((it) => { if (it.text?.trim()) parts.push(`${it.checked ? "concluído" : "pendente"}: ${it.text.trim()}`); });
      } else if (b.type === "table" && b.tableItems) {
        b.tableItems.forEach((it) => { if (it.nome?.trim()) parts.push(`${it.nome.trim()}: ${it.valor || "0"}`); });
      }
    });
    return parts.join(". ");
  };

  const toggleReadAloud = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const text = getPlainTextForSpeech();
    if (!text.trim()) {
      toast({ title: "Nada pra ler", description: "Essa nota ainda está vazia." });
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    } catch {
      toast({ title: "Não consegui ler em voz alta", description: "Esse navegador pode não ter suporte a essa função." });
    }
  };

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const themeBase = getTheme(selectedColor);
  const isDark = selectedColor === "bg-gray-800";
  const theme = highContrast
    ? { ...themeBase, textMuted: isDark ? "#EEEEEE" : "#000000", lines: isDark ? "#888888" : "#444444" }
    : themeBase;
  const textColor = highContrast ? (isDark ? "#FFFFFF" : "#000000") : (isDark ? "#E0E0E0" : "#1A1A2E");
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
  // Sincroniza o texto rico (com cores/negrito por trecho) depois de digitar
  const updateTextBlockRich = (index: number) => {
    const el = richTextRefs.current[index];
    if (!el) return;
    const html = el.innerHTML;
    const plain = el.innerText;
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content: plain, contentHtml: html };
      return next;
    });
    clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      setBlocks((current) => { pushHistory(current); return current; });
    }, 500);
  };

  // Aplica cor/negrito só no trecho selecionado (ou no que for digitado a partir
  // do cursor, se nada estiver selecionado) — é o mesmo mecanismo usado em editores
  // de texto de verdade (Gmail, Word Online, etc.)
  const applyInlineFormat = (index: number, command: "foreColor" | "bold", value?: string) => {
    const el = richTextRefs.current[index];
    if (!el) return;
    el.focus();
    try {
      document.execCommand("styleWithCSS", false as any, "true" as any);
      document.execCommand(command, false, value);
    } catch { /* navegador sem suporte a esse comando específico */ }
    updateTextBlockRich(index);
  };

  // Atualiza a imagem de um bloco (usado depois de editar/desenhar em cima dela)
  const updateImageBlock = (index: number, newUrl: string) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[index]?.type !== "image") return prev;
      next[index] = { ...next[index], url: newUrl };
      pushHistory(next);
      return next;
    });
    toast({ title: "✏️ Imagem editada", description: "As marcações foram salvas na imagem." });
  };

  // Aplica formatação (cor, fonte, negrito, alinhamento) ao bloco de texto em foco
  const applyTextStyle = (index: number, partial: Partial<TextStyle>) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[index]?.type !== "text") return prev;
      next[index] = { ...next[index], style: { ...(next[index].style || {}), ...partial } };
      pushHistory(next);
      return next;
    });
  };

  // Divide um bloco de texto em dois, no ponto onde está o cursor — assim cada
  // metade pode ter uma cor/fonte/formatação diferente da outra.
  const splitBlockAtCursor = (index: number) => {
    const el = richTextRefs.current[index];
    const block = blocks[index];
    if (!el || !block || block.type !== "text") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !el.contains(selection.getRangeAt(0).startContainer)) {
      toast({ title: "Toque no texto primeiro", description: "Toque no ponto onde quer dividir antes de usar esse botão." });
      return;
    }
    const cursorRange = selection.getRangeAt(0);

    const beforeRange = document.createRange();
    beforeRange.setStart(el, 0);
    beforeRange.setEnd(cursorRange.startContainer, cursorRange.startOffset);
    const beforeContainer = document.createElement("div");
    beforeContainer.appendChild(beforeRange.cloneContents());
    const beforeHtml = beforeContainer.innerHTML;
    const beforeText = htmlToPlainText(beforeHtml);

    const afterRange = document.createRange();
    afterRange.setStart(cursorRange.startContainer, cursorRange.startOffset);
    afterRange.setEnd(el, el.childNodes.length);
    const afterContainer = document.createElement("div");
    afterContainer.appendChild(afterRange.cloneContents());
    const afterHtml = afterContainer.innerHTML;
    const afterText = htmlToPlainText(afterHtml);

    if (!beforeText.trim() || !afterText.trim()) {
      toast({ title: "Posicione o cursor no meio do texto", description: "Toque no ponto exato onde quer separar as duas partes antes de dividir." });
      return;
    }

    setBlocks((prev) => {
      const next = [...prev];
      next.splice(index, 1,
        { type: "text", content: beforeText, contentHtml: beforeHtml, style: block.style },
        { type: "text", content: afterText, contentHtml: afterHtml, style: block.style },
      );
      pushHistory(next);
      return next;
    });

    setActiveBlockIdx(index + 1);
    focusedBlockRef.current = index + 1;
    pendingFocusRef.current = "content";
    pendingCursorRef.current = 0;
    toast({ title: "✂️ Texto dividido em dois blocos", description: "Agora cada parte pode ter sua própria formatação." });
  };

  // Compress image before inserting (max 1200px, quality 0.7)
  const compressImage = (file: File, maxSize = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const original = ev.target?.result as string;
        const img = new Image();

        const drawAndResolve = () => {
          try {
            const canvas = document.createElement("canvas");
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxSize || h > maxSize) {
              if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
              else { w = Math.round((w * maxSize) / h); h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              // Canvas context unavailable — use original file as-is
              resolve(original);
              return;
            }
            // Preenche com fundo branco antes de desenhar — necessário para
            // PNGs com transparência (ex: screenshots do celular), que
            // ficariam pretos ao converter para JPEG sem esse passo.
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            // Sanity check: amostra alguns pixels pra detectar canvas em branco.
            // Prints de tela (screenshots) são maiores/mais complexos de decodificar
            // que fotos normais, e em alguns navegadores/WebViews o evento "load"
            // pode disparar antes do bitmap estar 100% pronto pra ser desenhado —
            // isso resulta num canvas todo branco mesmo sem erro nenhum.
            if (isCanvasBlank(ctx, w, h)) {
              resolve(original);
              return;
            }

            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            // Sanity check adicional: resultado suspeito de pequeno (canvas em branco/preto)
            if (dataUrl.length < 1000) {
              resolve(original);
              return;
            }
            resolve(dataUrl);
          } catch {
            // Any error: fall back to original
            resolve(original);
          }
        };

        // img.decode() garante que o bitmap está totalmente decodificado antes
        // de desenhar no canvas — evita a corrida com "onload" em imagens grandes
        // (como screenshots), que pode gerar uma imagem em branco de forma
        // intermitente. Em navegadores sem suporte a decode(), cai pro onload.
        if (typeof img.decode === "function") {
          img.src = original;
          img
            .decode()
            .then(drawAndResolve)
            .catch(() => {
              // decode() falhou (imagem corrompida ou navegador recusou) — tenta onload como último recurso
              img.onload = drawAndResolve;
              img.onerror = () => resolve(original);
            });
        } else {
          img.onload = drawAndResolve;
          img.onerror = () => resolve(original);
          img.src = original;
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // Verifica se um canvas está inteiramente (ou quase) branco, amostrando uma
  // grade de pixels em vez de ler o canvas inteiro (mais rápido e leve).
  const isCanvasBlank = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
    try {
      const samplesPerAxis = 8;
      let whiteCount = 0;
      let total = 0;
      for (let i = 1; i < samplesPerAxis; i++) {
        for (let j = 1; j < samplesPerAxis; j++) {
          const x = Math.floor((w * i) / samplesPerAxis);
          const y = Math.floor((h * j) / samplesPerAxis);
          const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
          total++;
          if (r > 250 && g > 250 && b > 250) whiteCount++;
        }
      }
      // Se praticamente todos os pontos amostrados forem brancos, provavelmente
      // o desenho falhou e sobrou só o fundo branco preenchido antes.
      return total > 0 && whiteCount / total > 0.97;
    } catch {
      // Se não conseguir ler pixels (ex: canvas tainted), não bloqueia o fluxo normal
      return false;
    }
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

  // ── Tabela Manual: operações ─────────────────────────
  const addTable = () => {
    const idx = focusedBlockRef.current;
    const newItem: TableItem = { id: crypto.randomUUID(), nome: "", valor: "", marcado: true };
    setBlocks((prev) => {
      const next = [...prev];
      // Se o bloco atual já é uma tabela, adiciona item nela
      if (next[idx]?.type === "table" && next[idx].tableItems) {
        next[idx] = { ...next[idx], tableItems: [...next[idx].tableItems!, newItem] };
      } else {
        // Insere novo bloco de tabela após o atual
        next.splice(idx + 1, 0, { type: "table", tableItems: [newItem] });
      }
      pushHistory(next);
      return next;
    });
  };

  const updateTableItem = (blockIdx: number, itemId: string, updates: Partial<TableItem>) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "table" && next[blockIdx].tableItems) {
        next[blockIdx] = {
          ...next[blockIdx],
          tableItems: next[blockIdx].tableItems!.map((item) =>
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

  const removeTableItem = (blockIdx: number, itemId: string) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "table" && next[blockIdx].tableItems) {
        const remaining = next[blockIdx].tableItems!.filter((item) => item.id !== itemId);
        if (remaining.length === 0) {
          // Remove o bloco de tabela inteiro
          next.splice(blockIdx, 1);
          if (next.length === 0) next.push({ type: "text", content: "" });
        } else {
          next[blockIdx] = { ...next[blockIdx], tableItems: remaining };
        }
      }
      pushHistory(next);
      return next;
    });
  };

  const addTableItemAfter = (blockIdx: number) => {
    const newItem: TableItem = { id: crypto.randomUUID(), nome: "", valor: "", marcado: true };
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIdx]?.type === "table" && next[blockIdx].tableItems) {
        next[blockIdx] = { ...next[blockIdx], tableItems: [...next[blockIdx].tableItems!, newItem] };
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

  // ── QR/Barcode Scanner (BarcodeDetector nativo + ZXing fallback) ──
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrRafRef = useRef<number>(0);
  const qrDetectorRef = useRef<any>(null);

  const handleStartQrScanner = async () => {
    setShowQrScanner(true);
    setQrLoading(true);
  };

  useEffect(() => {
    if (showQrScanner) {
      iniciarQrStream();
    }
    return () => {
      qrStreamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(qrRafRef.current);
      qrDetectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScanner]);

  const handleStopQrScanner = () => {
    qrStreamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(qrRafRef.current);
    qrDetectorRef.current = null;
    setShowQrScanner(false);
    setQrLoading(false);
  };

  const handleQrFound = (decodedText: string) => {
    qrStreamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(qrRafRef.current);
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
    toast({ title: "✅ Código lido!", description: decodedText.length > 60 ? decodedText.slice(0, 60) + "…" : decodedText });
    setShowQrScanner(false);
    setQrLoading(false);
  };

  const iniciarQrStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
      qrStreamRef.current = stream;
      if (qrVideoRef.current) { qrVideoRef.current.srcObject = stream; await qrVideoRef.current.play(); }
    } catch {
      toast({ title: "Erro ao abrir câmera", description: "Verifique as permissões." });
      setShowQrScanner(false); setQrLoading(false); return;
    }

    const scanLoop = async () => {
      if (!qrVideoRef.current || !qrCanvasRef.current || !qrDetectorRef.current) return;
      const video = qrVideoRef.current; const canvas = qrCanvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        try {
          const codes = await qrDetectorRef.current.detect(canvas);
          if (codes.length > 0) { handleQrFound(codes[0].rawValue); return; }
        } catch {}
      }
      qrRafRef.current = requestAnimationFrame(scanLoop);
    };

    const scanLoopZXing = () => {
      if (!qrVideoRef.current || !qrCanvasRef.current || !qrDetectorRef.current) return;
      const video = qrVideoRef.current; const canvas = qrCanvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        try {
          const ZXing = (window as any).ZXing;
          const imgData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
          const luminance = new ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
          const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
          const result = qrDetectorRef.current.decodeBitmap(bitmap);
          if (result) { handleQrFound(result.getText()); return; }
        } catch {}
      }
      qrRafRef.current = requestAnimationFrame(scanLoopZXing);
    };

    if ("BarcodeDetector" in window) {
      qrDetectorRef.current = new (window as any).BarcodeDetector({ formats: ["code_128","code_39","ean_13","ean_8","qr_code","data_matrix","itf","upc_a","upc_e","pdf417","aztec"] });
      setQrLoading(false);
      scanLoop();
    } else {
      if ((window as any).ZXing) {
        const ZXing = (window as any).ZXing;
        const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        qrDetectorRef.current = new ZXing.BrowserMultiFormatReader(hints);
        setQrLoading(false); scanLoopZXing();
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.0/umd/index.min.js";
        script.onload = () => {
          const ZXing = (window as any).ZXing;
          const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
          qrDetectorRef.current = new ZXing.BrowserMultiFormatReader(hints);
          setQrLoading(false); scanLoopZXing();
        };
        script.onerror = () => { toast({ title: "Erro ao carregar leitor" }); setShowQrScanner(false); setQrLoading(false); };
        document.head.appendChild(script);
      }
    }
  };

  // ── Edit mode helpers ─────────────────────────────────
  const enterEditMode = useCallback(() => {
    // Save scroll position before switching to edit mode
    if (scrollContainerRef.current) {
      savedScrollRef.current = scrollContainerRef.current.scrollTop;
      justEnteredEditRef.current = true;
    }
    snapshotRef.current = { title, blocks: JSON.parse(JSON.stringify(blocks)), color: selectedColor };
    onSetReadOnly?.(false);
  }, [title, blocks, selectedColor, onSetReadOnly]);

  const focusEditorField = useCallback((target: "title" | "content", blockIndex = 0) => {
    pendingFocusRef.current = target;
    activeFieldRef.current = target;
    focusedBlockRef.current = blockIndex;
  }, []);

  const activateFieldForEditing = useCallback((target: "title" | "content", blockIndex = 0) => {
    focusEditorField(target, blockIndex);
    if (readOnly && editingNote) enterEditMode();
  }, [editingNote, enterEditMode, focusEditorField, readOnly]);

  useEffect(() => {
    if (!open || readOnly || !pendingFocusRef.current) return;
    // Fallback: if ref callback didn't handle focus, try here
    const timer = setTimeout(() => {
      if (!pendingFocusRef.current) return; // already handled by ref callback
      const target = pendingFocusRef.current;
      pendingFocusRef.current = null;
      if (target === "title") {
        const el = titleInputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        const pos = pendingCursorRef.current ?? el.value.length;
        pendingCursorRef.current = null;
        const safePos = Math.min(pos, el.value.length);
        el.setSelectionRange(safePos, safePos);
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const el = richTextRefs.current[focusedBlockRef.current];
      if (!el) return;
      el.focus({ preventScroll: true });
      const pos = pendingCursorRef.current ?? (el.innerText || "").length;
      pendingCursorRef.current = null;
      placeCaretAt(el, pos);
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
    return () => clearTimeout(timer);
  }, [open, readOnly]);

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

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }} modal={false}>
      <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !w-screen !max-w-none !max-h-none !rounded-none !shadow-none !border-0 !p-0 !gap-0 !bg-transparent z-50 sm:!inset-auto sm:!left-1/2 sm:!top-1/2 sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!w-full sm:!max-w-[480px] sm:!h-auto sm:!max-h-[92vh] sm:!rounded-2xl sm:!shadow-2xl sm:!overflow-hidden"
        style={{ height: "100dvh" }}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Editor de Nota</DialogTitle>
        <style>{`.rich-text-editable[data-empty="true"]:before { content: attr(data-placeholder); color: ${placeholderColor}; pointer-events: none; }`}</style>
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
              <span className="text-[14px] font-bold text-white">Editando...</span>
            </div>
          )}

          {/* ── HEADER (2 linhas em mobile p/ garantir todos os botões visíveis) ── */}
          <div
            className="shrink-0"
            style={{ background: theme.headerBg, transition: "background 0.3s ease", paddingTop: "calc(8px + env(safe-area-inset-top))" }}
          >
            {/* Linha 1: voltar + título + fechar */}
            <div className="flex items-center gap-1 px-2 pb-1.5">
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-black/10 transition-colors shrink-0"
                title="Voltar"
                aria-label="Voltar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              </button>

              {readOnly ? (
                <div
                  onClick={() => { if (editingNote) activateFieldForEditing("title"); }}
                  className="flex-1 min-w-0 bg-white/90 rounded-lg px-3 py-2 text-base font-semibold outline-none shadow-sm cursor-text select-text"
                  style={{ color: title ? "#1A1A2E" : "#9CA3AF", fontSize: "16px", minHeight: "38px", display: "flex", alignItems: "center", WebkitUserSelect: "text" }}
                >
                  {title || "Título da nota..."}
                </div>
              ) : (
                <input
                  ref={(el) => {
                    (titleInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                    if (el && pendingFocusRef.current === "title") {
                      pendingFocusRef.current = null;
                      requestAnimationFrame(() => {
                        el.focus({ preventScroll: true });
                        const len = el.value.length;
                        el.setSelectionRange(len, len);
                      });
                    }
                  }}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onFocus={() => { activeFieldRef.current = "title"; }}
                  onPaste={handleMobilePaste}
                  placeholder="Título da nota..."
                  className="flex-1 min-w-0 bg-white/90 rounded-lg px-3 py-2 text-base font-semibold placeholder:text-gray-400 outline-none border-0 shadow-sm"
                  style={{ color: "#1A1A2E", fontSize: "16px" }}
                />
              )}

              <button
                onClick={() => {
                  // Save current work then go back to home
                  handleClose();
                  setTimeout(() => window.history.back(), 100);
                }}
                className="p-2 rounded-lg hover:bg-black/10 transition-colors shrink-0"
                title="Fechar aplicativo"
                aria-label="Fechar aplicativo"
              >
                <X size={22} style={{ color: textColor }} />
              </button>
            </div>

            {/* Linha 2: ações (cor, cadeado/copiar/compartilhar/editar) */}
            <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto no-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
              {/* Cor da nota — sempre visível em modo edição */}
              {!readOnly && (
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="rounded-md border-2 border-white/60 shadow-sm shrink-0 transition-transform hover:scale-110 flex items-center justify-center"
                  style={{ background: NOTE_COLORS.find((c) => c.value === selectedColor)?.dot || "#FEF9C3", width: 36, height: 36 }}
                  title="Cor da nota"
                  aria-label="Cor da nota"
                />
              )}

              {/* Copiar — sempre visível */}
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-black/10 transition-colors shrink-0 flex items-center justify-center"
                title="Copiar nota"
                aria-label="Copiar nota"
                style={{ color: textColor, minWidth: 36, minHeight: 36 }}
              >
                {copied ? <Check size={18} className="text-green-700" /> : <Copy size={18} />}
              </button>

              {/* Toggle modo escuro */}
              <button
                onClick={() => setSelectedColor(selectedColor === "bg-gray-800" ? (editingNote?.color || NOTE_COLORS[0].value) : "bg-gray-800")}
                className="p-2 rounded-full hover:bg-black/10 transition-all shrink-0 flex items-center justify-center"
                title={selectedColor === "bg-gray-800" ? "Modo claro" : "Modo escuro"}
                aria-label={selectedColor === "bg-gray-800" ? "Modo claro" : "Modo escuro"}
                style={{
                  background: selectedColor === "bg-gray-800" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
                  width: 34, height: 34, minWidth: 34,
                  color: textColor,
                }}
              >
                {selectedColor === "bg-gray-800" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>

              {/* Compartilhar — sempre visível */}
              {editingNote && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 rounded-lg hover:bg-black/10 transition-all shrink-0 flex items-center justify-center"
                  title="Compartilhar nota"
                  aria-label="Compartilhar nota"
                  style={{ color: textColor, minWidth: 36, minHeight: 36 }}
                >
                  <Share2 size={18} />
                </button>
              )}

              {/* Editar — em modo visualização */}
              {readOnly && editingNote && (
                <button
                  onClick={enterEditMode}
                  className="px-3 py-2 rounded-lg hover:bg-black/10 transition-all shrink-0 flex items-center gap-1 font-semibold"
                  title="Editar nota"
                  aria-label="Editar nota"
                  style={{ color: textColor, fontSize: 13 }}
                >
                  <Pencil size={16} /> Editar
                </button>
              )}
            </div>
          </div>

          {/* Color picker dropdown */}
          {showColorPicker && (
            <div
              className="flex gap-2 px-3 py-3 overflow-x-auto no-scrollbar shrink-0"
              style={{ background: theme.headerBg, transition: "background 0.3s ease", WebkitOverflowScrolling: "touch" }}
            >
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => { setSelectedColor(c.value); setShowColorPicker(false); }}
                  className={cn(
                    "rounded-full border-2 transition-all duration-200 shrink-0",
                    selectedColor === c.value
                      ? "border-gray-800 scale-110 shadow-md"
                      : "border-white/60 hover:scale-105"
                  )}
                  style={{ background: c.dot, width: 44, height: 44, minWidth: 44, minHeight: 44 }}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          )}

          {/* ── Sub-header ── */}
          <div className="flex items-center justify-between px-4 py-1.5 text-[13px] shrink-0" style={{ color: theme.textMuted, transition: "color 0.3s ease" }}>
            <span className="font-medium">
              {readOnly ? "👁️ Visualização" : (editingNote ? "✏️ Editando" : "Nova nota")}
              {isListening && (
                <span className="ml-2 text-red-500 font-semibold animate-pulse">
                  🎤 {activeFieldRef.current === "title" ? "Ditando no título" : "Ditando no conteúdo"}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {[14, 16, 20, 24, 30].map((size, i) => (
                <button
                  key={size}
                  onClick={() => changeEditorFontSize(size)}
                  style={{
                    width: 24, height: 24,
                    borderRadius: 6,
                    background: editorFontSize === size ? theme.borderAccent : "transparent",
                    border: `0.5px solid ${editorFontSize === size ? theme.borderAccent : theme.lines}`,
                    fontSize: 8 + i * 2,
                    fontWeight: 700,
                    color: editorFontSize === size ? isDark ? "#1A1A2E" : "#fff" : theme.textMuted,
                    cursor: "pointer",
                    lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  A
                </button>
              ))}

              <button
                onClick={toggleHighContrast}
                title="Alto contraste"
                style={{
                  width: 24, height: 24, borderRadius: 6, marginLeft: 4, flexShrink: 0,
                  background: highContrast ? theme.borderAccent : "transparent",
                  border: `0.5px solid ${theme.lines}`,
                  color: highContrast ? (isDark ? "#1A1A2E" : "#fff") : theme.textMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Contrast size={13} />
              </button>

              <button
                onClick={toggleReadAloud}
                title="Ouvir a nota em voz alta"
                style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: isSpeaking ? theme.borderAccent : "transparent",
                  border: `0.5px solid ${theme.lines}`,
                  color: isSpeaking ? (isDark ? "#1A1A2E" : "#fff") : theme.textMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>

              <button
                onClick={() => setReadingMode(true)}
                title="Modo de leitura simplificado"
                style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: "transparent",
                  border: `0.5px solid ${theme.lines}`,
                  color: theme.textMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <BookOpen size={13} />
              </button>
            </div>
          </div>

          {/* ── Barra de formatação de texto (aparece com um bloco de texto em foco) ── */}
          {!readOnly && activeBlockIdx !== null && blocks[activeBlockIdx]?.type === "text" && (
            <div
              className="flex items-center gap-2 px-3 py-2 overflow-x-auto no-scrollbar shrink-0"
              style={{ background: theme.toolbarBg, borderBottom: `1px solid ${theme.lines}` }}
            >
              {/* Cores — aplicam só no trecho selecionado (ou no que for digitado a partir do cursor) */}
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyInlineFormat(activeBlockIdx, "foreColor", c)}
                  style={{
                    width: 22, height: 22, borderRadius: "50%", background: c, flexShrink: 0,
                    border: "2px solid transparent",
                  }}
                  title="Cor do texto selecionado"
                />
              ))}

              <div style={{ width: 1, height: 20, background: theme.lines, flexShrink: 0 }} />

              {/* Fonte (cicla entre as opções) — vale pro parágrafo inteiro */}
              <button
                onClick={() => {
                  const keys = Object.keys(FONT_OPTIONS);
                  const cur = blocks[activeBlockIdx].style?.font || "default";
                  const next = keys[(keys.indexOf(cur) + 1) % keys.length];
                  applyTextStyle(activeBlockIdx, { font: next });
                }}
                title="Trocar fonte (parágrafo inteiro)"
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, background: "transparent", border: `1px solid ${theme.lines}`, color: theme.text, flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {FONT_OPTIONS[blocks[activeBlockIdx].style?.font || "default"].label}
              </button>

              {/* Negrito — aplica só no trecho selecionado */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyInlineFormat(activeBlockIdx, "bold")}
                title="Negrito no texto selecionado"
                style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent",
                  border: `1px solid ${theme.lines}`, color: theme.text,
                }}
              >
                <BoldIcon size={15} />
              </button>

              <div style={{ width: 1, height: 20, background: theme.lines, flexShrink: 0 }} />

              {/* Alinhamento — vale pro parágrafo inteiro */}
              {([
                { v: "left", icon: <AlignLeft size={15} /> },
                { v: "center", icon: <AlignCenter size={15} /> },
                { v: "right", icon: <AlignRight size={15} /> },
              ] as const).map((a) => (
                <button
                  key={a.v}
                  onClick={() => applyTextStyle(activeBlockIdx, { align: a.v })}
                  title={`Alinhar à ${a.v === "left" ? "esquerda" : a.v === "center" ? "centro" : "direita"}`}
                  style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: (blocks[activeBlockIdx].style?.align || "left") === a.v ? theme.borderAccent : "transparent",
                    border: `1px solid ${theme.lines}`, color: theme.text,
                  }}
                >
                  {a.icon}
                </button>
              ))}

              <div style={{ width: 1, height: 20, background: theme.lines, flexShrink: 0 }} />

              {/* Dividir bloco no cursor — permite ter cores/formatos diferentes em cada parte */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => splitBlockAtCursor(activeBlockIdx)}
                title="Dividir texto aqui (cada parte pode ter formatação diferente)"
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 8, flexShrink: 0,
                  background: "transparent", border: `1px solid ${theme.lines}`, color: theme.text, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <Scissors size={14} /> Dividir aqui
              </button>
            </div>
          )}

          {/* ── LINED PAPER BODY ── */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4"
            style={{
              background: `repeating-linear-gradient(to bottom, transparent, transparent 31px, ${theme.lines} 32px)`,
              backgroundPosition: "0 0",
              transition: "background 0.3s ease",
              minHeight: "120px",
            }}
          >
            <div className="py-2">
              {blocks.map((block, idx) => {
                if (block.type === "text") {
                  if (readOnly) {
                    return (
                      <div
                        key={`text-${idx}`}
                        onClick={(e) => {
                          if (!editingNote) return;
                          // Capture tap position to place cursor there
                          let cursorPos = (block.content || "").length;
                          try {
                            if ((document as any).caretPositionFromPoint) {
                              const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                              if (pos?.offset != null) cursorPos = pos.offset;
                            } else if ((document as any).caretRangeFromPoint) {
                              const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
                              if (range?.startOffset != null) cursorPos = range.startOffset;
                            }
                          } catch {}
                          pendingCursorRef.current = cursorPos;
                          activateFieldForEditing("content", idx);
                        }}
                        className="w-full bg-transparent text-base select-text"
                        style={{
                          lineHeight: `${editorFontSize * 2}px`,
                          minHeight: `${editorFontSize * 2}px`,
                          fontSize: `${editorFontSize}px`,
                          color: block.style?.color || (block.content ? textColor : placeholderColor),
                          fontFamily: FONT_OPTIONS[block.style?.font || "default"].family,
                          fontWeight: block.style?.bold ? 700 : 400,
                          textAlign: block.style?.align || "left",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          cursor: "text",
                          userSelect: "text",
                          WebkitUserSelect: "text",
                        }}
                      >
                        {block.contentHtml ? (
                          <span dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.contentHtml) }} />
                        ) : block.content ? (
                          renderTextWithLinks(block.content, block.style?.color || textColor, editorFontSize)
                        ) : (
                          idx === 0 && blocks.length === 1 ? "Comece a escrever sua nota..." : ""
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`text-${idx}`}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={() => updateTextBlockRich(idx)}
                      onFocus={() => {
                        focusedBlockRef.current = idx;
                        activeFieldRef.current = "content";
                        setActiveBlockIdx(idx);
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const text = e.clipboardData.getData("text/plain");
                        document.execCommand("insertText", false, text);
                      }}
                      data-empty={!block.content && !block.contentHtml ? "true" : "false"}
                      data-placeholder={idx === 0 && blocks.length === 1 ? "Comece a escrever sua nota..." : ""}
                      className="w-full bg-transparent border-0 outline-none text-base rich-text-editable"
                      style={{
                        lineHeight: `${editorFontSize * 2}px`,
                        minHeight: `${editorFontSize * 2}px`,
                        fontSize: `${editorFontSize}px`,
                        color: textColor,
                        fontFamily: FONT_OPTIONS[block.style?.font || "default"].family,
                        textAlign: block.style?.align || "left",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                      ref={(el) => {
                        richTextRefs.current[idx] = el;
                        if (!el) return;
                        const desiredHtml = block.contentHtml ?? textToHtml(block.content || "");
                        // Só re-semeia se estiver fora de sincronia (edição externa: desfazer,
                        // dividir bloco, carregar nota) — nunca enquanto a pessoa está digitando,
                        // pra não fazer o cursor pular de lugar.
                        if (el.innerHTML !== desiredHtml && document.activeElement !== el) {
                          el.innerHTML = desiredHtml;
                        }
                        // Focus immediately when mounted if this is the pending focus block
                        if (pendingFocusRef.current === "content" && focusedBlockRef.current === idx) {
                          pendingFocusRef.current = null;
                          requestAnimationFrame(() => {
                            el.focus({ preventScroll: true });
                            const pos = pendingCursorRef.current ?? (el.innerText || "").length;
                            pendingCursorRef.current = null;
                            placeCaretAt(el, pos);
                            // Restore scroll position immediately
                            if (scrollContainerRef.current && savedScrollRef.current > 0) {
                              scrollContainerRef.current.scrollTop = savedScrollRef.current;
                            }
                          });
                        }
                      }}
                    />
                  );
                }

                if (block.type === "checklist" && block.items) {
                  const total = block.items.length;
                  const checked = block.items.filter((i) => i.checked).length;
                  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;
                  const cFont = editorFontSize; // segue o mesmo ajuste A/A+/A++ do resto da nota
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
                          <span className="font-bold shrink-0" style={{ color: progress === 100 ? "#4CAF50" : theme.textMuted, fontSize: cFont * 0.7 }}>
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
                              <span className="cursor-grab opacity-0 group-hover/check:opacity-40 transition-opacity select-none" style={{ color: theme.textMuted, fontSize: cFont * 0.8 }}>⠿</span>
                            )}
                            <button
                              onClick={() => updateChecklistItem(idx, item.id, { checked: !item.checked })}
                              className="shrink-0 transition-all duration-200"
                              style={{ color: item.checked ? "#4CAF50" : (isDark ? "#888" : "#BDBDBD") }}
                            >
                              {item.checked ? <CheckSquare size={cFont * 1.15} /> : <Square size={cFont * 1.15} />}
                            </button>
                            <input
                              value={item.text}
                              onChange={(e) => !readOnly && updateChecklistItem(idx, item.id, { text: e.target.value })}
                              onPointerDown={(e) => {
                                if (readOnly && editingNote) {
                                  e.preventDefault();
                                  activateFieldForEditing("content", idx);
                                }
                              }}
                              onFocus={(e) => {
                                if (readOnly) { e.target.blur(); return; }
                                focusedBlockRef.current = idx;
                                activeFieldRef.current = "content";
                              }}
                              tabIndex={readOnly ? -1 : 0}
                              onPaste={handleMobilePaste}
                              readOnly={readOnly}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addChecklistItemAfter(idx);
                                }
                              }}
                              placeholder="Item da lista..."
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none"
                              style={{
                                lineHeight: `${cFont * 2}px`,
                                fontSize: cFont,
                                fontWeight: item.bold ? 700 : 400,
                                color: item.checked ? "#999" : textColor,
                                textDecoration: item.checked ? "line-through" : "none",
                                opacity: item.checked ? 0.7 : 1,
                              }}
                            />
                            {!readOnly && (
                              <button
                                onClick={() => updateChecklistItem(idx, item.id, { bold: !item.bold })}
                                className="shrink-0 transition-opacity p-1 rounded hover:bg-black/5"
                                style={{ color: item.bold ? "#2D9E7F" : "#BDBDBD" }}
                                title="Negrito"
                              >
                                <BoldIcon size={cFont * 0.85} />
                              </button>
                            )}
                            {!readOnly && (
                              <button
                                onClick={() => removeChecklistItem(idx, item.id)}
                                className="shrink-0 opacity-0 group-hover/check:opacity-100 transition-opacity p-1 rounded hover:bg-black/5"
                                style={{ color: "#BDBDBD" }}
                              >
                                <Trash2 size={cFont * 0.78} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => addChecklistItemAfter(idx)}
                          className="flex items-center gap-1 ml-7 py-1 hover:opacity-80 transition-opacity"
                          style={{ color: theme.textMuted, fontSize: cFont * 0.85 }}
                        >
                          + Adicionar item
                        </button>
                      )}
                    </div>
                  );
                }

                if (block.type === "table" && block.tableItems) {
                  const total = calcularTotalTabela(block.tableItems);
                  const tFont = editorFontSize; // tamanho base — segue o mesmo ajuste A/A+/A++ do resto da nota
                  return (
                    <div key={`table-${idx}`} className="my-2">
                      <div className="flex items-center gap-1.5 mb-2 px-1">
                        <Table2 size={tFont} style={{ color: theme.textMuted }} />
                        <span className="font-bold" style={{ color: theme.textMuted, fontSize: tFont * 0.85 }}>Tabela Manual</span>
                      </div>
                      <div className="space-y-2">
                        {block.tableItems.map((item) => {
                          const ehPct = tableValorEhPorcentagem(item.valor);
                          const numero = tableValorParaNumero(item.valor);
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
                              style={{
                                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
                                border: `1px solid ${theme.lines}`,
                              }}
                            >
                              <button
                                onClick={() => !readOnly && updateTableItem(idx, item.id, { marcado: !item.marcado })}
                                className="shrink-0 transition-all duration-200"
                                style={{ color: item.marcado ? "#4CAF50" : (isDark ? "#888" : "#BDBDBD") }}
                                disabled={readOnly}
                              >
                                {item.marcado ? <CheckSquare size={tFont} /> : <Square size={tFont} />}
                              </button>
                              <input
                                value={item.nome}
                                onChange={(e) => !readOnly && updateTableItem(idx, item.id, { nome: e.target.value })}
                                onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                                onPaste={handleMobilePaste}
                                readOnly={readOnly}
                                tabIndex={readOnly ? -1 : 0}
                                placeholder="Nome"
                                className="flex-1 min-w-0 bg-transparent border-0 outline-none font-medium"
                                style={{ color: textColor, opacity: item.marcado ? 1 : 0.6, fontSize: tFont }}
                              />
                              <input
                                value={item.valor}
                                onChange={(e) => !readOnly && updateTableItem(idx, item.id, { valor: e.target.value })}
                                onFocus={() => { focusedBlockRef.current = idx; activeFieldRef.current = "content"; }}
                                onPaste={handleMobilePaste}
                                readOnly={readOnly}
                                tabIndex={readOnly ? -1 : 0}
                                inputMode="decimal"
                                placeholder="Valor"
                                className="shrink-0 bg-transparent border-0 outline-none text-right font-semibold"
                                style={{
                                  color: numero < 0 ? "#E53935" : (isDark ? "#81C784" : "#2D9E7F"),
                                  opacity: item.marcado ? 1 : 0.6,
                                  fontSize: tFont,
                                  width: Math.max(56, tFont * 4),
                                }}
                              />
                              {!readOnly && (
                                <button
                                  onClick={() => removeTableItem(idx, item.id)}
                                  className="shrink-0 hover:bg-black/5 rounded"
                                  style={{ color: "#BDBDBD", padding: 2 }}
                                  aria-label="Remover item"
                                >
                                  <Trash2 size={tFont * 0.9} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!readOnly && (
                        <button
                          onClick={() => addTableItemAfter(idx)}
                          className="flex items-center gap-1 mt-2 py-1 hover:opacity-80 transition-opacity"
                          style={{ color: theme.textMuted, fontSize: tFont * 0.85 }}
                        >
                          <Plus size={tFont * 0.9} /> Adicionar item
                        </button>
                      )}

                      {/* Rodapé fixo com o total, sempre visível ao rolar a nota */}
                      <div
                        className="sticky bottom-0 mt-2 flex items-center justify-between rounded-xl px-3 py-2 z-10"
                        style={{
                          background: isDark ? "#1F1F1F" : "#1A1A2E",
                          boxShadow: "0 -2px 10px rgba(0,0,0,0.15)",
                        }}
                      >
                        <span className="font-medium" style={{ color: "#BDBDBD", fontSize: tFont * 0.75 }}>Total da tabela</span>
                        <span className="font-bold" style={{ color: "#FFF", fontSize: tFont * 1.05 }}>{formatarMoedaBRL(total)}</span>
                      </div>
                    </div>
                  );
                }

                if (block.type === "image" && block.url) {
                  return (
                    <div key={`img-${idx}`} className="relative group/img my-3 flex justify-center">
                      <div style={{ width: "100%", maxWidth: "100%", position: "relative" }}>
                        <img
                          src={block.url}
                          alt=""
                          onClick={() => { setViewingImage(block.url!); setViewZoom(1); }}
                          style={{
                            width: "100%",
                            height: "auto",
                            maxHeight: "320px",
                            objectFit: "contain",
                            borderRadius: 12,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                            display: "block",
                            margin: "0 auto",
                            cursor: "zoom-in",
                          }}
                        />
                        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 5 }}>
                          <button
                            onClick={() => { setViewingImage(block.url!); setViewZoom(1); }}
                            className="rounded-full text-white transition-all hover:bg-black/80 active:scale-95"
                            style={{ background: "rgba(0,0,0,0.7)", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
                            aria-label="Ver com lupa"
                            title="Ver ampliado"
                          >
                            <ScanSearch size={14} />
                          </button>
                          {!readOnly && (
                            <button
                              onClick={() => setEditingImageIdx(idx)}
                              className="rounded-full text-white transition-all hover:bg-black/80 active:scale-95"
                              style={{ background: "rgba(0,0,0,0.7)", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
                              aria-label="Desenhar na imagem"
                              title="Editar / desenhar"
                            >
                              <Paintbrush size={14} />
                            </button>
                          )}
                          {!readOnly && (
                            <button
                              onClick={() => removeImageBlock(idx)}
                              className="rounded-full text-white transition-all hover:bg-black/80 active:scale-95"
                              style={{ background: "rgba(0,0,0,0.7)", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
                              aria-label="Remover imagem"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Word/char counter */}
            <div className="flex justify-end gap-3 pb-2">
              <span className="text-[13px]" style={{ color: theme.textMuted }}>
                {wordCount} {wordCount === 1 ? "palavra" : "palavras"}
              </span>
              <span className="text-[13px]" style={{ color: theme.textMuted }}>
                {charCount} caracteres
              </span>
            </div>
          </div>

          {/* ── FAB inputs (hidden) ── */}
          {!readOnly && (
            <>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
              <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrImage} />
              <input ref={ocrFileRef} type="file" accept="image/*" className="hidden" onChange={handleOcrImage} />
            </>
          )}

          {/* ── FOOTER COMPACTO: ⋮ | ✓ ── */}
          {!readOnly ? (
            <div
              className="flex items-center justify-between px-5 shrink-0"
              style={{
                background: theme.toolbarBg,
                borderTop: `1px solid ${theme.lines}`,
                paddingTop: 10,
                paddingBottom: `calc(10px + env(safe-area-inset-bottom))`,
                gap: 16,
              }}
            >
              {/* FAB ⋮ — esquerda */}
              <div className="relative">
                {showFab && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setShowFab(false)} />
                    <div
                      className="absolute z-[70] flex flex-col gap-2"
                      style={{ bottom: 60, left: 0, minWidth: 180 }}
                    >
                      {[
                        { icon: <Camera size={18} />, label: "Câmera", action: () => { cameraInputRef.current?.click(); setShowFab(false); } },
                        { icon: <ImagePlus size={18} />, label: "Galeria", action: () => { fileInputRef.current?.click(); setShowFab(false); } },
                        { icon: ocrLoading ? <Loader2 size={18} className="animate-spin" /> : <ScanSearch size={18} />, label: "OCR", action: () => { setShowOcrModal(true); setShowFab(false); } },
                        { icon: qrLoading ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />, label: "QR", action: () => { handleStartQrScanner(); setShowFab(false); } },
                        { icon: <ListChecks size={18} />, label: "Lista", action: () => { addChecklist(); setShowFab(false); } },
                        { icon: <Table2 size={18} />, label: "Tabela Manual", action: () => { addTable(); setShowFab(false); } },
                        ...(voiceSupported ? [{ icon: isListening ? <MicOff size={18} /> : <Mic size={18} />, label: isListening ? "Parar voz" : "Voz", action: () => { toggleVoice(); setShowFab(false); } }] : []),
                        ...(onSchedule ? [{ icon: <CalendarPlus size={18} />, label: "Agendar", action: () => { setScheduleDate(new Date().toISOString().slice(0, 10)); setScheduleTime("09:00"); setShowScheduleDialog(true); setShowFab(false); } }] : []),
                        { icon: <Undo2 size={18} />, label: "Desfazer", action: () => { undo(); setShowFab(false); }, disabled: !canUndo },
                        { icon: <Redo2 size={18} />, label: "Refazer", action: () => { redo(); setShowFab(false); }, disabled: !canRedo },
                      ].map((item, i) => (
                        <button
                          key={i}
                          onClick={item.action}
                          disabled={item.disabled}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all active:scale-95"
                          style={{
                            background: isDark ? "#3A3A3A" : "#FFFFFF",
                            color: item.disabled ? "#BDBDBD" : (isDark ? "#FFF" : "#1A1A2E"),
                            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                            opacity: item.disabled ? 0.5 : 1,
                          }}
                        >
                          <span style={{ color: isDark ? "#FFF" : theme.textMuted }}>{item.icon}</span>
                          <span className="text-sm font-semibold">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowFab((v) => !v)}
                  className="flex items-center justify-center rounded-full transition-all active:scale-95"
                  style={{
                    width: 48, height: 48,
                    background: showFab ? "#1A1A2E" : theme.headerBg,
                    border: `2px solid ${theme.borderAccent}`,
                    color: showFab ? "#FFF" : theme.textMuted,
                  }}
                  title="Opções"
                >
                  {showFab ? <X size={20} /> : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* Salvar ✓ — centro */}
              <button
                onClick={editingNote ? handleSaveAndBackToView : () => doSaveAndClose("publicada")}
                disabled={!title.trim() && !blocksToPlainText(blocks).trim()}
                className="flex items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "#2D9E7F", width: 48, height: 48, boxShadow: "0 4px 14px rgba(45,158,127,0.4)" }}
                title="Salvar"
              >
                <Check size={22} color="#FFF" strokeWidth={2.5} />
              </button>

              {/* Espaço vazio — direita (para centralizar o botão salvar) */}
              <div style={{ width: 48, height: 48 }} />
            </div>
          ) : (
            <div
              className="flex gap-3 px-4 py-2.5 shrink-0 justify-center items-center"
              style={{
                background: theme.toolbarBg,
                borderTop: `1px solid ${theme.lines}`,
                paddingBottom: "calc(60px + env(safe-area-inset-bottom))",
              }}
            >
              <span className="text-sm font-semibold" style={{ color: theme.textMuted }}>👁️ Modo visualização</span>
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
                    className="w-full text-center text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    style={{ color: "#9E9E9E" }}
                  >
                    Continuar editando
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SHARE MODAL ── */}
        {showShareModal && (
          <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowShareModal(false)}>
            <div
              className="w-full rounded-t-3xl p-6 space-y-3"
              style={{ background: "#FFF", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", maxWidth: 480 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#E0E0E0" }} />
              <h3 className="text-base font-bold text-center mb-4" style={{ color: "#1A1A2E" }}>
                Compartilhar nota
              </h3>

              {/* WhatsApp */}
              <button
                onClick={() => {
                  const text = encodeURIComponent(`${title}

${blocksToPlainText(blocks)}`.trim());
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                  setShowShareModal(false);
                }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all hover:bg-gray-50 active:scale-95"
                style={{ border: "1px solid #E8F5E9" }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#25D366" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>WhatsApp</div>
                  <div className="text-sm" style={{ color: "#9E9E9E" }}>Enviar via WhatsApp</div>
                </div>
              </button>

              {/* Email */}
              <button
                onClick={() => {
                  const subject = encodeURIComponent(title || "Nota");
                  const body = encodeURIComponent(`${title}

${blocksToPlainText(blocks)}`.trim());
                  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
                  setShowShareModal(false);
                }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all hover:bg-gray-50 active:scale-95"
                style={{ border: "1px solid #E3F2FD" }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#2196F3" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>E-mail</div>
                  <div className="text-sm" style={{ color: "#9E9E9E" }}>Enviar por e-mail</div>
                </div>
              </button>


              {/* Copiar texto */}
              <button
                onClick={async () => {
                  const text = `${title}

${blocksToPlainText(blocks)}`.trim();
                  try {
                    await navigator.clipboard.writeText(text);
                    toast({ title: "✅ Copiado!", description: "Texto copiado para a área de transferência." });
                  } catch {
                    toast({ title: "Erro", description: "Não foi possível copiar." });
                  }
                  setShowShareModal(false);
                }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all hover:bg-gray-50 active:scale-95"
                style={{ border: "1px solid #F3E5F5" }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#9C27B0" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>Copiar texto</div>
                  <div className="text-sm" style={{ color: "#9E9E9E" }}>Copiar para área de transferência</div>
                </div>
              </button>

              {/* Compartilhar nativo (se disponível) */}
              {navigator.share && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share({ title: title || "Nota", text: `${title}

${blocksToPlainText(blocks)}`.trim() });
                    } catch {}
                    setShowShareModal(false);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all hover:bg-gray-50 active:scale-95"
                  style={{ border: "1px solid #E8EAF6" }}
                >
                  <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#3F51B5" }}>
                    <Share2 size={20} color="white" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>Mais opções</div>
                    <div className="text-sm" style={{ color: "#9E9E9E" }}>Telegram, SMS e outros</div>
                  </div>
                </button>
              )}

              <button
                onClick={() => setShowShareModal(false)}
                className="w-full py-3 text-sm font-medium rounded-2xl mt-1"
                style={{ background: "#F5F5F5", color: "#666" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── OCR MODAL ── */}
        {/* Modal de Agendar — estava faltando, botão existia mas não abria nada */}
        {showScheduleDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowScheduleDialog(false)}>
            <div className="bg-white rounded-2xl p-6 mx-4 shadow-xl max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <CalendarPlus size={18} className="text-gray-600" /> Agendar nota
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Cria um compromisso na Agenda com o título e o conteúdo desta nota.
              </p>

              <label className="block text-sm font-medium text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 outline-none focus:border-yellow-400"
              />

              <label className="block text-sm font-medium text-gray-600 mb-1">Hora</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 outline-none focus:border-yellow-400"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowScheduleDialog(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!scheduleDate) {
                      toast({ title: "Escolha uma data", description: "Selecione a data do compromisso." });
                      return;
                    }
                    onSchedule?.(title || "Nota sem título", blocksToPlainText(blocks), scheduleDate, scheduleTime);
                    setShowScheduleDialog(false);
                    toast({ title: "📅 Agendado!", description: "Compromisso criado na Agenda." });
                  }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: "#2D9E7F" }}
                >
                  Agendar
                </button>
              </div>
            </div>
          </div>
        )}

        {showOcrModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl p-6 mx-4 shadow-xl max-w-xs w-full">
              <h3 className="text-base font-semibold text-gray-800 mb-1">Extrair texto (OCR)</h3>
              <p className="text-sm text-gray-500 mb-4">De onde deseja extrair o texto?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => ocrCameraRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all"
                >
                  <Camera size={24} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Câmera</span>
                </button>
                <button
                  onClick={() => ocrFileRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all"
                >
                  <ImagePlus size={24} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Galeria</span>
                </button>
              </div>
              <button
                onClick={() => setShowOcrModal(false)}
                className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* QR/Barcode Scanner Modal */}
        {showQrScanner && (
          <div className="absolute inset-0 z-50 flex flex-col bg-black">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
              <span style={{ color: "#FFF", fontWeight: 700, fontSize: 16 }}>📷 Leitor de Código</span>
              <button onClick={handleStopQrScanner} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#FFF", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            {/* Vídeo */}
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <video ref={qrVideoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <canvas ref={qrCanvasRef} style={{ display: "none" }} />
              {/* Mira */}
              {!qrLoading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: "65%", aspectRatio: "1", position: "relative" }}>
                    {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                      <div key={i} style={{ position: "absolute", width: 28, height: 28, borderTop: (pos as any).top===0?"3px solid #2D9E7F":"none", borderBottom: (pos as any).bottom===0?"3px solid #2D9E7F":"none", borderLeft: (pos as any).left===0?"3px solid #2D9E7F":"none", borderRight: (pos as any).right===0?"3px solid #2D9E7F":"none", ...pos }} />
                    ))}
                    <div style={{ position: "absolute", left: 4, right: 4, height: 2, background: "linear-gradient(90deg,transparent,#2D9E7F,transparent)", animation: "scanline 1.5s ease-in-out infinite", top: "50%" }} />
                  </div>
                </div>
              )}
              {/* Loading */}
              {qrLoading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
                  <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #2D9E7F", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
                  <span style={{ color: "#FFF", fontSize: 13 }}>Iniciando câmera...</span>
                </div>
              )}
            </div>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", padding: "12px 0 4px" }}>Aponte para QR Code ou código de barras</p>
            <button onClick={handleStopQrScanner} style={{ margin: "8px 16px 32px", padding: "12px 0", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <style>{`@keyframes scanline{0%,100%{top:10%}50%{top:85%}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* OCR Loading overlay */}
        {ocrLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/30 gap-3">
            <Loader2 size={32} className="animate-spin text-white" />
            <p className="text-white text-sm font-medium">Extraindo texto da imagem...</p>
          </div>
        )}

        {/* Editor de desenho (tipo Paint) em cima da imagem */}
        {editingImageIdx !== null && blocks[editingImageIdx]?.url && (
          <AnnotatorErrorBoundary onCancel={() => setEditingImageIdx(null)}>
            <ImageAnnotator
              imageUrl={blocks[editingImageIdx].url!}
              onSave={(newUrl) => { updateImageBlock(editingImageIdx, newUrl); setEditingImageIdx(null); }}
              onCancel={() => setEditingImageIdx(null)}
            />
          </AnnotatorErrorBoundary>
        )}

        {/* Visualizador com lupa (ver a imagem ampliada, sem editar) */}
        {viewingImage && (
          <div
            className="absolute inset-0 z-[85] flex flex-col bg-black"
            onClick={() => setViewingImage(null)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", flexShrink: 0 }}>
              <span style={{ color: "#FFF", fontWeight: 700, fontSize: 14 }}>🔍 Ver ampliado</span>
              <button onClick={() => setViewingImage(null)} style={{ color: "#FFF", background: "none", border: "none" }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
              <img
                src={viewingImage}
                alt=""
                style={{ width: `${viewZoom * 100}%`, maxWidth: viewZoom <= 1 ? "100%" : "none", height: "auto", transition: "width 0.15s ease" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setViewZoom((z) => Math.max(0.5, +(z - 0.5).toFixed(2)))} style={{ padding: 8, borderRadius: 8, background: "#2E2E2E", color: "#FFF", border: "none" }}>
                <ZoomOut size={18} />
              </button>
              <span style={{ color: "#FFF", fontSize: 13, minWidth: 44, textAlign: "center" }}>{Math.round(viewZoom * 100)}%</span>
              <button onClick={() => setViewZoom((z) => Math.min(5, +(z + 0.5).toFixed(2)))} style={{ padding: 8, borderRadius: 8, background: "#2E2E2E", color: "#FFF", border: "none" }}>
                <ZoomIn size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Modo de leitura simplificado — tela limpa, só o texto, bem grande */}
        {readingMode && (
          <div
            className="absolute inset-0 z-[90] flex flex-col"
            style={{ background: highContrast ? (isDark ? "#000" : "#FFF") : theme.bg }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${theme.lines}`, flexShrink: 0 }}>
              <button onClick={() => setReadingMode(false)} style={{ background: "none", border: "none", color: textColor, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
                <X size={20} /> Fechar
              </button>
              <button
                onClick={toggleReadAloud}
                style={{ background: isSpeaking ? theme.borderAccent : "transparent", border: `1px solid ${theme.lines}`, borderRadius: 10, padding: "8px 14px", color: isSpeaking ? "#FFF" : textColor, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}
              >
                {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />} {isSpeaking ? "Parar" : "Ouvir"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {title.trim() && (
                <h1 style={{ fontSize: Math.max(28, editorFontSize * 1.4), fontWeight: 700, color: textColor, marginBottom: 20, lineHeight: 1.3 }}>
                  {title}
                </h1>
              )}
              {blocks.map((b, i) => {
                if (b.type === "text" && b.content?.trim()) {
                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: Math.max(20, editorFontSize * 1.15),
                        lineHeight: 1.8,
                        color: b.style?.color || textColor,
                        fontWeight: b.style?.bold ? 700 : 400,
                        textAlign: b.style?.align || "left",
                        marginBottom: 16,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {b.contentHtml ? <span dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(b.contentHtml) }} /> : b.content}
                    </div>
                  );
                }
                if (b.type === "checklist" && b.items) {
                  return (
                    <div key={i} style={{ marginBottom: 16 }}>
                      {b.items.map((it) => (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", fontSize: Math.max(18, editorFontSize), color: textColor, opacity: it.checked ? 0.6 : 1, fontWeight: it.bold ? 700 : 400 }}>
                          {it.checked ? <CheckSquare size={22} color="#4CAF50" /> : <Square size={22} />}
                          <span style={{ textDecoration: it.checked ? "line-through" : "none" }}>{it.text}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                if (b.type === "table" && b.tableItems) {
                  return (
                    <div key={i} style={{ marginBottom: 16 }}>
                      {b.tableItems.map((it) => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: Math.max(18, editorFontSize), color: textColor, borderBottom: `1px solid ${theme.lines}` }}>
                          <span>{it.nome}</span>
                          <strong>{it.valor}</strong>
                        </div>
                      ))}
                    </div>
                  );
                }
                if (b.type === "image" && b.url) {
                  return <img key={i} src={b.url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 16 }} />;
                }
                return null;
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
