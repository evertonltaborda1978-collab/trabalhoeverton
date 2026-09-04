import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerOfflineSupport } from "./lib/registerSW";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

createRoot(document.getElementById("root")!).render(<App />);

registerOfflineSupport();

// Esconde a splash screen nativa (a logo) assim que a primeira tela do app
// (login ou app principal) já foi realmente desenhada na frente do usuário.
// Antes, sem isso configurado, o Android mostrava tela em branco/preta vazia
// enquanto o JavaScript inteiro carregava — agora mostra a logo até esse
// momento, em vez de nada.
if (Capacitor.isNativePlatform()) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      SplashScreen.hide().catch(() => {});
    });
  });
}
