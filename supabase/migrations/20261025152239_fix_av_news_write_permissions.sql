-- Match the existing AV news form, without granting access to announcements.
alter policy web_news_manage on public.web_news to authenticated
using (
 (select private.is_council_leader()) or (select private.can_manage_department(5))
 or ((select private.can_manage_department(9)) and category not in ('ประกาศ','ประกาศ_ซ่อน'))
)
with check (
 (select private.is_council_leader()) or (select private.can_manage_department(5))
 or ((select private.can_manage_department(9)) and category not in ('ประกาศ','ประกาศ_ซ่อน'))
);
