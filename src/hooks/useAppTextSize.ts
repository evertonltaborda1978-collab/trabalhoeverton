import { useCallback, useEffect, useState } from "react";

// Controle único de "tamanho de texto" para o app inteiro (todas as abas),
// diferente do controle de fonte específico das Notas. Usa a propriedade
// CSS "zoom" (suportada no Chrome e no WebView do Android, que é onde este
// app roda) aplicada no elemento raiz — assim aumenta/diminui tudo de uma
// vez (texto, ícones, espaçamentos) sem precisar mudar centenas de lugares
// no código que usam tamanho fixo em pixels.
export type AppTextSize = "sm" | "md" | "lg";

const STORAGE_KEY = "app_text_size";
const ZOOM_BY_SIZE: Record<AppTextSize, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
};

export const APP_TEXT_SIZE_LABELS: { id: AppTextSize; label: string }[] = [
  { id: "sm", label: "Pequeno" },
  { id: "md", label: "Médio" },
  { id: "lg", label: "Grande" },
];

function applyZoom(size: AppTextSize) {
  const root = document.getElementById("root") as HTMLElement | null;
  if (root) {
    (root.style as any).zoom = String(ZOOM_BY_SIZE[size]);
  }
}

export function useAppTextSize() {
  const [size, setSizeState] = useState<AppTextSize>(
    () => (localStorage.getItem(STORAGE_KEY) as AppTextSize) || "md"
  );

  // Aplica assim que o app abre (não só quando o usuário muda no menu).
  useEffect(() => {
    applyZoom(size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSize = useCallback((next: AppTextSize) => {
    setSizeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyZoom(next);
  }, []);

  return { size, setSize };
}
