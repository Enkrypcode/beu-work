# Audit and implementation report · 14 September 2026

## BEU Priority discovered

- Accessible at `E:/App/BEU Priority`; inspected read-only. No files changed.
- Vite SPA, plain JavaScript, CSS, `@supabase/supabase-js`, SortableJS, server notification functions. Main frontend files: `src/app.js`, `src/style.css`, `index.html`. SQL is in `supabase/schema.sql` and profile/notification migrations.
- Client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Separate server-only notification keys exist and were not copied into Work.
- Email/password Supabase Auth, session restore, signup in Priority, auth-change listener. Work reuses sign-in only and does not assume cross-origin session transfer.
- `public.tasks`: `id`, owner `user_id` linked to `auth.users.id`, `title`, `notes`, `category`, `deadline` (date), `sort_order` (integer), `status` (`active` or `done`), `created_at`, `updated_at`, `completed_at`. No priority enum: active ordering is ascending `sort_order`, with the first three positions emphasized. Category values include Dokumen, Administrasi, Tender, RKA, Keuangan, Meeting, Safety, IT, Report, Other; Work derives categories from shared records.
- Source RLS grants task SELECT/INSERT/UPDATE/DELETE only to the owner; updates enforce unchanged ownership. No admin task-read override exists in the inspected SQL. Priority's normal and refresh queries do not explicitly filter ownership, relying on RLS.
- `public.profiles`: `user_id` primary key referencing `auth.users.id`, `full_name`, `job_title`, `is_super_admin`, creation/update timestamps. No profile email column appears in the migration. Source profile SELECT permits own record or all records for Super Admin; official names/job titles are writable by Super Admin only. The initial Super Admin is seeded in Priority's migration, not hardcoded in Work.
- DM Sans body text, Plus Jakarta Sans headings, `#2f7cf6` accent, stack brand mark, pale radial backgrounds, white bordered cards, 8–18px radii, soft shadows. Dark mode uses a root `data-theme` attribute and localStorage/system preference. Responsive header, task cards, mobile input sizes and safe areas are reusable conventions.

## Reachable production evidence and limits

Read-only requests used the existing browser-safe key and zero-row queries, retrieving no task content:

- The exact task columns listed above were accepted (HTTP 200).
- `tasks.visibility` was rejected with PostgreSQL `42703`: column does not exist.
- Anonymous profile read was denied (`42501`), consistent with protected profiles but insufficient to verify column definitions under that role.
- OpenAPI metadata required a secret API key and was unavailable through the configured credentials.
- Live profile structure, foreign key definitions, policies, grants, function ownership, and whether an equivalent sharing field exists under another name cannot be fully verified through this API. Source SQL is evidence of intended configuration, not proof of deployed RLS.

Read-only `supabase/preflight.sql` prepares the missing verification. The proposal explicitly aborts if visibility is already present. Do not apply it until all task columns are inspected for an equivalent sharing mechanism and actual policies reviewed.

User-provided production preflight is complete. It verifies the deployed `public.is_beu_priority_super_admin()` helper, task/profile schema, RLS state, owner-only task policies, profile policies, table/column grants, constraints, indexes, and public-schema privileges. The helper and authorization model are preserved and reused at runtime; no membership is seeded or copied from the Super Admin flag. See `docs/PREFLIGHT-REVIEW.md` for findings and the pending approval boundary.

## BEU Work created

- Independent Vite/JavaScript SPA and local Git repository in `E:/App/BEU Work`; same Supabase URL/browser-safe key, independent session storage and theme preference.
- Auth plus profile display through the safe snapshot response. Profile/task relation uses shared `user_id`; no duplicated tasks, profiles, or accounts.
- Dashboard: Shared Works, Connected Accounts, High Priority, Upcoming Deadlines, Combined Priority Feed, Priority Sources, upcoming deadline list, and category bars.
- Work: search, person/category/priority/deadline/status filters, responsive read-only table/cards, and task detail.
- People: minimal official profiles and metrics from shared tasks only; click-through to filtered work.
- Queries: `beu_work_snapshot()` RPC only. No direct table read fallback, task mutations, or private realtime subscriptions. Frontend additionally rejects any response containing a task without explicit company visibility.
- Proposed production tables used: original `tasks`, original `profiles`, additive `beu_work_members` access list. Existing `auth.users` supplies identities; the ACL references profiles, not a new account system.
- Shared/private mechanism: additive constrained `tasks.visibility`, not null, default private. No production changes have been applied.
- RLS/security: retain all current Priority owner policies; a parameterless SECURITY DEFINER RPC exposes only company records. Existing Super Admin authorization is evaluated through `public.is_beu_priority_super_admin()` on every request; `beu_work_members` is an inaccessible-to-browser ACL only for explicitly approved non-admin monitors. No admin sharing bypass. Inspect deployed RLS before approval.

## Files

`package.json`, `package-lock.json`, `.gitignore`, `.env.example`, ignored browser-only `.env.local`, `index.html`, `public/assets/logo-mark.svg` (copied brand asset), `src/app.js`, `src/data.js`, `src/model.js`, `src/style.css`, `supabase/preflight.sql`, `supabase/proposals/20260914_company_work.sql`, `tests/model.test.js`, `tests/security.test.js`, `scripts/browser-check.mjs`, `README.md`, and the reports in `docs/`.

## Remaining approved-work boundary

Production migration and monitoring membership are proposals awaiting approval. Priority still requires the explicit OFF/ON sharing control and round-trip preservation of visibility through create, edit, complete, restore, and reorder. These changes are documented in ROLLOUT.md and have not been made. Neither frontend has been deployed; Work's future Vercel project is not created.

## Validation

Production build passes; all five automated model/database tests pass. Browser checks pass at 1440, 1024, 820, 390, and 320 pixels for the three pages, search/filters, person navigation, task detail, theme switching, rejected private responses, and horizontal-overflow checks. Local screenshots were visually inspected. Test fixtures never request production data. Installed dependencies report zero known vulnerabilities at installation. No production end-to-end claim is made while the migration and Priority change remain unapplied.
