-- Managed PostgREST 14 retries SQLSTATE 40001 (serialization_failure).
-- Application version/active-avatar conflicts are deterministic, not retryable
-- engine serialization failures. Emit PT409 (HTTP 409) for these business cases.
-- Apply AFTER 001 -> 002 -> 003, including every full-chain reapplication.
-- Only exact reviewed function bodies (or this exact patch) are accepted.
-- No data, signature, ownership, grants, RLS, locks or operation IDs are changed.
begin;
do $migration$
declare
 expected record;
 f record;
 definition text;
 current_hash text;
 after_hash text;
 after_acl aclitem[];
 changed integer := 0;
begin
 for expected in select * from (values
 ('save_content',2,'6355b9b7b47af288e1c06785441e12534639a6d43758ca83b859aa34771d4149','9942aed00a1f30effc57e1ec711e3ad9e31b082a3a5d5acc9fb2e06da1d7abb3'),
 ('delete_content',1,'0f60e3f954e1a0a378239aef5e1ce03a874ffc709756f6c219a09486e9386c3b','40c7728b396c6f694875b2a3d444f95f18625d3b6151b9d095b1e7875b7baa31'),
 ('save_mood',1,'ab61c7a0530877c7b453cfca05aeb83ea3e4d0509bf715ba548e40808a1ebe7d','f99303789a8b327de4d2062b8db9e9390eab5edb8f19783bbe0cd4e4a8d567f0'),
 ('change_flower',1,'a9baf6bde0ab34987ceb271897c9fea55bcfa28435a27d3b2d3afecc347271d5','3033bb4dfc5891218ff6fc02784987aad62e9ff87be79f91d230de5990167735'),
 ('save_my_profile',1,'d65fb4015f6f5c789fe7288c9bb9c8cf04dc918732bee1fc476f1692d7c2dda6','4a4b65050c2dcc0fe83051113bc8e1484eab8da2a801ac735dce62b063004c7e'),
 ('save_my_preferences',1,'8b1d6e328ef344c7a7307e1a90856bb2eb761ad514f215088fbc150300ada7ae','1a58cd49d1c7082a81f025d0499c87569d40a8ac24f549e47957fc53e3875d1a'),
 ('reserve_avatar',1,'e7642fa21bdf85728bda9edf5db593bd174e77f2ab708881f26abdc8d0c9e483','93e5626c355cfb886d7c55543c1c66d3d685944a57097aabfdc96cbaecb4cab0'),
 ('finalize_avatar',2,'60e09756477f1e16a3ff882fb29fd5fb9e957a501208157cfa052e792b6fb23e','425c2284d72e81da4ce426d67705b3ab9d7357326905b73f76664a4292f7dec7')
 ) as approved(name,raises,old_sha256,new_sha256)
 loop
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=expected.name)<>1 then
   raise exception 'Missing/overloaded reviewed conflict function: %',expected.name;
  end if;
  select p.* into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=expected.name;
  if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then
   raise exception 'Unsafe reviewed conflict function configuration: %',expected.name;
  end if;
  current_hash:=encode(sha256(convert_to(f.prosrc,'UTF8')),'hex');
  if current_hash=expected.new_sha256 then
   continue;
  end if;
  if current_hash<>expected.old_sha256 then
   raise exception 'Unreviewed conflict function body: %',expected.name;
  end if;
  if (length(f.prosrc)-length(replace(f.prosrc,'errcode=''40001''','')))/length('errcode=''40001''')<>expected.raises then
   raise exception 'Conflict raise count changed: %',expected.name;
  end if;
  definition:=replace(pg_get_functiondef(f.oid),'errcode=''40001''','errcode=''PT409''');
  execute definition;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),p.proacl
   into after_hash,after_acl from pg_proc p where p.oid=f.oid;
  if after_hash is distinct from expected.new_sha256 or after_acl is distinct from f.proacl then
   raise exception 'Conflict body/grant verification failed: %',expected.name;
  end if;
  changed:=changed+1;
 end loop;
 raise notice 'Business-conflict HTTP compatibility: % function bodies updated',changed;
end $migration$;
notify pgrst,'reload schema';
commit;
