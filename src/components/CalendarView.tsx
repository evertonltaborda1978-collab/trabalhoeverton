import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Appointment } from "@/hooks/useAppointments";
import { GoogleEvent, useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { format, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addMonths, subMonths, isToday, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Clock, RefreshCw, Unplug, Pencil, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, LayoutList } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ALERT_SOUND_OPTIONS, playAlertSoundPreview, type AlertSoundId } from "@/lib/alertSound";

type ViewMode = "day" | "week" | "month";

interface CalendarViewProps {
  appointments: Appointment[];
  onAdd: (title: string, date: Date, time: string, description: string, alertSound: AlertSoundId) => void;
  onUpdate: (id: string, title: string, date: Date, time: string, description: string, alertSound: AlertSoundId) => void;
  onDelete: (id: string) => void;
  trashedAppointments?: Appointment[];
  onRestoreAppointment?: (id: string) => void;
  onPermanentDeleteAppointment?: (id: string) => void;
  onEmptyAppointmentTrash?: () => void;
}

export function CalendarView({ appointments, onAdd, onUpdate, onDelete, trashedAppointments = [], onRestoreAppointment, onPermanentDeleteAppointment, onEmptyAppointmentTrash }: CalendarViewProps) {
  const [selected, setSelected] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [description, setDescription] = useState("");
  const [alertSound, setAlertSound] = useState<AlertSoundId | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState("");
  const [monthNav, setMonthNav] = useState(new Date());

  const { connected, loading: gcLoading, googleEvents, syncing, connect, disconnect, fetchEvents, pushEvent } = useGoogleCalendar();

  const dayAppointments = appointments.filter((a) => isSameDay(a.date, selected));
  const dayGoogleEvents = googleEvents.filter((e) => {
    try { return isSameDay(new Date(e.date + "T00:00:00"), selected); } catch { return false; }
  });

  const daysWithAppointments = [
    ...appointments.map((a) => a.date),
    ...googleEvents.map((e) => { try { return new Date(e.date + "T00:00:00"); } catch { return null; } }).filter(Boolean) as Date[],
  ];

  // Week days
  const weekDays = useMemo(() => {
    const start = startOfWeek(selected, { locale: ptBR });
    const end = endOfWeek(selected, { locale: ptBR });
    return eachDayOfInterval({ start, end });
  }, [selected]);

  // Month days grid
  const monthDays = useMemo(() => {
    const start = startOfMonth(monthNav);
    const end = endOfMonth(monthNav);
    const firstWeekStart = startOfWeek(start, { locale: ptBR });
    const lastWeekEnd = endOfWeek(end, { locale: ptBR });
    return eachDayOfInterval({ start: firstWeekStart, end: lastWeekEnd });
  }, [monthNav]);

  const getAppointmentsForDay = (day: Date) => {
    const local = appointments.filter((a) => isSameDay(a.date, day));
    const google = googleEvents.filter((e) => {
      try { return isSameDay(new Date(e.date + "T00:00:00"), day); } catch { return false; }
    });
    return { local, google };
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    if (!alertSound) {
      toast({ title: "Escolha um som de alerta", description: "Toque numa das opções antes de salvar.", variant: "destructive" });
      return;
    }
    if (editingId) {
      onUpdate(editingId, title, selected, time, description, alertSound);
      toast({ title: "✅ Compromisso atualizado!" });
    } else {
      onAdd(title, selected, time, description, alertSound);
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

  const openNew = (day?: Date) => {
    if (day) setSelected(day);
    setEditingId(null);
    setTitle("");
    setTime("09:00");
    setDescription("");
    setAlertSound(null);
    setDialogOpen(true);
  };

  const openEdit = (apt: Appointment) => {
    setEditingId(apt.id);
    setTitle(apt.title);
    setTime(apt.time);
    setDescription(apt.description);
    setSelected(apt.date);
    setAlertSound(apt.alertSound);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setTitle("");
    setTime("09:00");
    setDescription("");
    setAlertSound(null);
  };

  const handleDeleteWithConfirm = (id: string) => {
    const apt = appointments.find((a) => a.id === id);
    setConfirmDeleteTitle(apt?.title || "Compromisso");
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (confirmDeleteId) {
      onDelete(confirmDeleteId);
      toast({ title: "✅ Compromisso movido para a lixeira" });
      setConfirmDeleteId(null);
    }
  };

  if (showTrash) {
    return (
      <TrashView
        type="appointments"
        trashedAppointments={trashedAppointments}
        onRestoreAppointment={onRestoreAppointment}
        onPermanentDeleteAppointment={onPermanentDeleteAppointment}
        onEmptyAppointmentTrash={onEmptyAppointmentTrash}
        onBack={() => setShowTrash(false)}
      />
    );
  }

  const renderAppointmentItem = (apt: Appointment, compact = false) => (
    <div key={apt.id} className={cn("group flex items-start gap-2 rounded-xl glass-card animate-fade-in", compact ? "p-2" : "p-3")}>
      <div className="flex items-center gap-1 text-primary mt-0.5 shrink-0">
        <Clock size={compact ? 12 : 14} />
        <span className={cn("font-semibold", compact ? "text-[10px]" : "text-xs")}>{apt.time}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-foreground truncate", compact ? "text-xs" : "text-sm")}>{apt.title}</p>
        {!compact && apt.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{apt.description}</p>
        )}
      </div>
      {!compact && (
        <>
          <button onClick={() => openEdit(apt)} className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => handleDeleteWithConfirm(apt.id)} className="p-1 rounded-md hover:bg-destructive/10 text-destructive transition-colors">
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );

  const renderGoogleEvent = (evt: GoogleEvent, compact = false) => (
    <div key={evt.id} className={cn("flex items-start gap-2 rounded-xl animate-fade-in", compact ? "p-2" : "p-3")} style={{ background: "#E3F2FD", border: "1px solid #90CAF9" }}>
      <div className="flex items-center gap-1 mt-0.5 shrink-0" style={{ color: "#1565C0" }}>
        <Clock size={compact ? 12 : 14} />
        <span className={cn("font-semibold", compact ? "text-[10px]" : "text-xs")}>{evt.time}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className={cn("font-semibold truncate", compact ? "text-xs" : "text-sm")} style={{ color: "#1A1A2E" }}>{evt.title}</p>
          {!compact && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "#BBDEFB", color: "#1565C0" }}>Google</span>}
        </div>
      </div>
    </div>
  );

  // ── WEEK VIEW ──
  const renderWeekView = () => (
    <div className="space-y-1">
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setSelected(new Date(selected.getTime() - 7 * 86400000))} className="p-2 rounded-lg hover:bg-black/5 transition-colors">
          <ChevronLeft size={18} style={{ color: "#666" }} />
        </button>
        <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>
          {format(weekDays[0], "d MMM", { locale: ptBR })} — {format(weekDays[6], "d MMM yyyy", { locale: ptBR })}
        </span>
        <button onClick={() => setSelected(new Date(selected.getTime() + 7 * 86400000))} className="p-2 rounded-lg hover:bg-black/5 transition-colors">
          <ChevronRight size={18} style={{ color: "#666" }} />
        </button>
      </div>

      {weekDays.map((day) => {
        const { local, google } = getAppointmentsForDay(day);
        const hasItems = local.length > 0 || google.length > 0;
        const isSelected = isSameDay(day, selected);
        const today = isToday(day);

        return (
          <div
            key={day.toISOString()}
            className={cn(
              "rounded-xl transition-all cursor-pointer",
              isSelected ? "ring-2 ring-primary/30" : "",
              today ? "bg-primary/5" : ""
            )}
            style={{ border: isSelected ? "1.5px solid #B39DDB" : "1.5px solid #F0F0F0", background: isSelected ? "#F3E5F5" : undefined }}
            onClick={() => setSelected(day)}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold",
                  today ? "bg-primary text-white" : ""
                )} style={!today ? { color: "#1A1A2E" } : undefined}>
                  {format(day, "d")}
                </span>
                <span className="text-xs font-semibold capitalize" style={{ color: "#999" }}>
                  {format(day, "EEEE", { locale: ptBR })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasItems && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                    {local.length + google.length}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); openNew(day); }}
                  className="p-1 rounded-md hover:bg-black/10 transition-colors"
                  title="Adicionar compromisso"
                >
                  <Plus size={14} style={{ color: "#999" }} />
                </button>
              </div>
            </div>
            {hasItems && (
              <div className="px-3 pb-2 space-y-1">
                {local.map((apt) => renderAppointmentItem(apt, true))}
                {google.map((evt) => renderGoogleEvent(evt, true))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── MONTH VIEW ──
  const renderMonthView = () => {
    const weekDayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    return (
      <div>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthNav(subMonths(monthNav, 1))} className="p-2 rounded-lg hover:bg-black/5 transition-colors">
            <ChevronLeft size={18} style={{ color: "#666" }} />
          </button>
          <span className="text-sm font-bold capitalize" style={{ color: "#1A1A2E" }}>
            {format(monthNav, "MMMM yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setMonthNav(addMonths(monthNav, 1))} className="p-2 rounded-lg hover:bg-black/5 transition-colors">
            <ChevronRight size={18} style={{ color: "#666" }} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {weekDayNames.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: "#999" }}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {monthDays.map((day) => {
            const { local, google } = getAppointmentsForDay(day);
            const totalItems = local.length + google.length;
            const inMonth = isSameMonth(day, monthNav);
            const today = isToday(day);
            const isSelected = isSameDay(day, selected);

            return (
              <button
                key={day.toISOString()}
                onClick={() => { setSelected(day); setViewMode("day"); }}
                className={cn(
                  "relative flex flex-col items-center py-1.5 rounded-lg transition-all min-h-[44px]",
                  !inMonth && "opacity-30",
                  isSelected && "ring-2 ring-primary",
                )}
                style={{
                  background: today ? "#E8F5E9" : isSelected ? "#F3E5F5" : undefined,
                }}
              >
                <span className={cn(
                  "text-xs font-semibold",
                  today ? "text-green-700" : ""
                )} style={!today ? { color: inMonth ? "#1A1A2E" : "#CCC" } : undefined}>
                  {format(day, "d")}
                </span>
                {totalItems > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {totalItems <= 3 ? (
                      Array.from({ length: totalItems }).map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < local.length ? "#7C3AED" : "#1565C0" }} />
                      ))
                    ) : (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#7C3AED" }} />
                        <span className="text-[8px] font-bold" style={{ color: "#7C3AED" }}>+{totalItems - 1}</span>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #EBEBEB" }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold" style={{ color: "#1A1A2E" }}>
              {format(selected, "d 'de' MMMM, EEEE", { locale: ptBR })}
            </h3>
            <button onClick={() => openNew(selected)} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors hover:bg-black/5" style={{ color: "#7C3AED" }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>
          {(() => {
            const { local, google } = getAppointmentsForDay(selected);
            if (local.length === 0 && google.length === 0) {
              return <p className="text-xs text-center py-4" style={{ color: "#999" }}>Nenhum compromisso neste dia</p>;
            }
            return (
              <div className="space-y-1.5">
                {local.map((apt) => renderAppointmentItem(apt))}
                {google.map((evt) => renderGoogleEvent(evt))}
              </div>
            );
          })()}
        </div>
      </div>
    );
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
        <div className="flex items-center gap-2">
          {gcLoading && <div className="h-8" />}
          <button
            onClick={() => setShowTrash(true)}
            className="relative p-2 rounded-lg transition-colors hover:bg-black/5"
            title="Lixeira"
          >
            <Trash2 size={18} style={{ color: "#999" }} />
            {trashedAppointments.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold"
                style={{ background: "#E53935" }}
              >
                {trashedAppointments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: "#F5F5F5" }}>
        {([
          { mode: "day" as ViewMode, icon: LayoutList, label: "Dia" },
          { mode: "week" as ViewMode, icon: CalendarRange, label: "Semana" },
          { mode: "month" as ViewMode, icon: CalendarDays, label: "Mês" },
        ]).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => { setViewMode(mode); if (mode === "month") setMonthNav(selected); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
              viewMode === mode
                ? "bg-white shadow-sm"
                : "hover:bg-white/50"
            )}
            style={{ color: viewMode === mode ? "#1A1A2E" : "#999" }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── DAY VIEW ── */}
      {viewMode === "day" && (
        <>
          <div className="glass-card rounded-2xl p-4 mb-4">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => d && setSelected(d)}
              locale={ptBR}
              modifiers={{ hasAppointment: daysWithAppointments }}
              modifiersClassNames={{ hasAppointment: "bg-primary/15 font-bold text-primary" }}
              className="w-full pointer-events-auto"
            />
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm text-foreground">
              {format(selected, "d 'de' MMMM", { locale: ptBR })}
            </h3>
            <Button size="sm" onClick={() => openNew()} className="rounded-xl gap-1.5 text-xs">
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
              {dayAppointments.map((apt) => renderAppointmentItem(apt))}
              {dayGoogleEvents.map((evt) => renderGoogleEvent(evt))}
            </div>
          )}
        </>
      )}

      {/* ── WEEK VIEW ── */}
      {viewMode === "week" && renderWeekView()}

      {/* ── MONTH VIEW ── */}
      {viewMode === "month" && renderMonthView()}

      {/* New/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="font-semibold" />
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "#666" }}>
              <CalendarDays size={14} />
              <span>{format(selected, "d 'de' MMMM, yyyy", { locale: ptBR })}</span>
            </div>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <Textarea placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="resize-none" />
            <div>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: "#9E9E9E" }}>SOM DO ALERTA (toque para ouvir e escolher)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALERT_SOUND_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setAlertSound(opt.id); playAlertSoundPreview(opt.id); }}
                    className="text-left px-2.5 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={
                      alertSound === opt.id
                        ? { background: "#1A1A2E", color: "#FFF" }
                        : { background: "rgba(0,0,0,0.05)", border: "1px solid #E0E0E0", color: "#555" }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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

      {/* Delete Confirmation Modal */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              🗑 Mover para a lixeira?
            </DialogTitle>
            <DialogDescription>
              O compromisso pode ser recuperado em até 30 dias.
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
    </div>
  );
}
