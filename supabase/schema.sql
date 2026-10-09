-- ============================================================================
--  Lançador de Notas · Rafinhadr
--  Cole TUDO isto no Supabase: menu "SQL Editor" -> "New query" -> Run.
--  Pode rodar de novo sem problema (é idempotente).
-- ============================================================================

-- ---------------------------------------------------------------- tabelas

create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  usuario     text not null unique,
  nome        text not null,
  admin       boolean not null default false,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists public.notas (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  placa            text not null default '',
  descricao        text not null,
  valor            text not null,
  fornecedor       text not null default '',
  cnpj_fornecedor  text not null default '',
  alerta           text not null default '',
  status           text not null default 'pendente'
                   check (status in ('pendente','lancando','lancada','erro','cancelada')),
  mensagem         text not null default '',
  maquina          text not null default '',
  criado_em        timestamptz not null default now(),
  lancado_em       timestamptz
);

create index if not exists notas_fila_idx on public.notas (user_id, status, id);
create index if not exists notas_data_idx on public.notas (criado_em desc);

-- "batimento" do programa de cada PC: mostra no celular se o PC está conectado
create table if not exists public.agentes (
  user_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  maquina   text not null default '',
  versao    text not null default '',
  pausado   boolean not null default false,
  visto_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin and ativo from public.perfis where id = auth.uid()), false);
$$;

create or replace function public.eh_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from public.perfis where id = auth.uid()), false);
$$;

-- impede que um usuário mude o dono da nota ou "ressuscite" nota de outro
create or replace function public.notas_protege() returns trigger
language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Não é permitido trocar o dono da nota';
  end if;
  if new.status = 'lancada' and old.status <> 'lancada' and new.lancado_em is null then
    new.lancado_em := now();
  end if;
  return new;
end $$;

drop trigger if exists notas_protege on public.notas;
create trigger notas_protege before update on public.notas
  for each row execute function public.notas_protege();

-- ---------------------------------------------------------------- segurança (RLS)

alter table public.perfis  enable row level security;
alter table public.notas   enable row level security;
alter table public.agentes enable row level security;

drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select
  using (id = auth.uid() or public.eh_admin());
-- criar/editar/apagar usuários só pelo servidor (chave secreta), nunca pelo navegador

drop policy if exists notas_ver on public.notas;
create policy notas_ver on public.notas for select
  using (user_id = auth.uid() or public.eh_admin());

drop policy if exists notas_criar on public.notas;
create policy notas_criar on public.notas for insert
  with check (user_id = auth.uid() and public.eh_ativo());

drop policy if exists notas_editar on public.notas;
create policy notas_editar on public.notas for update
  using (user_id = auth.uid() and public.eh_ativo())
  with check (user_id = auth.uid());

drop policy if exists agentes_ver on public.agentes;
create policy agentes_ver on public.agentes for select
  using (user_id = auth.uid() or public.eh_admin());

drop policy if exists agentes_gravar on public.agentes;
create policy agentes_gravar on public.agentes for insert
  with check (user_id = auth.uid() and public.eh_ativo());

drop policy if exists agentes_atualizar on public.agentes;
create policy agentes_atualizar on public.agentes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.notas   to authenticated;
grant select, insert, update on public.agentes to authenticated;
grant select                 on public.perfis  to authenticated;
