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

  const sendCommand = useCallback(async (deviceId: string, command: string, payload: any = {}) => {
    if (!user) return;
    return supabase.from("device_commands").insert({
      user_id: user.id,
      device_id: deviceId,
      command,
      payload,
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
          handlerRef.current?.(payload.new as DeviceCommand);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, currentDeviceId]);

  return { sendCommand, markExecuted };
}
