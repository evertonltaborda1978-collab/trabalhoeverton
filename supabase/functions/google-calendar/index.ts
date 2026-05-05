import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    if (action === 'status') {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Google credentials not configured', connected: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Generate auth URL — requires authenticated user; issues short-lived random nonce as state
  if (action === 'auth_url') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: userError } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectUri = url.searchParams.get('redirect_uri') || `${SUPABASE_URL}/functions/v1/google-calendar?action=callback`;
    const appOrigin = url.searchParams.get('app_origin') || req.headers.get('origin') || '';

    // Random opaque nonce mapped to user_id, expires in 10min
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    await adminClient.from('oauth_states').insert({
      token: nonce,
      user_id: user.id,
      provider: 'google',
      app_origin: appOrigin,
    });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state: nonce,
    });

    return new Response(JSON.stringify({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // OAuth callback
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // opaque nonce

    if (!code || !state) {
      return new Response('Missing code or state', { status: 400, headers: corsHeaders });
    }

    // Look up nonce -> user_id, ensure not expired, then delete (single-use)
    const { data: stateRow } = await adminClient
      .from('oauth_states')
      .select('user_id, expires_at, app_origin')
      .eq('token', state)
      .maybeSingle();

    if (!stateRow || new Date(stateRow.expires_at) < new Date()) {
      return new Response('Invalid or expired state', { status: 401, headers: corsHeaders });
    }
    await adminClient.from('oauth_states').delete().eq('token', state);

    const userId = stateRow.user_id;
    const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar?action=callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('Token exchange failed:', tokens);
      return new Response('Authentication failed. Please reconnect.', { status: 400, headers: corsHeaders });
    }

    // Store tokens
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    await adminClient.from('google_calendar_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Determine app origin to scope postMessage. Falls back to '*' only if missing.
    const appOrigin = stateRow.app_origin || '';
    const targetOrigin = appOrigin && /^https?:\/\//.test(appOrigin) ? JSON.stringify(appOrigin) : '"*"';

    return new Response(`<html><body><script>try{window.opener && window.opener.postMessage('google_calendar_connected', ${targetOrigin});}catch(e){}window.close();</script><p>Conectado! Você pode fechar esta janela.</p></body></html>`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  // Sync events (requires auth)
  if (action === 'sync' || action === 'events') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user }, error: userError } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get stored Google tokens
    const { data: tokenData } = await adminClient.from('google_calendar_tokens').select('*').eq('user_id', user.id).single();

    if (!tokenData) {
      return new Response(JSON.stringify({ error: 'Not connected', connected: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let accessToken = tokenData.access_token;

    // Refresh token if expired
    if (new Date(tokenData.expires_at) <= new Date()) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
        await adminClient.from('google_calendar_tokens').update({
          access_token: accessToken,
          expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      } else {
        return new Response(JSON.stringify({ error: 'Token refresh failed', connected: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // GET events
    if (action === 'events') {
      const timeMin = url.searchParams.get('timeMin') || new Date().toISOString();
      const timeMax = url.searchParams.get('timeMax') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const calData = await calRes.json();
      if (!calRes.ok) {
        console.error('Failed to fetch events:', calData);
        return new Response(JSON.stringify({ error: 'Failed to fetch events. Please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const events = (calData.items || []).map((e: any) => ({
        id: e.id,
        title: e.summary || '',
        date: e.start?.date || e.start?.dateTime?.split('T')[0] || '',
        time: e.start?.dateTime ? new Date(e.start.dateTime).toTimeString().slice(0, 5) : '00:00',
        description: e.description || '',
        source: 'google',
      }));

      return new Response(JSON.stringify({ connected: true, events }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUSH event to Google Calendar
    if (action === 'sync') {
      const body = await req.json();
      const { title, date, time, description } = body;

      const startDateTime = `${date}T${time || '09:00'}:00`;
      const endDate = new Date(`${startDateTime}`);
      endDate.setHours(endDate.getHours() + 1);

      const event = {
        summary: title,
        description: description || '',
        start: { dateTime: new Date(startDateTime).toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/Sao_Paulo' },
      };

      const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      const created = await createRes.json();
      if (!createRes.ok) {
        console.error('Failed to create event:', created);
        return new Response(JSON.stringify({ error: 'Failed to create event. Please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, event: created }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Check connection status
  if (action === 'status') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data } = await adminClient.from('google_calendar_tokens').select('id').eq('user_id', user.id).single();
    return new Response(JSON.stringify({ connected: !!data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Disconnect
  if (action === 'disconnect') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await adminClient.from('google_calendar_tokens').delete().eq('user_id', user.id);
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
