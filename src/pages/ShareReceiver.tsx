import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * This page receives shared content from other apps via the Web Share Target API
 * (navegador/PWA). It stores the shared data in sessionStorage and redirects to
 * the main page, where NotesView will pick it up and open a new note editor
 * pre-filled — texto, e agora também foto (quando o compartilhamento inclui
 * uma imagem, o campo "image" vem preenchido com um data URL base64).
 *
 * O compartilhamento vindo do app Android (WhatsApp, Galeria, etc.) usa um
 * caminho diferente (MainActivity.java escreve direto no mesmo sessionStorage
 * e dispara o evento "shared-note-ready"), mas cai na mesma chave e no mesmo
 * formato — então o NotesView só precisa entender esse formato uma vez.
 */
export default function ShareReceiver() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const title = params.get("title") || "";
    const text = params.get("text") || "";
    const url = params.get("url") || "";

    // Combine text and url
    const content = [text, url].filter(Boolean).join("\n\n");

    if (title || content) {
      sessionStorage.setItem(
        "shared_note_data",
        JSON.stringify({ title, content, image: null })
      );
    }

    // Redirect to main page — NotesView will detect the shared data
    navigate("/", { replace: true });
  }, [navigate, params]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F5F2" }}>
      <p style={{ color: "#999" }}>Recebendo conteúdo...</p>
    </div>
  );
}
