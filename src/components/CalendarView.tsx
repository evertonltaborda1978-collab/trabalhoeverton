import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Appointment } from "@/hooks/useAppointments";
import { GoogleEvent, useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Clock, RefreshCw, Unplug, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { TrashView } from "./TrashView";

interface CalendarViewProps {
  appointments: Appointment[];
  onAdd: (title: string, date: Date, time: string, description: string) => void;
  onUpdate: (id: string, title: string, date: Date, time: string, description: string) => void;
  onDelete: (id: string) => void;
  trashedAppointments?: Appointment[];
  onRestoreAppointment?: (id: string) => void;
  onPermanentDeleteAppointment?: (id: string) => void;
  onEmptyAppointmentTrash?: () => void;
}

export function CalendarView({ appointments, onAdd, onUpdate, onDelete }: CalendarViewProps) {
  const [selected, setSelected] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [description, setDescription] = useState("");

  const { connected, loading: gcLoading, googleEvents, syncing, connect, disconnect, fetchEvents, pushEvent } = useGoogleCalendar();

  const dayAppointments = appointments.filter((a) => isSameDay(a.date, selected));
  const dayGoogleEvents = googleEvents.filter((e) => {
    try { return isSameDay(new Date(e.date + "T00:00:00"), selected); } catch { return false; }
  });

  const daysWithAppointments = [
    ...appointments.map((a) => a.date),
    ...googleEvents.map((e) => { try { return new Date(e.date + "T00:00:00"); } catch { return null; } }).filter(Boolean) as Date[],
  ];

  const handleSave = async () => {
    if (!title.trim()) return;

    if (editingId) {
      onUpdate(editingId, title, selected, time, description);
      toast({ title: "✅ Compromisso atualizado!" });
    } else {
      onAdd(title, selected, time, description);

      // Also push to Google Calendar if connected
      if (connected) {
        const dateStr = format(selected, "yyyy-MM-dd");
        const ok = await pushEvent(title, dateStr, time, description);
        if (ok) {
          toast({ title: "📅 Sincronizado com Google Agenda!" });
          fetchEvents();
        }
      }
    }

    closeDialog();
  };

  const openEdit = (apt: Appointment) => {
    setEditingId(apt.id);
    setTitle(apt.title);
    setTime(apt.time);
    setDescription(apt.description);
    setSelected(apt.date);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setTitle("");
    setTime("09:00");
    setDescription("");
  };

  return (
    <div className="animate-fade-in">
      {/* Google Calendar connection */}
      <div className="mb-3 flex items-center justify-between">
        {!gcLoading && (
          connected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10" stroke="currentColor" strokeWidth="2"/><path d="M8 12l2.5 2.5L14 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Google Agenda conectada
              </div>
              <button onClick={() => fetchEvents()} disabled={syncing} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" title="Sincronizar">
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} style={{ color: "#999" }} />
              </button>
              <button onClick={disconnect} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Desconectar">
                <Unplug size={14} style={{ color: "#E53935" }} />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:shadow-md"
              style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", color: "#1A1A2E" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Conectar Google Agenda
            </button>
          )
        )}
        {gcLoading && <div className="h-8" />}
      </div>

      <div className="glass-card rounded-2xl p-4 mb-4">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && setSelected(d)}
          locale={ptBR}
          modifiers={{ hasAppointment: daysWithAppointments }}
          modifiersClassNames={{ hasAppointment: "bg-primary/15 font-bold text-primary" }}
          className="w-full"
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-sm text-foreground">
          {format(selected, "d 'de' MMMM", { locale: ptBR })}
        </h3>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="rounded-xl gap-1.5 text-xs">
          <Plus size={14} /> Compromisso
        </Button>
      </div>

      {dayAppointments.length === 0 && dayGoogleEvents.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-secondary mb-3">
            <span className="text-2xl">📅</span>
          </div>
          <p className="text-sm">Nenhum compromisso</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Local appointments */}
          {dayAppointments.map((apt) => (
            <div key={apt.id} className="group flex items-start gap-3 p-3 rounded-xl glass-card animate-fade-in">
              <div className="flex items-center gap-1.5 text-primary mt-0.5">
                <Clock size={14} />
                <span className="text-xs font-semibold">{apt.time}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{apt.title}</p>
                {apt.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{apt.description}</p>
                )}
              </div>
              <button onClick={() => openEdit(apt)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary">
                <Pencil size={14} />
              </button>
              <button onClick={() => onDelete(apt.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Google events */}
          {dayGoogleEvents.map((evt) => (
            <div key={evt.id} className="flex items-start gap-3 p-3 rounded-xl animate-fade-in" style={{ background: "#E3F2FD", border: "1px solid #90CAF9" }}>
              <div className="flex items-center gap-1.5 mt-0.5" style={{ color: "#1565C0" }}>
                <Clock size={14} />
                <span className="text-xs font-semibold">{evt.time}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate" style={{ color: "#1A1A2E" }}>{evt.title}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#BBDEFB", color: "#1565C0" }}>Google</span>
                </div>
                {evt.description && (
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "#666" }}>{evt.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="font-semibold" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <Textarea placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="resize-none" />
            {connected && !editingId && (
              <p className="text-[11px] font-medium flex items-center gap-1" style={{ color: "#4CAF50" }}>
                ✓ Será sincronizado com Google Agenda
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} className="flex-1">{editingId ? "Salvar" : "Agendar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
