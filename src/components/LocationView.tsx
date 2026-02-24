import { MapPin } from "lucide-react";

export function LocationView() {
  return (
    <div className="animate-fade-in text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/10 mb-4">
        <MapPin size={36} className="text-accent" />
      </div>
      <h3 className="font-display font-semibold text-foreground text-lg mb-2">
        Localização
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        Localize seus dispositivos e crie agendamentos baseados em localização.
      </p>
      <div className="mt-6 inline-block px-4 py-2 rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
        Em desenvolvimento 🚧
      </div>
    </div>
  );
}
