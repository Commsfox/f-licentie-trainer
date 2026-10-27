-- F-licentie oefenapp: database voor gebruikersvoortgang.
-- Plak dit ÉÉN keer in Supabase → SQL Editor → New query → Run.

create table if not exists public.progress (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: iedereen ziet en wijzigt uitsluitend zijn EIGEN rij.
alter table public.progress enable row level security;

drop policy if exists "eigen voortgang lezen"       on public.progress;
drop policy if exists "eigen voortgang toevoegen"   on public.progress;
drop policy if exists "eigen voortgang wijzigen"    on public.progress;
drop policy if exists "eigen voortgang verwijderen" on public.progress;

create policy "eigen voortgang lezen"       on public.progress for select to authenticated using (auth.uid() = user_id);
create policy "eigen voortgang toevoegen"   on public.progress for insert to authenticated with check (auth.uid() = user_id);
create policy "eigen voortgang wijzigen"    on public.progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigen voortgang verwijderen" on public.progress for delete to authenticated using (auth.uid() = user_id);

-- Niet-ingelogde bezoekers (anon) krijgen helemaal geen toegang tot de tabel.
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;

-- Beperk de grootte van één rij (voorkomt misbruik als opslagplaats).
alter table public.progress drop constraint if exists progress_data_size;
alter table public.progress add constraint progress_data_size check (pg_column_size(data) < 2000000);

-- Gebruiker kan zijn eigen account (en via cascade zijn voortgang) verwijderen.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
