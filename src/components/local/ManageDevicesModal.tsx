import { useState } from "react";
import { X, Smartphone, Monitor, Trash2, Pencil, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserDevice } from "@/hooks/useDeviceTracking";
import { DeviceLabelModal } from "./DeviceLabelModal";

interface Props {
  devices: UserDevice[];
  onClose: () => void;
  onRemove: (id: string) => Promise<void>;
  onRenamed: () => void;
}

export function ManageDevicesModal({ devices, onClose, onRemove, onRenamed }: Props) {
  const [renaming, setRenaming] = useState<UserDevice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserDevice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await onRemove(confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.5)",
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: "calc(12px + env(safe-area-inset-top))",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-y-auto flex flex-col"
        style={{ background: "#FFF", maxHeight: "calc(90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3" style={{ flexShrink: 0 }}>
          <div>
            <h3 className="font-bold text-lg" style={{ color: "#1A1A2E" }}>Gerenciar aparelhos</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>{devices.length} aparelho{devices.length !== 1 ? "s" : ""} salvo{devices.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
          {devices.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "#9E9E9E" }}>Nenhum aparelho encontrado.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => {
                const isPhone = d.os === "Android" || d.os === "iOS";
                const name = d.custom_label || d.device_name;
                return (
                  <div key={d.id} className="rounded-xl p-3" style={{ background: d.is_current ? "#F0FDF4" : "#F7F5F2", border: d.is_current ? "1px solid #BBF7D0" : "1px solid #EEE" }}>
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFF" }}>
                        {isPhone ? <Smartphone size={16} style={{ color: "#2D9E7F" }} /> : <Monitor size={16} style={{ color: "#2D9E7F" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm truncate" style={{ color: "#1A1A2E" }}>{name}</p>
                          {d.is_current && <Star size={11} fill="#2D9E7F" style={{ color: "#2D9E7F" }} />}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "#9E9E9E" }}>
                          {d.browser} / {d.os} {d.is_current ? "— este aparelho" : ""}
                        </p>
                        <p className="text-[10px]" style={{ color: "#BDBDBD" }}>
                          Visto {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setRenaming(d)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                        style={{ background: "#FFF", border: "1px solid #E2E8F0", color: "#4A5568" }}
                      >
                        <Pencil size={12} /> Renomear
                      </button>
                      <button
                        onClick={() => setConfirmDelete(d)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                        style={{ background: "#FFF", border: "1px solid #FED7D7", color: "#E53935" }}
                      >
                        <Trash2 size={12} /> Apagar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {renaming && (
        <DeviceLabelModal
          deviceId={renaming.id}
          defaultName={renaming.custom_label || renaming.device_name}
          onDone={() => { setRenaming(null); onRenamed(); }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { e.stopPropagation(); if (!deleting) setConfirmDelete(null); }}
        >
          <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: "#FFF" }} onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-sm mb-1.5" style={{ color: "#1A1A2E" }}>Apagar este aparelho?</p>
            <p className="text-xs mb-4" style={{ color: "#9E9E9E" }}>
              "{confirmDelete.custom_label || confirmDelete.device_name}" vai sumir da sua lista.
              {confirmDelete.is_current && " Como é o aparelho que você está usando agora, ele volta a aparecer sozinho na próxima vez que abrir o app."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: "#F5F5F5", color: "#4A5568" }}>
                Cancelar
              </button>
              <button onClick={doDelete} disabled={deleting} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: "#E53935", color: "#FFF" }}>
                {deleting ? "Apagando..." : "Apagar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
