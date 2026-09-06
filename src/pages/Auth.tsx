import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoonPhaseWidget } from "@/components/MoonPhaseWidget";
import { useToast } from "@/hooks/use-toast";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { APP_VERSION, VERSION_HISTORY, forceUpdateApp } from "@/lib/appVersion";
import { Mail, Lock, Eye, EyeOff, Fingerprint, HelpCircle, X, RotateCcw } from "lucide-react";

// Alguns erros vêm crus e técnicos direto do navegador (ex: "Failed to
// fetch", quando não tem internet de verdade pra completar o login no
// servidor) — aqui trocamos por uma mensagem que a pessoa entende.
function friendlyAuthError(message: string | undefined): string {
  if (!message) return "Não foi possível completar. Tente novamente.";
  const raw = message.toLowerCase();
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("load failed")) {
    return "Sem internet no momento. Conecte-se e tente entrar de novo.";
  }
  if (message === "Invalid login credentials") return "Email ou senha incorretos";
  return message;
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const { toast } = useToast();
  const { biometricEnabled, biometricAvailable, enableBiometric, biometricLogin, storedEmail } = useBiometricAuth();
  const { notice: updateNotice } = useVersionCheck();

  // Aviso de atualização já na tela de login, sem precisar entrar com email/senha
  useEffect(() => {
    if (!updateNotice) return;
    toast({
      title: "✨ Aplicativo atualizado",
      description: updateNotice.from
        ? `Você está agora na versão ${updateNotice.to} (antes ${updateNotice.from}).`
        : `Você está agora na versão ${updateNotice.to}.`,
    });
  }, [updateNotice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (forgotPassword) {
        const { error } = await (supabase.auth as any).resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada para redefinir a senha." });
        setForgotPassword(false);
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await (supabase.auth as any).signInWithPassword({ email, password });
        if (error) throw error;

        if (biometricAvailable && !biometricEnabled) {
          const enabled = await enableBiometric(email, password);
          if (enabled) {
            toast({ title: "Biometria ativada!", description: "No próximo login, use sua biometria." });
          }
        }
      } else {
        const { error } = await (supabase.auth as any).signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Conta criada!",
          description: "Verifique seu email para confirmar o cadastro.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: friendlyAuthError(error.message),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    const result = await biometricLogin();
    if (!result.success) {
      toast({ title: "Erro", description: friendlyAuthError(result.error), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleResetCache = async () => {
    if (!navigator.onLine) {
      toast({
        title: "Sem internet no momento",
        description: "Limpar o cache agora apagaria a cópia offline do app sem poder baixar uma nova. Tente de novo quando tiver conexão.",
      });
      return;
    }
    toast({
      title: "Atualizando aplicativo",
      description: "Limpando cache e buscando a versão mais recente...",
    });
    setTimeout(() => { void forceUpdateApp(); }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <MoonPhaseWidget />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Secretária Virtual
          </h1>
          <p className="text-sm text-muted-foreground">
            {forgotPassword ? "Recupere sua senha" : isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        {/* Biometric quick login */}
        {isLogin && biometricEnabled && storedEmail && (
          <div className="space-y-2">
            <Button
              onClick={handleBiometricLogin}
              disabled={loading}
              className="w-full gap-2"
              variant="outline"
              style={{ borderColor: "#C8E6C9", background: "#F0FFF4" }}
            >
              <Fingerprint size={20} style={{ color: "#4CAF50" }} />
              <span style={{ color: "#2E7D32" }}>
                {loading ? "Autenticando..." : `Entrar como ${storedEmail}`}
              </span>
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">ou use email</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              autoComplete="username"
              name="email"
              required
            />
          </div>
          {!forgotPassword && (
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                autoComplete={isLogin ? "current-password" : "new-password"}
                name="password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
          {isLogin && !forgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                className="text-xs text-primary hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : forgotPassword ? "Enviar email de recuperação" : isLogin ? "Entrar" : "Cadastrar"}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-center text-sm text-muted-foreground">
          {forgotPassword ? (
            <button
              onClick={() => setForgotPassword(false)}
              className="text-primary font-semibold hover:underline"
            >
              Voltar ao login
            </button>
          ) : (
            <>
              {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary font-semibold hover:underline"
              >
                {isLogin ? "Cadastre-se" : "Entrar"}
              </button>
            </>
          )}
        </p>

        <p className="text-center text-xs text-muted-foreground/60 pt-4">
          Criado por <span className="font-semibold text-muted-foreground/80">Everton Taborda</span>
        </p>

        {/* Versão do app + histórico de atualizações + botão de limpar cache */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="text-[10px] text-muted-foreground/50 font-semibold">{APP_VERSION}</span>
          <button
            onClick={() => setShowVersionHistory(true)}
            className="flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
            title="Ver histórico de versões"
          >
            <HelpCircle size={13} />
          </button>
          <button
            onClick={handleResetCache}
            className="flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-red-500"
            title="Limpar cache e cookies (se não estiver mostrando a versão mais nova)"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {showVersionHistory && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowVersionHistory(false)}
        >
          <div className="w-full max-w-sm rounded-2xl p-5 bg-background" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-foreground">📋 Histórico de versões</h3>
              <button onClick={() => setShowVersionHistory(false)} className="p-1 rounded-full hover:bg-black/5">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {VERSION_HISTORY.map((v) => (
                <div key={v.version} className="flex gap-2">
                  <span className="text-xs font-bold text-primary shrink-0">{v.version}</span>
                  <p className="text-xs text-muted-foreground">{v.changes}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
