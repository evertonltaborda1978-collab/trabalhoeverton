import { useState, useRef, useEffect } from "react";
import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";
import { Note, SyncStatus } from "@/hooks/useNotes";
import { Search, Cloud, CloudOff, RefreshCw, Download, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export { getFontClass, getSizeClass } from "./NoteEditor";

interface NotesViewProps {
  notes: Note[];
  onAdd: (title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string, status?: "rascunho" | "publicada") => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string, status?: "rascunho" | "publicada") => void;
  syncStatus: SyncStatus;
  draftCount: number;
  exportBackup: () => boolean;
  importBackup: (file: File) => Promise<number>;
  shouldRemindBackup: () => boolean;
}

export function NotesView({ notes, onAdd, onDelete, onUpdate, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Backup reminder
  useEffect(() => {
    if (shouldRemindBackup()) {
      const timer = setTimeout(() => {
        toast({
          title: "📦 Hora do backup!",
          description: "Faz mais de uma semana desde seu último backup. Que tal exportar suas notas?",
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [shouldRemindBackup]);

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingNote(null);
    setDialogOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setDialogOpen(true);
  };

  const handleSave = (
    title: string,
    content: string,
    images: string[],
    color: string,
    fontFamily: string,
    fontSize: string,
    status: "rascunho" | "publicada"
  ) => {
    if (editingNote) {
      onUpdate(editingNote.id, title, content, images, color, fontFamily, fontSize, status);
    } else {
      onAdd(title, content, images, color, fontFamily, fontSize, status);
    }
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

  return (
    <div className="animate-fade-in">
      {/* Sync indicator + draft counter */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBackupMenu(!showBackupMenu)}
            className="flex items-center gap-1 transition-opacity hover:opacity-70"
            title={syncStatus === "synced" ? "Sincronizado" : syncStatus === "syncing" ? "Sincronizando..." : "Sem conexão"}
          >
            {syncIcon()}
          </button>
          {draftCount > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: "#F9A825" }}>
              ✏️ {draftCount} rascunho{draftCount > 1 ? "s" : ""} pendente{draftCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Backup dropdown */}
      {showBackupMenu && (
        <div
          className="mb-3 rounded-xl p-3 flex flex-col gap-2"
          style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
        >
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            style={{ color: "#1A1A2E" }}
          >
            <Download size={16} /> Exportar backup (.json)
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            style={{ color: "#1A1A2E" }}
          >
            <Upload size={16} /> Importar backup
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div
          className="relative flex-1 transition-all duration-200"
          style={{
            border: searchFocused ? "1.5px solid #B39DDB" : "1.5px solid #EBEBEB",
            borderRadius: 16,
            background: "#FFFFFF",
            boxShadow: searchFocused
              ? "0 0 0 3px rgba(179,157,219,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)"
              : "0 2px 8px -2px rgba(0,0,0,0.04)",
          }}
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#BDBDBD" }} />
          <input
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none text-sm font-medium"
            style={{ color: "#1A1A2E", borderRadius: 16 }}
          />
        </div>
        <button
          onClick={openNew}
          className="shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: "#1A1A2E",
            boxShadow: "0 4px 14px -2px rgba(26,26,46,0.35)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4V16M4 10H16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Note count */}
      <p className="text-xs font-semibold mb-4" style={{ color: "#BDBDBD", fontSize: 12 }}>
        {filtered.length} {filtered.length === 1 ? "nota" : "notas"}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: "#F0EDE8" }}
          >
            <span className="text-3xl">📝</span>
          </div>
          <p className="mt-4 text-sm font-semibold" style={{ color: "#BDBDBD" }}>
            Nenhuma nota encontrada
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: "#D5D5D5" }}>
            Toque em + para criar uma nova nota
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((note, i) => (
            <NoteCard key={note.id} note={note} onDelete={onDelete} onClick={openEdit} index={i} />
          ))}
        </div>
      )}

      <NoteEditor
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingNote={editingNote}
        onSave={handleSave}
      />
    </div>
  );
}
