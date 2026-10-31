-- 교육용 새 프로젝트에서 한 번 실행합니다. 기존 테이블은 삭제하지 않습니다.
begin;
create table public.kpi_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  source_id text,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  team text not null check (length(btrim(team)) between 1 and 80 and team = btrim(team)),
  target bigint not null check (target between 0 and 9007199254740991),
  actual bigint not null check (actual between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (user_id, month, team),
  unique (user_id, source_id)
);
-- user_id가 선두인 유일 인덱스가 사용자별 조회와 RLS 검사를 지원합니다.
alter table public.kpi_records enable row level security;
revoke all on public.kpi_records from anon;
grant select, insert, update, delete on public.kpi_records to authenticated;
create policy kpi_select_own on public.kpi_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy kpi_insert_own on public.kpi_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy kpi_update_own on public.kpi_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy kpi_delete_own on public.kpi_records for delete to authenticated
  using ((select auth.uid()) = user_id);
commit;
