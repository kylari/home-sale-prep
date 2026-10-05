revoke execute on function public.audit_and_stamp(), public.audit_write(), public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_member(), public.can_edit(), public.is_owner() from public, anon;
grant execute on function public.is_member(), public.can_edit(), public.is_owner() to authenticated;
