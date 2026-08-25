// Ajustes que só se aplicam ao build publicado no GitHub Pages
// (o build normal, usado no Capacitor/Android e no dev local, não é tocado).
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist"
);

// 1) Manifest do PWA: troca caminhos absolutos ("/") por relativos,
//    assim funcionam dentro da subpasta /trabalhoeverton/ do GitHub Pages.
const manifestPath = path.join(distDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.start_url = "./";
if (Array.isArray(manifest.icons)) {
  manifest.icons = manifest.icons.map((icon) => ({
    ...icon,
    src: icon.src.replace(/^\//, ""),
  }));
}
if (manifest.share_target?.action) {
  manifest.share_target.action = manifest.share_target.action.replace(/^\//, "");
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// 2) Fallback de rotas: GitHub Pages não sabe que o app usa rotas via
//    JavaScript (react-router). Copiar index.html para 404.html faz com
//    que qualquer rota direta (ex: /reset-password) carregue o app
//    normalmente em vez de dar "página não encontrada".
copyFileSync(path.join(distDir, "index.html"), path.join(distDir, "404.html"));

console.log("✔ Ajustes de GitHub Pages aplicados (manifest.json + 404.html)");
