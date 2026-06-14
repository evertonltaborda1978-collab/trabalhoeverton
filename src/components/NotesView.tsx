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

export function NotesView({ notes, onAdd, onDelete, onUpdate, onSetReminder, onTogglePin, onLockNote, onUnlockNote, onVerifyPin, onAddAppointment, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, trashedNotes, onRestoreNote, onPermanentDeleteNote, onEmptyTrash }: NotesViewProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

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
