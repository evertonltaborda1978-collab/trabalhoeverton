import { useState } from "react";
import { MoonPhaseWidget } from "@/components/MoonPhaseWidget";
import { BottomNav } from "@/components/BottomNav";
import { NotesView } from "@/components/NotesView";
import { CalendarView } from "@/components/CalendarView";
import { AudioView } from "@/components/AudioView";
import { LocationView } from "@/components/LocationView";
import { useNotes } from "@/hooks/useNotes";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

type Tab = "notes" | "calendar" | "audio" | "location";

const titles: Record<Tab, string> = {
  notes: "Minhas Notas",
  calendar: "Agenda",
  audio: "Gravação",
  location: "Localização",
};

const Index = () => {
  const [tab, setTab] = useState<Tab>("notes");
  const { notes, addNote, deleteNote, updateNote } = useNotes();
  const { appointments, addAppointment, deleteAppointment } = useAppointments();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-foreground">
              {titles[tab]}
            </h1>
            <div className="flex items-center gap-2">
              <MoonPhaseWidget />
              <button
                onClick={signOut}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 pt-4">
        {tab === "notes" && (
          <NotesView
            notes={notes}
            onAdd={addNote}
            onDelete={deleteNote}
            onUpdate={updateNote}
          />
        )}
        {tab === "calendar" && (
          <CalendarView
            appointments={appointments}
            onAdd={addAppointment}
            onDelete={deleteAppointment}
          />
        )}
        {tab === "audio" && <AudioView />}
        {tab === "location" && <LocationView />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
};

export default Index;
