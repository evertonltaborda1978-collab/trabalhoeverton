import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Link inválido ou expirado." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share } = await client
      .from("location_shares")
      .select("id, device_id, expires_at, is_active")
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (!share || (share.expires_at && new Date(share.expires_at) <= new Date())) {
      return new Response(JSON.stringify({ error: "Link inválido ou expirado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: location } = await client
      .from("device_locations")
      .select("latitude, longitude, address, recorded_at, battery_level")
      .eq("device_id", share.device_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(JSON.stringify({ share, location }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});