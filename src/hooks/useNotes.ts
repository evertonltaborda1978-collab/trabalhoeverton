import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Note {
  id: string;
  title: string;
  content: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  color: string;
}

const COLORS = [
  "bg-yellow-100",
  "bg-blue-100",
  "bg-green-100",
  "bg-pink-100",
  "bg-orange-100",
  "bg-purple-100",
];

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setNotes(
        data.map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          images: n.images || [],
          createdAt: new Date(n.created_at),
          updatedAt: new Date(n.updated_at),
          color: n.color || COLORS[0],
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = useCallback(
    async (title: string, content: string, images: string[] = [], color?: string) => {
      if (!user) return;
      const noteColor = color || COLORS[Math.floor(Math.random() * COLORS.length)];
      const { data } = await supabase
        .from("notes")
        .insert({ user_id: user.id, title, content, images, color: noteColor })
        .select()
        .single();

      if (data) {
        const note: Note = {
          id: data.id,
          title: data.title,
          content: data.content,
          images: data.images || [],
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
          color: data.color,
        };
        setNotes((prev) => [note, ...prev]);
        return note;
      }
    },
    [user]
  );

  const deleteNote = useCallback(async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateNote = useCallback(
    async (id: string, title: string, content: string, images?: string[], color?: string) => {
      const updates: any = { title, content };
      if (images !== undefined) updates.images = images;
      if (color !== undefined) updates.color = color;

      await supabase.from("notes").update(updates).eq("id", id);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, title, content, images: images ?? n.images, color: color ?? n.color, updatedAt: new Date() }
            : n
        )
      );
    },
    []
  );

  return { notes, addNote, deleteNote, updateNote, loading };
}
