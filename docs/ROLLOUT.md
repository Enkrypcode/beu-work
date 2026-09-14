# Production proposal and next steps

No steps below have been applied to BEU Priority or production Supabase.

## Verify first

Run `supabase/preflight.sql` read-only in the existing Supabase SQL Editor. Verify actual task/profile columns, constraints, grants, all SELECT policies, and any existing sharing field. Confirm no admin or permissive policy exposes coworkers' private tasks. Review existing security-definer functions and the ability to elevate `is_super_admin`. Reuse any actual sharing field instead of applying the proposed column blindly.

Approve who may monitor company-shared work. Priority offers signup, so merely having an Auth user or profile is insufficient authorization for company monitoring. The proposed ACL initially enrolls only existing Super Admin profiles; other employees can sign in but require explicit enrollment to see monitoring data. Profile cards include approved monitors and contributors, with no emails or admin role flags. Decide whether a wider employee directory is needed later.

## Database proposal

Review `supabase/proposals/20260914_company_work.sql`. It adds a private-default visibility column, partial shared-task index, minimal monitoring ACL, and parameterless read-only snapshot function. Existing rows remain private. No backfill shares any work, and existing task CRUD policies and ownership remain unchanged. No notification infrastructure is touched.

SECURITY DEFINER is a deliberately narrow read surface: auth.uid() must be in the ACL, the task predicate always requires company visibility, the search path is empty, anonymous/public execute is revoked, and only minimal profile columns are projected. The function must be created by a trusted database owner, and no untrusted role may replace it or modify membership. Actual production grants and policies still need verification. Staging security tests should use real employee JWTs, including ordinary/nonmember/admin/anonymous cases.

An approved administrator can enroll an existing employee by inserting their approved `profiles.user_id` into `beu_work_members` in SQL. Do not use emails, names, or roles as browser-side authorization. Removing membership denies the next snapshot. Keep membership maintenance outside V1's frontend.

## Required BEU Priority change (separate approval)

Update the existing task form with `Share to BEU Work [OFF / ON]`, OFF by default. Explain that title, category, priority position, deadline, status, and official owner profile become visible to approved company monitors. Task notes remain excluded from Work V1.

The inspected Priority frontend maps rows through `fromRow()` and writes through `toRow()`, including batch upserts during priority reordering. The proposed change must:

1. Read `row.visibility` into the task model, defaulting to private.
2. Explicitly write the task's current visibility through `toRow()` for every create/upsert/reorder path; never rely on omitted values preserving sharing during an upsert.
3. Create all new/imported tasks private unless the owner deliberately enables sharing.
4. Preserve sharing while editing, completing, restoring, or reordering existing tasks.
5. Let the owner turn sharing off without deleting or duplicating the task.
6. Test both regular refresh queries and realtime updates while preserving My Work's owner scope.

Do not expose the toggle before the database column is approved and installed. Do not broaden the underlying task SELECT policy. Optional explicit `.eq('user_id', user.id)` queries provide additional clarity in Priority, but they do not replace owner RLS and are not part of the changes already made.

## Acceptance test after approval

Using staging and existing test employee identities: create one private task in Priority, verify no Work list, metrics, dashboard, or detail response includes it; share that same record, verify it appears with its owner's actual profile; edit/reorder/complete it in Priority, verify the same ID updates in Work; turn sharing off, verify the next snapshot excludes it. Verify an admin cannot retrieve coworkers' private records, a monitor cannot edit or delete coworkers' tasks, and an anonymous/nonmember caller is denied. Also verify Priority still lists only the owner's tasks.

BEU Work refreshes safe data every 30 seconds while visible. Normal refresh preserves rendered shared data and detail/focus; failed authorization/verification hides cached data. Already-delivered shared data cannot be recalled from a browser. No background caching to localStorage or service-worker cache is added.

## Deployment later

Only after an explicit deployment request, create a separate Vercel project for this independent repository and configure only the same browser-safe Supabase URL/key. Reserve `beu-work.vercel.app` if available. Verify Supabase URL allowlists as needed without disturbing Priority. Do not copy `.vercel` linkage, notification secrets, cron jobs, or infrastructure from Priority.
