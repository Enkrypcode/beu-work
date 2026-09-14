# Production preflight review

Status: complete. The production preflight supports the revised proposal. Do not run `20260914_company_work.sql` until the user explicitly approves it. No migration has been applied.

## Result 2 · Live tasks columns

User-provided production output verifies `public.tasks` has exactly the expected eleven columns: `id`, `user_id`, `title`, `notes`, `category`, `deadline`, `sort_order`, `status`, `created_at`, `updated_at`, and `completed_at`.

`user_id` is the non-null ownership field and defaults to `auth.uid()`. `sort_order` is a non-null integer with default `0`; `status` is a non-null text field with default `active`; `deadline` is a nullable date. `visibility` does not exist. No current column is an equivalent sharing mechanism, so the proposed `visibility` field remains an additive schema change rather than a rename or reuse. The output does not by itself confirm constraints or access policies; those remain pending.

## Result 3 · Live profiles columns

User-provided production output verifies `public.profiles` has `user_id`, `full_name`, `job_title`, `is_super_admin`, `created_at`, and `updated_at`. `user_id` is non-null; `full_name` and `job_title` are nullable text; `is_super_admin` is non-null boolean with default `false`.

This matches the existing helper and the Work display model. Work must project only `user_id`, `full_name`, and `job_title`; it must never return `is_super_admin` to the browser. The table output does not show its primary/foreign key constraints or authorization rules, so RLS, policies, grants, and constraints still determine whether the model is safe to use.

## Result 4 · RLS state

User-provided production output verifies RLS is enabled on both `public.tasks` and `public.profiles`. RLS is not forced for either table.

Browser roles therefore require applicable policies. A table owner can bypass RLS, which is expected for the trusted owner of the existing and proposed SECURITY DEFINER functions; it does not grant browser clients access by itself. The actual policy expressions are still required before assessing private-task protection or profile-role protection.

## Result 5 · Live RLS policies

User-provided production policies confirm `public.tasks` is owner-only for every operation: SELECT, INSERT, UPDATE, and DELETE require `auth.uid() = user_id` (INSERT/UPDATE use the equivalent `WITH CHECK`). Although the task policies target `public`, anonymous callers have no `auth.uid()` and therefore do not satisfy them.

This is the required foundation for Work. Do not add a broad company-task SELECT policy: Priority's existing task queries rely on owner-only RLS and would otherwise display coworkers' shared records in My Work. The proposed parameterless `beu_work_snapshot()` SECURITY DEFINER function remains the appropriate separate, company-only read surface.

Profile SELECT allows an authenticated user to read their own profile or, dynamically, all profiles through `is_beu_priority_super_admin()`. Profile UPDATE also requires the existing helper for both visibility and the new row. The upcoming table/column grant checks must still verify that ordinary authenticated users cannot update `is_super_admin`, and that no unexpected grant bypasses the policy model.

## Result 6 · Live table grants

User-provided production output confirms that `authenticated` has SELECT on `profiles`, but no table-level UPDATE, INSERT, or DELETE privilege. `anon`, `authenticated`, and `service_role` have normal table privileges on `tasks`; task RLS still limits browser calls to `auth.uid() = user_id`. Anonymous task grants do not permit task access because an anonymous request has no authenticated user ID.

The absence of table-level authenticated UPDATE on `profiles` protects against broad profile changes. The next column-grant result is still necessary because PostgreSQL can grant UPDATE at an individual-column level. In particular, it must show no authenticated UPDATE grant for `profiles.is_super_admin`. If it shows narrow grants for `full_name` and `job_title`, that is compatible with the Super Admin profile policy; if it shows an `is_super_admin` grant, do not run the migration.

## Result 7 · Live column grants

User-provided production output confirms `authenticated` has UPDATE only for `profiles.full_name` and `profiles.job_title`. It has no UPDATE privilege for `profiles.is_super_admin`, `user_id`, or the profile timestamps. This is the required protection for the existing `is_beu_priority_super_admin()` helper: an ordinary authenticated user cannot promote themself through the browser role.

The narrow writable profile fields are compatible with the existing Super Admin UPDATE policy. The remaining task rows shown are ordinary task-column grants; owner-only RLS remains the controlling restriction. Constraints are still needed to verify the `auth.users` profile relationship and actual task status rules.

## Result 8 · Live constraints

User-provided production output verifies that `profiles.user_id` is both the primary key and a foreign key to `auth.users(id)` with `ON DELETE CASCADE`. `tasks.user_id` independently references the same Auth identity with `ON DELETE CASCADE`; `tasks.id` is the primary key.

The deployed task constraints also limit `status` to `active` or `done` and require nonblank titles. This confirms there is one shared identity relationship for the proposed monitoring ACL and no new task status field is needed. The proposal's `beu_work_members.user_id → profiles.user_id` relationship is compatible with the deployed profile key. Existing user deletion behavior remains unchanged.

## Result 9 · Live indexes

User-provided production output verifies the `tasks_user_sort_order_idx` index on `(user_id, status, sort_order)`, plus primary-key indexes for tasks and profiles. This aligns with Priority's owner-specific task ordering.

It does not cover a company-wide query filtered by a future visibility value. The proposed partial index on shared work remains additive and avoids changing Priority's existing index or query behavior. The final remaining check is public-schema privileges, which is relevant because the existing Super Admin helper uses `search_path=public`.

## Result 10 · Public-schema privileges

User-provided production output shows only `pg_database_owner` has CREATE on `public`. `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role` have USAGE only.

This means untrusted browser-facing roles cannot create an object in `public` that could shadow a name used by the existing helper's `search_path=public`. The existing helper can be preserved unchanged. The proposed Work function continues to use the stronger `search_path = ''` convention and schema-qualified object names.

## Consolidated decision

The revised proposal is compatible with the verified production schema and security model:

- It adds `tasks.visibility` only; existing task ownership, status, ordering, and RLS policies are untouched.
- The new field defaults to `private`, so no existing task becomes visible to Work.
- It adds a company-only partial index without replacing the existing owner-first index.
- It preserves the existing `public.is_beu_priority_super_admin()` helper and evaluates it at runtime on every Work snapshot request.
- It adds `beu_work_members` only for explicitly approved non-Super-Admin monitors; it contains existing profile IDs, not users or duplicate profiles.
- It keeps all existing task policies owner-only. Work reads only through a parameterless, membership/role-gated SECURITY DEFINER function that always filters `visibility = 'company'`.
- The function projects no notes, emails, Super Admin flags, private counts, or private task rows; anonymous execution is revoked.

Recommendation: the database proposal is ready for explicit approval to apply in the existing Supabase SQL Editor, after reviewing the final SQL file. The Priority UI change remains a separate implementation and approval step. It must preserve visibility through all task upsert and reorder paths before any owner can share work. Do not deploy Work until the migration and Priority change have been validated in a staging or controlled production acceptance test.

## Post-migration verification

User reported that the approved migration completed successfully once. Read-only, zero-row API checks then confirmed that `tasks.visibility` exists, that anonymous callers are denied execution of `beu_work_snapshot()`, and that anonymous callers are denied access to `beu_work_members`. No task content was read during these checks.

The next approved implementation change is in BEU Priority only: owner-controlled visibility editing. It updates the existing `tasks.visibility` field and does not change any Supabase RLS policy or deploy either application.

## Result 1 · Existing Super Admin helper

User-provided production output confirms `public.is_beu_priority_super_admin()` exists as a STABLE SQL SECURITY DEFINER function with `search_path=public`. It reads `public.profiles.is_super_admin` for `user_id = auth.uid()` and returns false when no matching profile exists. The supplied ACL shows EXECUTE available to PUBLIC, postgres, anon, authenticated, and service_role.

Preserve this function, its authorization model, and existing policies. Do not replace its body, change its grants, or introduce a second Super Admin role. The helper evaluates the calling identity's existing profile flag; it does not itself grant access to tasks, authorize reading private work, or verify the surrounding table policies.

The unapplied Work proposal now calls the existing helper at runtime. It no longer seeds or copies Super Admin membership. A later profile role change therefore changes Super Admin monitoring access immediately on the next request. `beu_work_members` is retained solely for explicitly approved non-Super-Admin monitors. The shared-task predicate remains mandatory for every caller, including Super Admins; there is no private-task admin bypass. This is not approval for broader employee access.

The current helper's search path and execute grants are recorded as existing production configuration, not altered by this review. Remaining grants/policies must be reviewed before assessing security; the helper output alone does not establish whether untrusted roles can modify profiles or create objects in the public schema.

## Remaining evidence

- Actual task/profile columns and defaults, including any equivalent sharing field.
- All task/profile policies, including SELECT conditions and UPDATE WITH CHECK conditions.
- RLS enabled/forced flags.
- Table and column grants, particularly whether `is_super_admin` is protected against ordinary user updates.
- Primary/foreign keys and status/ownership constraints.
- Any remaining preflight function results.

Next action: review the remaining user-provided outputs, then prepare a consolidated recommendation and any necessary local proposal revision. BEU Priority source and production Supabase remain unchanged.
