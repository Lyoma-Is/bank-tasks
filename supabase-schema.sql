-- Выполните в Supabase → SQL Editor

-- Задания
create table if not exists tasks (
  code text primary key,
  number int not null,
  title text default '',
  difficulty text default 'medium',
  text text not null default '',
  answer text default '',
  answer_table jsonb,
  answer_type text default 'text',
  solution text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Названия типов заданий (1 → «Анализ информационных моделей»)
create table if not exists type_names (
  number int primary key,
  name text not null default ''
);

-- Переименование номеров: 2 → 102
create table if not exists number_map (
  old_number int primary key,
  new_number int not null
);

-- RLS
alter table tasks enable row level security;
alter table type_names enable row level security;
alter table number_map enable row level security;

-- Политики (для разработки: полный доступ через anon key)
-- В продакшене ограничьте через Auth!
drop policy if exists "tasks_all" on tasks;
create policy "tasks_all" on tasks for all using (true) with check (true);

drop policy if exists "type_names_all" on type_names;
create policy "type_names_all" on type_names for all using (true) with check (true);

drop policy if exists "number_map_all" on number_map;
create policy "number_map_all" on number_map for all using (true) with check (true);

-- Индекс для фильтра по номеру
create index if not exists tasks_number_idx on tasks (number);
