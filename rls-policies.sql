-- ============================================================
-- RLS-политики для банка заданий
-- Выполните в Supabase → SQL Editor → Run
-- ============================================================

-- Включить RLS (если ещё не включён)
alter table tasks enable row level security;
alter table type_names enable row level security;
alter table number_map enable row level security;

-- Удалить старые политики (чтобы не дублировались)
drop policy if exists "tasks_all" on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_insert" on tasks;
drop policy if exists "tasks_update" on tasks;
drop policy if exists "tasks_delete" on tasks;

drop policy if exists "type_names_all" on type_names;
drop policy if exists "type_names_select" on type_names;
drop policy if exists "type_names_insert" on type_names;
drop policy if exists "type_names_update" on type_names;
drop policy if exists "type_names_delete" on type_names;

drop policy if exists "number_map_all" on number_map;
drop policy if exists "number_map_select" on number_map;
drop policy if exists "number_map_insert" on number_map;
drop policy if exists "number_map_update" on number_map;
drop policy if exists "number_map_delete" on number_map;

-- ------------------------------------------------------------
-- ВАРИАНТ A (рекомендуется сейчас): сайт без входа
-- Читать и писать может любой с anon-ключом
-- Удобно для школы / теста. Позже можно ужесточить.
-- ------------------------------------------------------------

-- tasks
create policy "tasks_select" on tasks for select using (true);
create policy "tasks_insert" on tasks for insert with check (true);
create policy "tasks_update" on tasks for update using (true) with check (true);
create policy "tasks_delete" on tasks for delete using (true);

-- type_names
create policy "type_names_select" on type_names for select using (true);
create policy "type_names_insert" on type_names for insert with check (true);
create policy "type_names_update" on type_names for update using (true) with check (true);
create policy "type_names_delete" on type_names for delete using (true);

-- number_map
create policy "number_map_select" on number_map for select using (true);
create policy "number_map_insert" on number_map for insert with check (true);
create policy "number_map_update" on number_map for update using (true) with check (true);
create policy "number_map_delete" on number_map for delete using (true);

-- Готово. Проверка: Table Editor → tasks → попробуйте добавить строку вручную
-- или добавьте задание на сайте.
