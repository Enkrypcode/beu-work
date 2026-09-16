-- PROPOSAL ONLY. Do not apply until reviewed and approved.
-- Fixes private avatar reads for BEU Work monitors without granting direct access
-- to public.beu_work_members from Storage RLS.
begin;

create or replace function public.is_beu_work_monitor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_beu_priority_super_admin()
    or exists (
      select 1
      from public.beu_work_members m
      where m.user_id = auth.uid()
    );
$function$;

revoke all on function public.is_beu_work_monitor() from public, anon;
grant execute on function public.is_beu_work_monitor() to authenticated;

drop policy "BEU avatar reads are limited to the owner or work monitors" on storage.objects;

create policy "BEU avatar reads are limited to the owner or work monitors"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_beu_work_monitor()
  )
);

commit;