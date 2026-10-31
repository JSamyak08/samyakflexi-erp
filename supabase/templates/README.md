# Auth email templates

Hosted Supabase does not read these files on deploy. Paste each file into
**Authentication → Emails** (or **Authentication → Email Templates**) for the
production project `eamstsaqkbeiywfaanhi`. The link host is `{{ .SiteURL }}`,
so the message never shows `supabase.co`.

`{{ .SiteURL }}` must be `https://erp.samyakinternational.in`. The app route
`/auth/confirm` reads `token_hash` and `type`, calls `verifyOtp`, and for
recovery or invite continues at `/reset-password`.

| Dashboard template | File | `type` |
| --- | --- | --- |
| Reset password | `recovery.html` | `recovery` |
| Invite user | `invite.html` | `invite` |
| Confirm signup | `confirmation.html` | `signup` |
| Magic link | `magic_link.html` | `magiclink` |
| Change email address | `email_change.html` | `email_change` |

## Dashboard settings the owner must save

Authentication → URL configuration:

- **Site URL:** `https://erp.samyakinternational.in`
- **Redirect URLs:**
  - `https://erp.samyakinternational.in/**`
  - `http://localhost:5173/**`
  - `http://127.0.0.1:5173/**`

Do not add `https://*.vercel.app/**` or `https://*.supabase.co/**`. A preview
deployment can still be opened for UI testing. Password, invite, and confirm
links always use the production origin.

After the templates are saved, send one reset to a company address and confirm
the message link starts with `https://erp.samyakinternational.in/auth/confirm`.
