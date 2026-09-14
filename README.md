# BEU Work

Internal, read-only monitoring for PT Banggai Energi Utama. Separate Vite/JavaScript frontend, same Supabase project and existing Auth identities as BEU Priority. No deployment has been performed.

## Local use

Use Node 20.19+ or 22.12+. Run `npm install`, `npm run dev`, `npm run build`, and `npm test` in this folder. `.env.local` contains only the existing project's URL and browser-safe key, copied from Priority; it is ignored by Git. Never add service-role, notification, or cron secrets. The browser uses its own `beu-work-auth` session storage key and signs in with the existing account. No account creation is offered.

Dashboard, Work, and People are implemented. Work supports search plus PIC, category, priority, deadline, and status filters. Selecting a person opens only their shared work. Desktop tables become cards on tablet/mobile. Light/dark themes, safe-area spacing, keyboard focus, accessible detail dialogs, loading, empty, and error states are included. No task writes or future modules are implemented.

## Approval boundary

The production `visibility` column does not exist. Consequently the monitoring endpoint is not installed and the app deliberately shows an unavailable state after sign-in. No fallback reads from `tasks` exist. There are no fake employees or statistics in the app. Isolated fixtures exist only in tests.

1. Run and review [supabase/preflight.sql](supabase/preflight.sql) in the existing project's SQL Editor. It is read-only.
2. Review [docs/AUDIT.md](docs/AUDIT.md) and [docs/ROLLOUT.md](docs/ROLLOUT.md).
3. Run [the remaining preflight queries](docs/REMAINING-PREFLIGHT-QUERIES.sql) one at a time and review the results.
4. Obtain approval for the schema proposal, monitoring membership rules, and the Priority sharing UI change.
4. Test against staging before applying approved changes to production.

The proposed `beu_work_snapshot()` function reads original task records. It checks explicit `beu_work_members` membership and always selects `visibility = 'company'`, even for Super Admins. The access list references existing profiles and creates no second employee identity database. Initial proposed members come from the existing `profiles.is_super_admin` flag. Other existing employees require explicit administrator enrollment. Approve who may monitor before rollout.

Task RLS is preserved with no new broad SELECT policy. This is essential because Priority currently loads `tasks` without an ownership filter and depends on owner-only RLS. The function returns minimal profile fields for approved monitoring accounts and company contributors. It does not return emails, admin flags, task notes, or private counts. It uses SECURITY DEFINER only to read shared records across owners without broadening underlying table access, pins an empty search path, takes no arguments, and revokes anonymous execution.

Same Supabase identity/role credentials are not restricted to a web origin: an owner remains authorized to access their own private tasks through Priority's existing API. BEU Work's dedicated monitoring endpoint never returns those private tasks. A strict guarantee that credentials used in Work cannot call any owner API would require separate backend authorization scope; it cannot be provided by a frontend origin or CORS setting. This design preserves the requested shared identities and Priority behavior.

The app refreshes every 30 seconds while visible and on focus/manual refresh. It keeps the current shared view during successful background refreshes. On a failed verification or access error, it hides the last view. Unsharing/deleting is reflected on the next refresh; data already delivered to a browser cannot be retroactively withdrawn. No private record events are subscribed to.

High Priority means active work with `sort_order` 0–2 (owner positions 1–3), matching Priority's emphasis. The stored owner position is displayed, without re-ranking shared-only tasks or manufacturing a priority enum. Due This Week means today through Sunday, excluding completed/overdue tasks; Upcoming Deadlines means today through seven calendar days ahead. Connected Accounts counts people contributing shared work, not total auth accounts.

## Browser verification

With the local preview running on port 5174, run `node scripts/browser-check.mjs`. It uses installed Chrome (override `BEU_TEST_BROWSER=edge` if needed), blocks production requests, and tests isolated responses at 1440, 1024, 820, 390, and 320 pixels. Override `BEU_TEST_URL` to change the local origin. Screenshots go to ignored `test-results/`. Tests do not require production credentials.

`npm test` uses an isolated PostgreSQL engine to execute the migration proposal and verify privacy, unsharing, live updates, membership checks, anonymous denial, and preserved owner RLS. It is not proof of the deployed production policies; those remain subject to preflight review and staging validation.

BEU Work has independent package configuration and a local Git repository. Its future Vercel project and `beu-work.vercel.app` deployment remain uncreated until deployment is requested.
