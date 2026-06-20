import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DeviceCommand {
  id: string;
  device_id: string;
  command: string;
  payload: any;
  status: string;
  created_at: string;
}

export function useDeviceCommands(currentDeviceId: string | null, onCommand?: (cmd: DeviceCommand) => void) {
  const { user } = useAuth();
  const handlerRef = useRef(onCommand);
  handlerRef.current = onCommand;
  const processedIdsRef = useRef<Set<string>>(new Set());

  const sendCommand = useCallback(async (deviceId: string, command: string, payload: any = {}) => {
    if (!user) return;
    return supabase.from("device_commands").insert({
      user_id: user.id,
      device_id: deviceId,
      command,
      payload,
      status: "pending",
    });
  }, [user]);

  const markExecuted = useCallback(async (id: string) => {
    await supabase.from("device_commands").update({ status: "done", executed_at: new Date().toISOString() }).eq("id", id);
  }, []);

  // Realtime subscription for commands targeting this device
  useEffect(() => {
    if (!user || !currentDeviceId) return;
    const ch = supabase
      .channel(`device_commands_${currentDeviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_commands",
          filter: `device_id=eq.${currentDeviceId}`,
        },
        (payload) => {
          const cmd = payload.new as DeviceCommand;
          processedIdsRef.current.add(cmd.id);
          handlerRef.current?.(cmd);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, currentDeviceId]);

  // Fallback: verificação periódica (polling) caso o Realtime não esteja habilitado
  useEffect(() => {
    if (!user || !currentDeviceId) return;

    const checkPending = async () => {
      const { data } = await supabase
        .from("device_commands")
        .select("*")
        .eq("device_id", currentDeviceId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(10);

      if (data) {
        for (const cmd of data as DeviceCommand[]) {
          if (!processedIdsRef.current.has(cmd.id)) {
            processedIdsRef.current.add(cmd.id);
            handlerRef.current?.(cmd);
            await supabase.from("device_commands").update({ status: "done", executed_at: new Date().toISOString() }).eq("id", cmd.id);
          }
        }
      }
    };

    checkPending();
    const interval = window.setInterval(checkPending, 15000);
    return () => window.clearInterval(interval);
  }, [user, currentDeviceId]);

  return { sendCommand, markExecuted };
}
