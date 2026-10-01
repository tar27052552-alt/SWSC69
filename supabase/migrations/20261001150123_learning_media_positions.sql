create table public.learning_media_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null,
  subject_id text not null,
  topic_id text not null,
  resource_key text not null check (char_length(resource_key) between 1 and 500),
  updated_at timestamptz not null default now(),
  foreign key (edition_id, subject_id)
    references public.learning_subject_editions(edition_id, subject_id),
  primary key (user_id, edition_id, topic_id)
);
create index learning_media_positions_latest_idx
  on public.learning_media_positions(user_id, edition_id, updated_at desc);
alter table public.learning_media_positions enable row level security;
create policy learning_media_positions_owner_read on public.learning_media_positions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.learning_media_positions from public, anon, authenticated;
grant select on public.learning_media_positions to authenticated;
grant all on public.learning_media_positions to service_role;
