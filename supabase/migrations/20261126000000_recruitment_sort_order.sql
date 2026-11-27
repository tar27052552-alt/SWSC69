-- Persist leader-defined 1..29 roster order for recruitment_members
alter table public.recruitment_members
  add column if not exists sort_order integer not null default 0;

create index if not exists recruitment_members_party_order_idx
  on public.recruitment_members(party_id, sort_order asc, is_leader desc, created_at asc);
