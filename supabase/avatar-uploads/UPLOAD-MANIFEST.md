# Prepared profile avatars

These square WebP files are derived from the user-provided photos without filters or retouching. After the approved migration is applied, upload each file to the private `profile-avatars` bucket using this object path pattern:

`<profiles.user_id>/avatar.webp`

| Profile | Prepared file |
| --- | --- |
| Kamal Fikri Nabawi | `kamal-fikri-nabawi.webp` |
| Gisela Luigi Septiana | `gisela-luigi-septiana.webp` |
| Riski Nova Sari | `riski-nova-sari.webp` |
| Advira Yunita S. Yunan | `advira-yunita-s-yunan.webp` |

Set that object path in `public.profiles.avatar_path` for the matching existing user ID. Do not use email addresses as object names.
