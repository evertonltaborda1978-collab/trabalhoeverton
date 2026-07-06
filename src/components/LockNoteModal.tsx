import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, ShieldCheck, AlertTriangle } from "lucide-react";

interface LockNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "set" | "unlock" | "manage";
  onSetPin: (pin: string) => void;
  onUnlock: (pin: string) => boolean | Promise<boolean>;
  onRemoveLock: () => void;
  onForceReset?: () => void;
}

export function LockNoteModal({ open, onOpenChange, mode, onSetPin, onUnlock, onRemoveLock, onForceReset }: LockNoteModalProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">(mode === "set" ? "enter" : "enter");
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  const reset = () => { setPin(""); setConfirmPin(""); setError(""); setStep("enter"); setShowForceConfirm(false); };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleDigit = (d: string) => {
    setError("");
    if (step === "confirm") {
      if (confirmPin.length < 6) setConfirmPin((p) => p + d);
    } else {
      if (pin.length < 6) setPin((p) => p + d);
    }
  };

  const handleDelete = () => {
    setError("");
    if (step === "confirm") {
      setConfirmPin((p) => p.slice(0, -1));
    } else {
      setPin((p) => p.slice(0, -1));
    }
  };

  const handleSubmit = async () => {
    if (mode === "set") {
      if (step === "enter") {
        if (pin.length < 4) { setError("Mínimo 4 dígitos"); return; }
        setStep("confirm");
        return;
      }
      if (confirmPin !== pin) { setError("As senhas não coincidem"); setConfirmPin(""); return; }
      onSetPin(pin);
      handleClose(false);
      return;
    }

    if (mode === "unlock") {
      if (pin.length < 4) { setError("Digite a senha"); return; }
      const ok = await onUnlock(pin);
      if (!ok) { setError("Senha incorreta"); setPin(""); return; }
      handleClose(false);
      return;
    }

    if (mode === "manage") {
      if (pin.length < 4) { setError("Digite a senha atual"); return; }
      const ok = await onUnlock(pin);
      if (!ok) { setError("Senha incorreta"); setPin(""); return; }
      onRemoveLock();
      handleClose(false);
    }
  };

  const handleForceReset = () => {
    onForceReset?.();
    handleClose(false);
  };

  const currentValue = step === "confirm" ? confirmPin : pin;
  const maxLen = 6;

  const titles = {
    set: step === "confirm" ? "Confirme a senha" : "Defina uma senha",
    unlock: "Nota protegida",
    manage: "Remover proteção",
  };

  const subtitles = {
    set: step === "confirm" ? "Digite a senha novamente" : "Escolha de 4 a 6 dígitos",
    unlock: "Digite a senha para acessar",
    manage: "Digite a senha atual para desbloquear",
  };

  // ── Tela de confirmação do reset forçado ──
  if (showForceConfirm) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base justify-center">
              <AlertTriangle size={20} style={{ color: "#E53935" }} />
              Atenção
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 mt-2 text-center">
            <p className="text-sm text-gray-600">
              O conteúdo desta nota será <strong>apagado permanentemente</strong> e a proteção será removida.
            </p>
            <p className="text-xs text-gray-400">Esta ação não pode ser desfeita.</p>
            <button
              onClick={handleForceReset}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: "#E53935" }}
            >
              🗑 Apagar conteúdo e remover proteção
            </button>
            <button
              onClick={() => setShowForceConfirm(false)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-gray-100"
              style={{ color: "#999" }}
            >
              Voltar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base justify-center">
            {mode === "unlock" ? <Lock size={20} style={{ color: "#F9A825" }} /> : <ShieldCheck size={20} style={{ color: "#1A1A2E" }} />}
            {titles[mode]}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 mt-2">
          <p className="text-xs text-gray-500">{subtitles[mode]}</p>

          {/* PIN dots */}
          <div className="flex gap-3">
            {Array.from({ length: maxLen }).map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full transition-all duration-200"
                style={{
                  background: i < currentValue.length ? "#1A1A2E" : "#E0E0E0",
                  transform: i < currentValue.length ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[220px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => handleDigit(String(n))}
                className="h-12 rounded-xl text-lg font-semibold transition-all hover:bg-gray-100 active:scale-95"
                style={{ color: "#1A1A2E", background: "#F5F5F5" }}
              >
                {n}
              </button>
            ))}
            <button
              onClick={handleDelete}
              className="h-12 rounded-xl text-sm font-medium transition-all hover:bg-gray-100"
              style={{ color: "#999" }}
            >
              ⌫
            </button>
            <button
              onClick={() => handleDigit("0")}
              className="h-12 rounded-xl text-lg font-semibold transition-all hover:bg-gray-100 active:scale-95"
              style={{ color: "#1A1A2E", background: "#F5F5F5" }}
            >
              0
            </button>
            <button
              onClick={handleSubmit}
              disabled={currentValue.length < 4}
              className="h-12 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "#2D9E7F" }}
            >
              OK
            </button>
          </div>

          <button
            onClick={() => handleClose(false)}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-gray-100"
            style={{ color: "#999" }}
          >
            Cancelar
          </button>

          {/* Botão esqueci minha senha — aparece nos modos unlock e manage */}
          {(mode === "unlock" || mode === "manage") && onForceReset && (
            <button
              onClick={() => setShowForceConfirm(true)}
              className="text-xs font-semibold transition-all hover:underline"
              style={{ color: "#E53935" }}
            >
              Esqueci minha senha
            </button>
          )}

          {mode === "manage" && (
            <p className="text-[10px] text-gray-400 text-center">
              Após confirmar, a proteção será removida
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
