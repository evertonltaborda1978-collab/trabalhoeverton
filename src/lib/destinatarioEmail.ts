// E-mail do destinatário: guardado no aparelho (localStorage), vale para todos os relatórios.
// A chave é o nome do destinatário (sem diferenciar maiúsculas de minúsculas).
const KEY = "destinatarios_emails";

const chave = (nome: string) => nome.trim().toLowerCase();

function lerTodos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** E-mail salvo para esse nome ("" se não tiver). */
export function emailDe(nome: string): string {
  if (!nome.trim()) return "";
  return lerTodos()[chave(nome)] ?? "";
}

/** Salva (ou apaga, se vier vazio) o e-mail desse nome. */
export function salvarEmail(nome: string, email: string): void {
  if (!nome.trim()) return;
  try {
    const todos = lerTodos();
    if (email.trim()) todos[chave(nome)] = email.trim();
    else delete todos[chave(nome)];
    localStorage.setItem(KEY, JSON.stringify(todos));
  } catch {
    /* sem espaço ou modo privado: ignora */
  }
}

/** Aceita um ou mais e-mails separados por vírgula ou ponto e vírgula. */
export function emailValido(email: string): boolean {
  const partes = email.split(/[;,]/).map(p => p.trim()).filter(Boolean);
  return partes.length > 0 && partes.every(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
}

/**
 * O envio direto por e-mail (mailto) só é usado no celular. No computador, alguns programas
 * de e-mail (como o Outlook) leem o texto do mailto sem respeitar os acentos e o relatório
 * chega com letras trocadas (RelatÃ³rio); por isso lá o app usa o compartilhar normal.
 */
export function emailDiretoDisponivel(): boolean {
  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

/** Abre o app de e-mail já com destinatário, assunto e texto preenchidos. */
export function abrirEmail(para: string, assunto: string, corpo: string): void {
  const destinos = para.split(/[;,]/).map(p => p.trim()).filter(Boolean).join(",");
  const url = `mailto:${destinos}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo.replace(/\n/g, "\r\n"))}`;
  window.location.href = url;
}
