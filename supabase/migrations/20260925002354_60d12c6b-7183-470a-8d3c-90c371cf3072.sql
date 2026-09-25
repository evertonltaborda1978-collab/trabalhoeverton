-- Adiciona os campos necessários para o histórico de compartilhamentos de
-- localização: nome (label), endereço em texto, e as coordenadas — a tabela
-- location_shares até agora só guardava dados de link em tempo real.
alter table public.location_shares
  add column if not exists label text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- O token do link deixa de ser obrigatório: um compartilhamento simples
-- (WhatsApp, copiar, etc.) agora também entra no histórico, mesmo sem gerar
-- um link em tempo real.
alter table public.location_shares
  alter column token drop not null;

-- Garante que o RLS está ativo nessa tabela.
alter table public.location_shares enable row level security;

-- Cada pessoa só pode ver, atualizar (renomear) e apagar os próprios
-- compartilhamentos. Se essas regras já existirem, são recriadas do zero
-- pra garantir que ficam corretas.
drop policy if exists "Users can view own location shares" on public.location_shares;
create policy "Users can view own location shares"
  on public.location_shares for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own location shares" on public.location_shares;
create policy "Users can update own location shares"
  on public.location_shares for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own location shares" on public.location_shares;
create policy "Users can delete own location shares"
  on public.location_shares for delete
  using (auth.uid() = user_id);
