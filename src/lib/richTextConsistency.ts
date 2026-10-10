// Texto sem espaços nem quebras de linha — serve só para comparar duas versões
// do mesmo texto sem se confundir com <br>, <div> e &nbsp;.
const squash = (s: string) => s.replace(/\s+/g, "");

const cache = new Map<string, boolean>();

/**
 * Cada bloco de texto da nota guarda duas cópias do mesmo texto: o texto simples
 * ("content") e a versão com formatação ("contentHtml"). Os contadores de
 * palavras/caracteres usam o texto simples, e a tela usava só a versão
 * formatada. Em alguns teclados de Android a versão formatada pode ficar com
 * trechos repetidos (ex.: "VeloiVeloi") enquanto o texto simples está certo.
 *
 * Esta função devolve a versão formatada SÓ quando ela diz o mesmo que o texto
 * simples. Se não bater, devolve undefined e quem chamou usa o texto simples
 * (perde-se só a cor/negrito daquele bloco, mas some a repetição).
 */
export function consistentHtml(block: { content?: string; contentHtml?: string }): string | undefined {
  const html = block.contentHtml;
  if (!html) return undefined;
  const plain = block.content || "";
  if (!plain.trim()) return html; // sem texto simples para comparar: mantém como está
  const key = html + "\u0000" + plain;
  let ok = cache.get(key);
  if (ok === undefined) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    ok = squash(tmp.textContent || "") === squash(plain);
    if (cache.size > 300) cache.clear();
    cache.set(key, ok);
  }
  return ok ? html : undefined;
}
