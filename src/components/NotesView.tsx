import { useState, useRef, useEffect, useCallback } from "react";
import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";
import { ReminderModal } from "./ReminderModal";
import { LockNoteModal } from "./LockNoteModal";
import { TrashView } from "./TrashView";
import { Note, SyncStatus } from "@/hooks/useNotes";
import { Search, Cloud, CloudOff, RefreshCw, Download, Upload, Mic, MicOff, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RelatorioTurno } from "./RelatorioTurno";
import { RelatorioRebobinadeira } from "./RelatorioRebobinadeira";
import { ClipboardList } from "lucide-react";

export { getFontClass, getSizeClass } from "./NoteEditor";

interface NotesViewProps {
  notes: Note[];
  onAdd: (title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string, status?: "rascunho" | "publicada") => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string, status?: "rascunho" | "publicada") => void;
  onSetReminder: (id: string, date: string | null, time: string | null) => void;
  onTogglePin: (id: string) => void;
  onLockNote: (id: string, pin: string) => Promise<boolean>;
  onUnlockNote: (id: string, pin: string) => Promise<boolean>;
  onVerifyPin: (id: string, pin: string) => Promise<unknown | null>;
  onAddAppointment?: (title: string, date: Date, time: string, description: string) => void;
  onRefresh?: () => void;
  syncStatus: SyncStatus;
  draftCount: number;
  exportBackup: () => boolean;
  importBackup: (file: File) => Promise<number>;
  shouldRemindBackup: () => boolean;
  trashedNotes: Note[];
  onRestoreNote: (id: string) => void;
  onPermanentDeleteNote: (id: string) => void;
  onEmptyTrash: () => void;
}

export function NotesView({ notes, onAdd, onDelete, onUpdate, onSetReminder, onTogglePin, onLockNote, onUnlockNote, onVerifyPin, onAddAppointment, onRefresh, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, trashedNotes, onRestoreNote, onPermanentDeleteNote, onEmptyTrash }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [relatorioInitialState, setRelatorioInitialState] = useState<any>(null);
  const [showRebobinadeira, setShowRebobinadeira] = useState(false);
  const [rebobInitialState, setRebobInitialState] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try { await onRefresh(); } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  // Editor always opens in read-only mode; user toggles to edit via pencil icon
  const [editorReadOnly, setEditorReadOnly] = useState(true);

  // Reminder modal
  const [reminderNote, setReminderNote] = useState<Note | null>(null);
  // Lock modal
  const [lockNote, setLockNote] = useState<Note | null>(null);
  const [lockMode, setLockMode] = useState<"set" | "unlock" | "manage">("set");
  // For unlocking to open editor
  const [pendingUnlockNote, setPendingUnlockNote] = useState<Note | null>(null);

  // Font size preference
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">(() => {
    return (localStorage.getItem("notes_font_size") as "sm" | "md" | "lg" | "xl") || "md";
  });
  const changeFontSize = (size: "sm" | "md" | "lg" | "xl") => {
    setFontSize(size);
    localStorage.setItem("notes_font_size", size);
  };
  const fontSizeMap = { sm: 12, md: 14, lg: 18, xl: 22 };

  // Voice search
  const handleVoiceResult = useCallback((text: string) => {
    setSearch((prev) => (prev + " " + text).trim());
  }, []);
  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useSpeechRecognition(handleVoiceResult);

  // Backup reminder - show once on first open, auto-dismiss
  useEffect(() => {
    const shownKey = "backup_reminder_shown_session";
    if (sessionStorage.getItem(shownKey)) return;
    if (!shouldRemindBackup()) return;
    
    sessionStorage.setItem(shownKey, "true");
    const timer = setTimeout(() => {
      toast({
        title: "📦 Hora do backup!",
        description: "Faz mais de uma semana desde seu último backup. Que tal exportar suas notas?",
        duration: 6000,
      });
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect shared content from other apps (via Share Target API)
  const [sharedData, setSharedData] = useState<{ title: string; content: string } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("shared_note_data");
      if (raw) {
        sessionStorage.removeItem("shared_note_data");
        const data = JSON.parse(raw);
        if (data.title || data.content) {
          setSharedData(data);
          // Open editor with pre-filled content
          setEditingNote(null);
          setEditorReadOnly(false);
          setDialogOpen(true);
        }
      }
    } catch {}
  }, []);

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditingNote(null); setEditorReadOnly(false); setDialogOpen(true); };

  const openEdit = (note: Note) => {
    // If locked, unlock first
    if (note.isLocked) {
      setPendingUnlockNote(note);
      setLockNote(note);
      setLockMode("unlock");
      return;
    }
    // Detectar nota de Rebobinadeira — abre sempre pelo título
    if (note.title && note.title.includes("Rebobinadeira")) {
      const stateKey = `rebobinadeira_state_${note.title.replace(/\s/g, "_")}`;
      const raw = localStorage.getItem(stateKey);
      if (raw) { try { setRebobInitialState(JSON.parse(raw)); } catch {} }
      setShowRebobinadeira(true);
      return;
    }
    // Detectar nota de Relatório de Turno — abre sempre pelo título
    if (note.title && (note.title.includes("Relatório") || note.title.includes("Tombador"))) {
      const stateKey = `relatorio_state_${note.title.replace(/\s/g, "_")}`;
      const raw = localStorage.getItem(stateKey);
      if (raw) { try { setRelatorioInitialState(JSON.parse(raw)); } catch {} }
      const match2 = note.content.match(/<!--relatorio-turno-state:([\s\S]*?)-->/);
      if (match2) { try { setRelatorioInitialState(JSON.parse(match2[1])); } catch {} }
      setShowRelatorio(true);
      return;
    }
    // Always open in read-only mode
    setEditorReadOnly(true);
    setEditingNote(note);
    setDialogOpen(true);
  };

  const handleSave = (title: string, content: string, images: string[], color: string, fontFamily: string, fontSize: string, status: "rascunho" | "publicada") => {
    if (editingNote) {
      onUpdate(editingNote.id, title, content, images, color, fontFamily, fontSize, status);
    } else {
      onAdd(title, content, images, color, fontFamily, fontSize, status);
    }
  };

  // Bell click
  const handleBellClick = (note: Note) => setReminderNote(note);

  // Pin click
  const handlePinClick = (note: Note) => {
    onTogglePin(note.id);
    toast({ title: note.isPinned ? "📌 Nota desafixada" : "📌 Nota fixada" });
  };

  const handleReminderSave = (date: string, time: string) => {
    if (!reminderNote) return;
    onSetReminder(reminderNote.id, date, time);
    // Also create appointment in agenda
    if (onAddAppointment) {
      onAddAppointment(reminderNote.title || "Lembrete", new Date(date + "T00:00:00"), time, `Lembrete da nota: ${reminderNote.title}`);
    }
    toast({ title: "🔔 Lembrete agendado!", description: `${date} às ${time}` });
  };

  const handleReminderRemove = () => {
    if (!reminderNote) return;
    onSetReminder(reminderNote.id, null, null);
    toast({ title: "Lembrete removido" });
  };

  // Lock click
  const handleLockClick = (note: Note) => {
    setLockNote(note);
    setLockMode(note.isLocked ? "manage" : "set");
  };

  const handleSetPin = async (pin: string) => {
    if (!lockNote) return;
    const ok = await onLockNote(lockNote.id, pin);
    if (ok) toast({ title: "🔒 Nota protegida!", description: "Conteúdo criptografado neste dispositivo" });
  };

  const handleUnlockAttempt = async (pin: string): Promise<boolean> => {
    if (!lockNote) return false;
    const payload = await onVerifyPin(lockNote.id, pin);
    if (!payload) return false;
    // If unlocking to open editor, give the editor a temporarily decrypted note
    if (pendingUnlockNote?.id === lockNote.id) {
      setEditingNote({ ...pendingUnlockNote, ...(payload as any), isLocked: true });
      setEditorReadOnly(true);
      setDialogOpen(true);
      setPendingUnlockNote(null);
    }
    return true;
  };

  const handleRemoveLock = async () => {
    if (!lockNote) return;
    // mode 'manage' first verifies PIN via handleUnlockAttempt; here we permanently unlock using stored decrypted state
    // The modal calls onUnlock(pin) -> handleUnlockAttempt; on success the note is decrypted in-memory.
    // To persist removal, we need the PIN — handled in handleManageRemove below.
  };

  const handleManageRemove = async (pin: string): Promise<boolean> => {
    if (!lockNote) return false;
    const ok = await onUnlockNote(lockNote.id, pin);
    if (ok) toast({ title: "🔓 Proteção removida" });
    return ok;
  };

  const handleForceReset = async () => {
    if (!lockNote) return;
    onUpdate(lockNote.id, lockNote.title, "", [], lockNote.color, "default", "medium", "publicada");
    await onUnlockNote(lockNote.id, "000000").catch(() => {});
    toast({ title: "🔓 Proteção removida", description: "Conteúdo apagado e nota desbloqueada." });
    setLockNote(null);
    setPendingUnlockNote(null);
  };

  const handleExport = () => {
    exportBackup();
    toast({ title: "Backup exportado ✓", description: "Arquivo JSON salvo com sucesso." });
    setShowBackupMenu(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const count = await importBackup(file);
      toast({ title: `${count} notas importadas com sucesso!` });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message });
    }
    setShowBackupMenu(false);
  };

  const syncIcon = () => {
    if (syncStatus === "synced") return <Cloud size={16} style={{ color: "#4CAF50" }} />;
    if (syncStatus === "syncing") return <RefreshCw size={16} className="animate-spin" style={{ color: "#F9A825" }} />;
    return <CloudOff size={16} style={{ color: "#BDBDBD" }} />;
  };

  // Handle delete with confirmation
  const handleDeleteWithConfirm = (id: string) => {
    const note = notes.find((n) => n.id === id);
    setConfirmDeleteTitle(note?.title || "Sem título");
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (confirmDeleteId) {
      onDelete(confirmDeleteId);
      toast({ title: "✅ Nota movida para a lixeira" });
      setConfirmDeleteId(null);
    }
  };

  if (showTrash) {
    return (
      <TrashView
        type="notes"
        trashedNotes={trashedNotes}
        onRestoreNote={onRestoreNote}
        onPermanentDeleteNote={onPermanentDeleteNote}
        onEmptyNoteTrash={onEmptyTrash}
        onBack={() => setShowTrash(false)}
      />
    );
  }

  return (
    <div>
      {/* Sync indicator + draft counter + trash */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBackupMenu(!showBackupMenu)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-[#EBEBEB] shadow-sm transition-opacity hover:opacity-70"
            title={syncStatus === "synced" ? "Sincronizado" : syncStatus === "syncing" ? "Sincronizando..." : "Sem conexão"}
          >
            {syncIcon()}
          </button>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={syncStatus === "syncing" || isRefreshing}
              className="flex items-center justify-center w-8 h-8 rounded-full shadow-sm transition-all disabled:opacity-100"
              style={{
                background: isRefreshing ? "#2D9E7F" : "#FFFFFF",
                border: isRefreshing ? "1px solid #2D9E7F" : "1px solid #EBEBEB",
              }}
              title={isRefreshing ? "Atualizando notas..." : "Atualizar notas"}
            >
              <RefreshCw
                size={14}
                className={isRefreshing || syncStatus === "syncing" ? "animate-spin" : ""}
                style={{ color: isRefreshing ? "#FFFFFF" : "#9E9E9E" }}
              />
            </button>
          )}
          {draftCount > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: "#F9A825" }}>
              ✏️ {draftCount} rascunho{draftCount > 1 ? "s" : ""} pendente{draftCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowTrash(true)}
          className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white border border-[#EBEBEB] shadow-sm transition-colors hover:bg-black/5"
          title="Lixeira"
        >
          <Trash2 size={18} style={{ color: "#999" }} />
          {trashedNotes.length > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold"
              style={{ background: "#E53935" }}
            >
              {trashedNotes.length}
            </span>
          )}
        </button>
      </div>

      {/* Backup dropdown */}
      {showBackupMenu && (
        <div className="mb-3 rounded-xl p-3 flex flex-col gap-2" style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
            <Download size={16} /> Exportar backup (.json)
          </button>
          <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
            <Upload size={16} /> Importar backup
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div
          className="relative flex-1 transition-all duration-200"
          style={{
            border: searchFocused || isListening ? "1.5px solid #B39DDB" : "1.5px solid #EBEBEB",
            borderRadius: 16,
            background: "#FFFFFF",
            boxShadow: searchFocused || isListening ? "0 0 0 3px rgba(179,157,219,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)" : "0 2px 8px -2px rgba(0,0,0,0.04)",
          }}
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#BDBDBD" }} />
          <input
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full pl-9 pr-10 py-2.5 bg-transparent border-0 outline-none text-sm font-medium"
            style={{ color: "#1A1A2E", borderRadius: 16 }}
          />
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all duration-200"
              style={{ color: isListening ? "#E53935" : "#BDBDBD", background: isListening ? "rgba(229,57,53,0.1)" : "transparent" }}
              title={isListening ? "Parar busca por voz" : "Buscar por voz"}
            >
              {isListening ? (
                <div className="relative">
                  <MicOff size={16} />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                </div>
              ) : (
                <Mic size={16} />
              )}
            </button>
          )}
        </div>
        <button
          onClick={() => { localStorage.removeItem("relatorio_turno_rascunho"); setRelatorioInitialState(null); setShowRelatorio(true); }}
          className="shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ width: 46, height: 46, borderRadius: 14, background: "#F57C00", boxShadow: "0 4px 14px -2px rgba(245,124,0,0.35)" }}
          title="Relatório de Turno"
        >
          <ClipboardList size={20} color="white" />
        </button>
        <button
          onClick={openNew}
          className="shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ width: 46, height: 46, borderRadius: 14, background: "#1A1A2E", boxShadow: "0 4px 14px -2px rgba(26,26,46,0.35)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4V16M4 10H16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: "#BDBDBD", fontSize: 12 }}>
          {filtered.length} {filtered.length === 1 ? "nota" : "notas"}
        </p>
        <div className="flex items-center gap-1.5">
          {(["sm", "md", "lg", "xl"] as const).map((size, i) => (
            <button
              key={size}
              onClick={() => changeFontSize(size)}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{
                width: 28, height: 28,
                background: fontSize === size ? "#1A1A2E" : "rgba(0,0,0,0.04)",
                border: fontSize === size ? "none" : "0.5px solid #E0E0E0",
                fontSize: 9 + i * 2,
                fontWeight: 700,
                color: fontSize === size ? "white" : "#888",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              A
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: "#F0EDE8" }}>
            <span className="text-3xl">📝</span>
          </div>
          <p className="mt-4 text-sm font-semibold" style={{ color: "#BDBDBD" }}>
            {search ? "Nenhuma nota encontrada para essa busca" : "Nenhuma nota encontrada"}
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: "#D5D5D5" }}>
            {search ? "Tente outro termo" : "Toque em + para criar uma nova nota"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5" style={{ transform: "none", animation: "none", visibility: (dialogOpen || !!confirmDeleteId) ? "hidden" : "visible", opacity: (dialogOpen || !!confirmDeleteId) ? 0 : 1, transition: "opacity 0.15s ease" }}>
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={handleDeleteWithConfirm}
              onClick={openEdit}
              onBellClick={handleBellClick}
              onLockClick={handleLockClick}
              onPinClick={handlePinClick}
              searchQuery={search}
              fontSize={fontSizeMap[fontSize]}
            />
          ))}
        </div>
      )}

      <NoteEditor
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setSharedData(null); }}
        editingNote={editingNote}
        readOnly={editorReadOnly}
        onSetReadOnly={setEditorReadOnly}
        onSave={handleSave}
        initialSharedData={sharedData}
        onSchedule={onAddAppointment ? (noteTitle, noteContent, date, time) => {
          onAddAppointment(noteTitle || "Nota sem título", new Date(date + "T00:00:00"), time, noteContent);
        } : undefined}
      />

      {/* Reminder Modal */}
      <ReminderModal
        open={!!reminderNote}
        onOpenChange={(v) => { if (!v) setReminderNote(null); }}
        noteTitle={reminderNote?.title || ""}
        existingDate={reminderNote?.reminderDate}
        existingTime={reminderNote?.reminderTime}
        onSave={handleReminderSave}
        onRemove={handleReminderRemove}
      />

      {/* Lock Modal */}
      <LockNoteModal
        open={!!lockNote}
        onOpenChange={(v) => { if (!v) { setLockNote(null); setPendingUnlockNote(null); } }}
        mode={lockMode}
        onSetPin={handleSetPin}
        onUnlock={lockMode === "manage" ? handleManageRemove : handleUnlockAttempt}
        onRemoveLock={handleRemoveLock}
        onForceReset={handleForceReset}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              🗑 Mover para a lixeira?
            </DialogTitle>
            <DialogDescription>
              A nota pode ser recuperada em até 30 dias.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-semibold px-1" style={{ color: "#1A1A2E" }}>
            "{confirmDeleteTitle}"
          </p>
          <div className="flex gap-2 mt-1">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} className="flex-1 gap-1">
              <Trash2 size={14} /> Mover para lixeira
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Relatório de Turno */}
      {showRelatorio && (
        <RelatorioTurno
          initialState={relatorioInitialState}
          onOpenRebobinadeira={() => { setShowRelatorio(false); setShowRebobinadeira(true); }}
          onClose={() => { setShowRelatorio(false); setRelatorioInitialState(null); }}
          onSaveAsNote={(title, content) => {
            // Atualiza nota existente se título já existe, senão cria nova
            const existing = notes.find(n => n.title === title);
            if (existing) {
              onUpdate(existing.id, title, content, [], existing.color || "bg-blue-100", "default", "medium", "publicada");
            } else {
              onAdd(title, content, [], "bg-blue-100", "default", "medium", "publicada");
            }
            setShowRelatorio(false);
            setRelatorioInitialState(null);
          }}
        />
      )}

      {showRebobinadeira && (
        <RelatorioRebobinadeira
          initialState={rebobInitialState}
          onClose={() => { setShowRebobinadeira(false); setRebobInitialState(null); }}
          onSaveAsNote={(title, content) => {
            const existing = notes.find(n => n.title === title);
            if (existing) {
              onUpdate(existing.id, title, content, [], existing.color || "bg-green-100", "default", "medium", "publicada");
            } else {
              onAdd(title, content, [], "bg-green-100", "default", "medium", "publicada");
            }
            setShowRebobinadeira(false);
            setRebobInitialState(null);
          }}
        />
      )}
    </div>
  );
}
