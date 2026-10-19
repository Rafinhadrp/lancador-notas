-- Avisos de recibo pelo WhatsApp (aba Recibos do app + extensão do Chrome).
-- Pode rodar de novo sem problema (é idempotente). Também está dentro do schema.sql.
create table if not exists public.avisos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('loja','terceiro')),
  nome        text not null default '',
  telefone    text not null,
  modelo      text not null default '',
  mensagens   jsonb not null default '[]'::jsonb,
  status      text not null default 'pendente'
              check (status in ('pendente','enviando','enviado','erro','cancelada')),
  mensagem    text not null default '',
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz
);

create index if not exists avisos_fila_idx on public.avisos (user_id, status, id);
create index if not exists avisos_tel_idx on public.avisos (telefone, criado_em desc);

create or replace function public.avisos_protege() returns trigger
language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Não é permitido trocar o dono do aviso';
  end if;
  if new.status = 'enviado' and old.status <> 'enviado' and new.enviado_em is null then
    new.enviado_em := now();
  end if;
  return new;
end $$;

drop trigger if exists avisos_protege on public.avisos;
create trigger avisos_protege before update on public.avisos
  for each row execute function public.avisos_protege();

alter table public.avisos enable row level security;

drop policy if exists avisos_ver on public.avisos;
create policy avisos_ver on public.avisos for select
  using (user_id = auth.uid() or public.eh_admin());

drop policy if exists avisos_criar on public.avisos;
create policy avisos_criar on public.avisos for insert
  with check (user_id = auth.uid() and public.eh_ativo());

drop policy if exists avisos_editar on public.avisos;
create policy avisos_editar on public.avisos for update
  using (user_id = auth.uid() and public.eh_ativo())
  with check (user_id = auth.uid());

grant select, insert, update on public.avisos to authenticated;
