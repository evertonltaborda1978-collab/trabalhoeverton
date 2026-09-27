import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Trash2, ShieldCheck, ArrowLeft } from "lucide-react";

type ProfileStatus = "pending" | "approved" | "rejected";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: ProfileStatus;
  is_admin: boolean;
  created_at: string;
};

const statusLabel: Record<ProfileStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
};

const statusColor: Record<ProfileStatus, string> = {
  pending: "#F9A825",
  approved: "#43A047",
  rejected: "#E53935",
};

export default function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProfiles = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (!error && data) setProfiles(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    const check = async () => {
      if (!user) {
        navigate("/");
        return;
      }
      const { data } = await (supabase as any)
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (!data?.is_admin) {
        toast({
          title: "Acesso restrito",
          description: "Só o administrador pode ver esta página.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }
      setIsAdmin(true);
      setChecking(false);
      loadProfiles();
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await (supabase as any).from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "approved" ? "Usuário aprovado" : "Acesso recusado" });
    loadProfiles();
  };

  const deleteProfile = async (id: string) => {
    if (!confirm("Excluir este usuário? Ele não conseguirá mais entrar no aplicativo.")) return;
    const { error } = await (supabase as any).from("profiles").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Usuário excluído" });
    loadProfiles();
  };

  if (checking) return <div className="min-h-screen bg-background" />;
  if (!isAdmin) return null;

  return (
    <div
      className="min-h-screen bg-background px-4 py-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
    >
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/")} className="p-1 rounded-full hover:bg-black/5">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold flex items-center gap-1.5">
            <ShieldCheck size={18} /> Administração de usuários
          </h1>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {!loading && profiles.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
        )}

        <div className="space-y-2">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border p-3 flex items-center justify-between gap-2"
              style={{ borderColor: "#EBEBEB" }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.full_name || "(sem nome)"}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                <span className="text-[10px] font-bold" style={{ color: statusColor[p.status] }}>
                  {statusLabel[p.status]}
                  {p.is_admin ? " · Admin" : ""}
                </span>
              </div>
              {!p.is_admin && (
                <div className="flex items-center gap-1 shrink-0">
                  {p.status !== "approved" && (
                    <Button size="icon" variant="outline" title="Aprovar" onClick={() => updateStatus(p.id, "approved")}>
                      <Check size={15} style={{ color: "#43A047" }} />
                    </Button>
                  )}
                  {p.status !== "rejected" && (
                    <Button size="icon" variant="outline" title="Recusar acesso" onClick={() => updateStatus(p.id, "rejected")}>
                      <X size={15} style={{ color: "#F9A825" }} />
                    </Button>
                  )}
                  <Button size="icon" variant="outline" title="Excluir" onClick={() => deleteProfile(p.id)}>
                    <Trash2 size={15} style={{ color: "#E53935" }} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
