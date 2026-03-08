import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bell, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface ReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteTitle: string;
  existingDate?: string | null;
  existingTime?: string | null;
  onSave: (date: string, time: string) => void;
  onRemove: () => void;
}

export function ReminderModal({ open, onOpenChange, noteTitle, existingDate, existingTime, onSave, onRemove }: ReminderModalProps) {
  const hasReminder = !!existingDate;
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState(existingDate || today);
  const [time, setTime] = useState(existingTime || "09:00");

  useEffect(() => {
    if (!open) return;
    setDate(existingDate || today);
    setTime(existingTime || "09:00");
  }, [open, existingDate, existingTime, today]);

  const handleSave = () => {
    if (!date) return;
    onSave(date, time);
    onOpenChange(false);
  };

  const handleRemove = () => {
    onRemove();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell size={18} style={{ color: hasReminder ? "#F9A825" : "#1A1A2E" }} />
            {hasReminder ? "Lembrete ativo" : "Criar lembrete"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Título</label>
            <p className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>{noteTitle || "Sem título"}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Data</label>
            <Input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Hora</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          {hasReminder && existingDate && existingTime && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: "#FFF8E1", color: "#F57F17" }}
            >
              <Bell size={14} />
              <span>Agendado para {existingDate} às {existingTime}</span>
            </div>
          )}

          <div className="flex gap-2">
            {hasReminder && (
              <Button
                variant="outline"
                onClick={handleRemove}
                className="flex-1 gap-1 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 size={14} /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSave} className="flex-1">
              {hasReminder ? "Atualizar" : "Agendar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
