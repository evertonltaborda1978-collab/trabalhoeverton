import { Mic } from "lucide-react";

export function AudioView() {
  return (
    <div className="animate-fade-in text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
        <Mic size={36} className="text-primary" />
      </div>
      <h3 className="font-display font-semibold text-foreground text-lg mb-2">
        Gravação de Áudio
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        Em breve você poderá gravar áudios e convertê-los em texto automaticamente.
      </p>
      <div className="mt-6 inline-block px-4 py-2 rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
        Em desenvolvimento 🚧
      </div>
    </div>
  );
}
