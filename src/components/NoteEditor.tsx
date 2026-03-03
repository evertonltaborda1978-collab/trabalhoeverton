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
  MoreVertical,
  ScanSearch,
  Loader2,
  QrCode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────
export interface ContentBlock {
  type: "text" | "image";
  content?: string; // for text blocks
  url?: string;     // for image blocks
}

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

/** Serialize blocks to a JSON string for DB storage */
function serializeBlocks(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

/** Deserialize DB content – handles legacy plain strings */
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
  ) => void;
}

// ── Component ──────────────────────────────────────────
export function NoteEditor({ open, onOpenChange, editingNote, onSave }: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ type: "text", content: "" }]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  // History for undo/redo
  const [history, setHistory] = useState<ContentBlock[][]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const ocrCameraRef = useRef<HTMLInputElement>(null);
  const focusedBlockRef = useRef<number>(0);

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

  // ── Undo / Redo ──────────────────────────────────────
  const pushHistory = useCallback((newBlocks: ContentBlock[]) => {
    setHistory((h) => {
      const trimmed = h.slice(0, historyIdx + 1);
      return [...trimmed, JSON.parse(JSON.stringify(newBlocks))];
    });
    setHistoryIdx((i) => i + 1);
  }, [historyIdx]);

  const undo = () => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    if (prev) {
      setBlocks(JSON.parse(JSON.stringify(prev)));
      setHistoryIdx((i) => i - 1);
    }
  };

  const redo = () => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    if (next) {
      setBlocks(JSON.parse(JSON.stringify(next)));
      setHistoryIdx((i) => i + 1);
    }
  };

  // ── Block operations ─────────────────────────────────
  const updateTextBlock = (index: number, text: string) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content: text };
      return next;
    });
  };

  const insertImageAtBlock = (file: File) => {
    const url = URL.createObjectURL(file);
    const idx = focusedBlockRef.current;

    setBlocks((prev) => {
      const next = [...prev];
      const currentBlock = next[idx];

      // Split text block at cursor if it's a text block
      if (currentBlock?.type === "text") {
        const imgBlock: ContentBlock = { type: "image", url };
        const afterBlock: ContentBlock = { type: "text", content: "" };
        next.splice(idx + 1, 0, imgBlock, afterBlock);
      } else {
        next.splice(idx + 1, 0, { type: "image", url }, { type: "text", content: "" });
      }

      const result = next;
      pushHistory(result);
      return result;
    });
  };

  const removeImageBlock = (index: number) => {
    setBlocks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Merge adjacent text blocks
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

  // ── Image input handler ──────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) insertImageAtBlock(file);
    e.target.value = "";
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

  // ── Copy ─────────────────────────────────────────────
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
      // Wait for the DOM element to be ready
      await new Promise((r) => setTimeout(r, 300));
      const scanner = new Html5Qrcode("qr-reader");
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Insert decoded text into current block
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
        () => {} // ignore scan errors (no QR found yet)
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
      const { Html5Qrcode } = await import("html5-qrcode");
      // Try to stop any running instance
      const el = document.getElementById("qr-reader");
      if (el) el.innerHTML = "";
    } catch {}
    setShowQrScanner(false);
  };

  // ── Save ─────────────────────────────────────────────
  const handleSave = () => {
    if (!title.trim()) return;
    const serialized = serializeBlocks(blocks);
    const imageUrls = blocks.filter((b) => b.type === "image").map((b) => b.url || "");
    onSave(title, serialized, imageUrls, selectedColor, "default", "medium");
    onOpenChange(false);
  };

  // ── Word count ───────────────────────────────────────
  const plainText = blocksToPlainText(blocks);
  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = plainText.length;

  // ── Auto-resize textareas ────────────────────────────
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !w-screen !h-screen !min-h-[100dvh] !max-w-none !max-h-none !rounded-none !shadow-none !border-0 !p-0 !gap-0 !bg-transparent overflow-hidden flex flex-col z-50">
        {/* ── NOTEPAD CONTAINER ── */}
        <div className="flex flex-col h-full" style={{ background: "#FFFDE7" }}>

          {/* ── HEADER (yellow bar) ── */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 shrink-0"
            style={{ background: "#F9C920" }}
          >
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors disabled:opacity-40"
              title="Salvar"
            >
              <Check size={20} className="text-gray-800" />
            </button>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da nota..."
              className="flex-1 bg-white/90 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-800 placeholder:text-gray-400 outline-none border-0 shadow-sm"
            />

            {/* Color dot */}
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-7 h-7 rounded-md border-2 border-white/60 shadow-sm shrink-0 transition-transform hover:scale-110"
              style={{ background: NOTE_COLORS.find((c) => c.value === selectedColor)?.dot || "#FEF9C3" }}
              title="Cor da nota"
            />

            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors"
              title="Fechar"
            >
              <X size={20} className="text-gray-800" />
            </button>
          </div>

          {/* Color picker dropdown */}
          {showColorPicker && (
            <div className="flex gap-2 px-4 py-2 justify-center" style={{ background: "#F9C920" }}>
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
          <div className="flex items-center justify-between px-4 py-1.5 text-[11px]" style={{ color: "#8B7E3C" }}>
            <span className="font-medium">
              {editingNote ? "Editando" : "Nova nota"}
            </span>
            <span>
              {format(editingNote?.createdAt ?? new Date(), "d 'de' MMMM, HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* ── LINED PAPER BODY ── */}
          <div
            className="flex-1 overflow-y-auto px-4"
            style={{
              background: `repeating-linear-gradient(to bottom, transparent, transparent 27px, #E6D97A 28px)`,
              backgroundPosition: "0 0",
            }}
          >
            {/* Block editor */}
            <div className="py-2">
              {blocks.map((block, idx) => {
                if (block.type === "text") {
                  return (
                    <textarea
                      key={idx}
                      value={block.content || ""}
                      onChange={(e) => {
                        updateTextBlock(idx, e.target.value);
                        autoResize(e.target);
                      }}
                      onFocus={() => { focusedBlockRef.current = idx; }}
                      onBlur={() => pushHistory(blocks)}
                      placeholder={idx === 0 && blocks.length === 1 ? "Comece a escrever sua nota..." : ""}
                      className="w-full bg-transparent border-0 outline-none resize-none text-sm text-gray-800 placeholder:text-gray-400/60"
                      style={{ lineHeight: "28px", minHeight: "28px", overflow: "hidden" }}
                      ref={(el) => { if (el) autoResize(el); }}
                    />
                  );
                }

                if (block.type === "image" && block.url) {
                  return (
                    <div key={idx} className="relative group/img my-2" style={{ maxWidth: "100%" }}>
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
              <span className="text-[10px]" style={{ color: "#8B7E3C" }}>
                {wordCount} {wordCount === 1 ? "palavra" : "palavras"}
              </span>
              <span className="text-[10px]" style={{ color: "#8B7E3C" }}>
                {charCount} caracteres
              </span>
            </div>
          </div>

          {/* ── TOOLBAR ── */}
          <div className="flex items-center gap-1 px-3 py-2 border-t shrink-0" style={{ borderColor: "#E6D97A", background: "#FFF9C4" }}>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrImage} />
            <input ref={ocrFileRef} type="file" accept="image/*" className="hidden" onChange={handleOcrImage} />

            <button onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-200/60 transition-colors" style={{ color: "#5D5320" }}>
              <Camera size={16} /> Câmera
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-200/60 transition-colors" style={{ color: "#5D5320" }}>
              <ImagePlus size={16} /> Galeria
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-200/60 transition-colors" style={{ color: "#5D5320" }}>
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />} Copiar
            </button>

            <div className="w-px h-5 mx-1" style={{ background: "#E6D97A" }} />

            <button
              onClick={() => setShowOcrModal(true)}
              disabled={ocrLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-200/60 transition-colors" style={{ color: "#5D5320" }}
            >
              {ocrLoading ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
              {ocrLoading ? "Extraindo..." : "OCR"}
            </button>
            <button
              onClick={handleStartQrScanner}
              disabled={qrLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-200/60 transition-colors" style={{ color: "#5D5320" }}
            >
              {qrLoading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
              {qrLoading ? "Lendo..." : "QR"}
            </button>

            <div className="flex-1" />

            <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 rounded-lg hover:bg-yellow-200/60 transition-colors disabled:opacity-30" style={{ color: "#5D5320" }}>
              <Undo2 size={18} />
            </button>
            <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 rounded-lg hover:bg-yellow-200/60 transition-colors disabled:opacity-30" style={{ color: "#5D5320" }}>
              <Redo2 size={18} />
            </button>
          </div>

          {/* ── FOOTER BUTTONS ── */}
          <div className="flex gap-3 px-4 py-3 shrink-0" style={{ background: "#FFF9C4", borderTop: "1px solid #E6D97A" }}>
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 h-[52px] rounded-xl text-sm font-semibold border-2 transition-all duration-200 hover:bg-yellow-100"
              style={{ borderColor: "#D4C55A", color: "#5D5320" }}
            >
              Salvar rascunho
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="flex-1 h-[52px] rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
              style={{ background: "#2D9E7F" }}
            >
              {editingNote ? "Salvar" : "Criar nota"}
            </button>
          </div>
        </div>

        {/* ── OCR MODAL ── */}
        {showOcrModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 rounded-2xl">
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
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/30 rounded-2xl gap-3">
            <Loader2 size={32} className="animate-spin text-white" />
            <p className="text-white text-sm font-medium">Extraindo texto da imagem...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
