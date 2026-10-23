# FlexiERP

## Database migrations

`supabase/migrations` is what the Supabase GitHub integration applies when `main` changes. Files whose version is already in production project `eamstsaqkbeiywfaanhi` are not run again.

The RLS lockdown is `supabase/migrations/20261024023000_auth_rls_lockdown.sql`. It runs with the identity guard, the secret-copy removal, and the private storage migration. `supabase/manual/20261019120000_auth_rls_lockdown.sql` is the earlier draft and must not be run again.

SMTP sending uses the server environment (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`). The database no longer stores that password.

There is no `supabase/config.toml`, `supabase/seed.sql`, or `supabase/functions`. `supabase/rollback` is comments only. `supabase_schema.sql` at the repo root is historical and must not be run.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
