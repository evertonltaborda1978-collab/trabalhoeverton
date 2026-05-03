import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "reverse";
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let target = "";
    if (mode === "reverse") {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      if (!lat || !lng) {
        return new Response(JSON.stringify({ error: "lat/lng required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      target = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${apiKey}`;
    } else if (mode === "forward") {
      const q = url.searchParams.get("q");
      if (!q) {
        return new Response(JSON.stringify({ error: "q required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      target = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&language=pt-BR&region=br&key=${apiKey}`;
    } else {
      return new Response(JSON.stringify({ error: "invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(target);
    const data = await resp.json();

    const results = (data.results || []).slice(0, 5).map((r: any) => {
      const c: Record<string, string> = {};
      for (const comp of r.address_components || []) {
        for (const t of comp.types) c[t] = comp.long_name;
      }
      const street = c.route || "";
      const number = c.street_number || "";
      const neigh = c.sublocality_level_1 || c.sublocality || c.political || "";
      const city = c.administrative_area_level_2 || c.locality || "";
      const state = c.administrative_area_level_1 || "";
      const formatted = [
        [street, number].filter(Boolean).join(", "),
        neigh,
        city,
        state,
      ].filter(Boolean).join(" — ");
      return {
        formatted: formatted || r.formatted_address,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
        place_id: r.place_id,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
