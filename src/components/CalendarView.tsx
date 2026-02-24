import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Appointment } from "@/hooks/useAppointments";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CalendarViewProps {
  appointments: Appointment[];
  onAdd: (title: string, date: Date, time: string, description: string) => void;
  onDelete: (id: string) => void;
}

export function CalendarView({ appointments, onAdd, onDelete }: CalendarViewProps) {
  const [selected, setSelected] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [description, setDescription] = useState("");

  const dayAppointments = appointments.filter((a) =>
    isSameDay(a.date, selected)
  );

  const daysWithAppointments = appointments.map((a) => a.date);

  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd(title, selected, time, description);
    setDialogOpen(false);
    setTitle("");
    setTime("09:00");
    setDescription("");
  };

  return (
    <div className="animate-fade-in">
      <div className="glass-card rounded-2xl p-4 mb-4">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && setSelected(d)}
          locale={ptBR}
          modifiers={{ hasAppointment: daysWithAppointments }}
          modifiersClassNames={{
            hasAppointment: "bg-primary/15 font-bold text-primary",
          }}
          className="w-full"
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-sm text-foreground">
          {format(selected, "d 'de' MMMM", { locale: ptBR })}
        </h3>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="rounded-xl gap-1.5 text-xs"
        >
          <Plus size={14} />
          Compromisso
        </Button>
      </div>

      {dayAppointments.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-secondary mb-3">
            <span className="text-2xl">📅</span>
          </div>
          <p className="text-sm">Nenhum compromisso</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayAppointments.map((apt) => (
            <div
              key={apt.id}
              className="group flex items-start gap-3 p-3 rounded-xl glass-card animate-fade-in"
            >
              <div className="flex items-center gap-1.5 text-primary mt-0.5">
                <Clock size={14} />
                <span className="text-xs font-semibold">{apt.time}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{apt.title}</p>
                {apt.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {apt.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => onDelete(apt.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo compromisso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-semibold"
            />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <Textarea
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <Button onClick={handleAdd} className="w-full">
              Agendar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
