import { useState } from "react";
import { Note } from "@/hooks/useNotes";
import { Appointment } from "@/hooks/useAppointments";
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface TrashViewProps {
  type: "notes" | "appointments";
  trashedNotes?: Note[];
  trashedAppointments?: Appointment[];
  onRestoreNote?: (id: string) => void;
  onPermanentDeleteNote?: (id: string) => void;
  onEmptyNoteTrash?: () => void;
  onRestoreAppointment?: (id: string) => void;
  onPermanentDeleteAppointment?: (id: string) => void;
  onEmptyAppointmentTrash?: () => void;
  onBack: () => void;
}

export function TrashView({
  type,
  trashedNotes = [],
  trashedAppointments = [],
  onRestoreNote,
  onPermanentDeleteNote,
  onEmptyNoteTrash,
  onRestoreAppointment,
  onPermanentDeleteAppointment,
  onEmptyAppointmentTrash,
  onBack,
}: TrashViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);

  const items = type === "notes"
    ? trashedNotes.map((n) => ({ id: n.id, title: n.title || "Sem título", deletedAt: n.deletedAt!, type: "note" as const }))
    : trashedAppointments.map((a) => ({ id: a.id, title: a.title, deletedAt: a.deletedAt!, type: "appointment" as const }));

  const handleRestore = (id: string) => {
    if (type === "notes") onRestoreNote?.(id);
    else onRestoreAppointment?.(id);
    toast({ title: "✅ Restaurado com sucesso!" });
  };

  const handlePermanentDelete = () => {
    if (!confirmDeleteId) return;
    if (type === "notes") onPermanentDeleteNote?.(confirmDeleteId);
    else onPermanentDeleteAppointment?.(confirmDeleteId);
    setConfirmDeleteId(null);
    toast({ title: "🗑 Excluído definitivamente" });
  };

  const handleEmptyAll = () => {
    if (type === "notes") onEmptyNoteTrash?.();
    else onEmptyAppointmentTrash?.();
    setConfirmEmptyAll(false);
    toast({ title: "🗑 Lixeira esvaziada" });
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#1A1A2E" }}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <h2 className="font-display font-bold text-lg" style={{ color: "#1A1A2E" }}>
          Lixeira
        </h2>
        {items.length > 0 && (
          <button
            onClick={() => setConfirmEmptyAll(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-red-50"
            style={{ color: "#E53935" }}
          >
            Esvaziar tudo
          </button>
        )}
        {items.length === 0 && <div className="w-20" />}
      </div>

      {/* Info banner */}
      <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: "#FFF3E0", border: "1px solid #FFE0B2" }}>
        <span className="text-lg mt-0.5">⏳</span>
        <p className="text-xs font-medium" style={{ color: "#E65100" }}>
          {type === "notes" ? "Notas" : "Compromissos"} na lixeira são apagados definitivamente após 30 dias.
        </p>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: "#F0EDE8" }}>
            <span className="text-3xl">🗑</span>
          </div>
          <p className="mt-4 text-sm font-semibold" style={{ color: "#BDBDBD" }}>Lixeira vazia</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#1A1A2E" }}>{item.title}</p>
                {item.deletedAt && (
                  <p className="text-[11px] mt-0.5" style={{ color: "#999" }}>
                    Apagado em {format(item.deletedAt, "d MMM, HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRestore(item.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-green-50"
                style={{ color: "#2E7D32", border: "1px solid #A5D6A7" }}
              >
                <RotateCcw size={13} /> Recuperar
              </button>
              <button
                onClick={() => setConfirmDeleteId(item.id)}
                className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                style={{ color: "#E53935" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirm permanent delete */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-display">
              <AlertTriangle size={20} /> Excluir definitivamente?
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. {type === "notes" ? "A nota" : "O compromisso"} será apagado para sempre.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="flex-1">Voltar</Button>
            <Button variant="destructive" onClick={handlePermanentDelete} className="flex-1">Excluir para sempre</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm empty all */}
      <Dialog open={confirmEmptyAll} onOpenChange={setConfirmEmptyAll}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-display">
              <AlertTriangle size={20} /> Esvaziar lixeira?
            </DialogTitle>
            <DialogDescription>
              Todos os itens serão excluídos permanentemente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmEmptyAll(false)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={handleEmptyAll} className="flex-1">Esvaziar tudo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
