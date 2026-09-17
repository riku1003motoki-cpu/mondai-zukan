-- 問題図鑑の自動同期用テーブル。Supabase の SQL Editor で一度だけ実行します。
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version": 2, "problems": []}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- ログインした本人だけが、自分のデータを読んだり保存したりできる設定です。
create policy "Users read own data"
on public.user_data for select
to authenticated
using (auth.uid() = user_id);

create policy "Users insert own data"
on public.user_data for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users update own data"
on public.user_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
