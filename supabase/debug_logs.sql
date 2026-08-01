create table if not exists debug_logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  contexto text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table debug_logs enable row level security;

create policy "usuarios insertan sus propios logs"
  on debug_logs for insert
  with check (auth.uid() = usuario_id);
