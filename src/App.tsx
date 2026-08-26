import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { toast } from "@/hooks/use-toast";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import ShareReceiver from "./pages/ShareReceiver";
import PublicShare from "./pages/PublicShare";

const queryClient = new QueryClient();

// Botão/gesto de voltar nativo do Android:
// 1) se houver uma tela cheia aberta (nota, relatório, etc. — registradas via
//    window.__registerModal), deixa o histórico do navegador voltar
//    normalmente, o que fecha essa tela (mesmo mecanismo já usado pela nota);
// 2) senão, já está na tela inicial: pede uma segunda confirmação antes de
//    sair do app, para não sair sem querer com um toque acidental.
function useAndroidBackButton() {
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        CapacitorApp.exitApp();
        return;
      }
      lastBackPressRef.current = now;
      toast({ title: "Toque voltar de novo para sair" });
    });

    return () => {
      sub.then((s) => s.remove());
    };
  }, []);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" />;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => {
  useAndroidBackButton();
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/share" element={<ProtectedRoute><ShareReceiver /></ProtectedRoute>} />
            <Route path="/share/:token" element={<PublicShare />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
