import { useState, useCallback } from "react";

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
  "bg-surface-warm",
  "bg-surface-cool",
  "bg-secondary",
  "bg-card",
];

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([
    {
      id: "1",
      title: "Bem-vindo! 👋",
      content: "Esta é sua secretária virtual. Use-a para organizar suas anotações e compromissos.",
      images: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      color: COLORS[0],
    },
    {
      id: "2",
      title: "Lista de compras",
      content: "Café, leite, pão integral, frutas, ovos",
      images: [],
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
      color: COLORS[1],
    },
    {
      id: "3",
      title: "Ideias para o projeto",
      content: "Pesquisar novas tendências de design. Revisar paleta de cores. Preparar apresentação.",
      images: [],
      createdAt: new Date(Date.now() - 172800000),
      updatedAt: new Date(Date.now() - 172800000),
      color: COLORS[2],
    },
  ]);

  const addNote = useCallback((title: string, content: string, images: string[] = []) => {
    const note: Note = {
      id: Date.now().toString(),
      title,
      content,
      images,
      createdAt: new Date(),
      updatedAt: new Date(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    setNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateNote = useCallback((id: string, title: string, content: string, images?: string[]) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, title, content, images: images ?? n.images, updatedAt: new Date() } : n
      )
    );
  }, []);

  return { notes, addNote, deleteNote, updateNote };
}
