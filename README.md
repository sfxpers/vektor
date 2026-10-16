# Vektor

South African tender compliance for contractors. Sign up, set up a company profile, keep Tax / COIDA / B-BBEE documents current, analyse a tender PDF, and pay for credits by EFT.

Runs on Cloudflare Workers with TanStack Start, D1, R2, better-auth, and shadcn/ui.

Production: [vektorhq.co.za](https://vektorhq.co.za)

## Setup

[Vite+](https://viteplus.dev) (`vp`) runs everything: it uses the Node in `.node-version` and the pnpm in `package.json`, and ships Vite, Vitest, Oxlint, and Oxfmt as one set, pinned in `pnpm-workspace.yaml`. `vp install` also sets up the pre-commit hook, which checks what is staged.

```sh
curl -fsSL https://vite.plus | bash   # once per machine
vp install
vp exec playwright install chromium webkit
vp run dev                            # applies local D1 migrations, then http://127.0.0.1:5173
```

Copy `.dev.vars.example` to `.dev.vars` if it is not created for you. All email goes through Resend (`RESEND_API_KEY` required, even locally). Tender analysis uses the Workers AI binding: wrangler must be logged in to the Cloudflare account (`vp exec wrangler login`).

## Commands

```sh
vp check                   # format, lint, and type check (vp check --fix to fix)
vp test                    # Vitest unit tests
vp run test:e2e            # resets local D1, builds, then Playwright and axe against the preview server
vp build                   # Cloudflare Workers production build
vp preview                 # the production build, locally
vp run deploy              # build and deploy with Wrangler
vp run db:migrate:local    # or db:migrate:remote
vp run seed:admin          # first admin (ADMIN_EMAIL / ADMIN_PASSWORD required)
vp run clean               # generated output
```

UI uses shadcn/ui (`base-nova`). Add components with:

```sh
vp dlx shadcn@latest add button --yes
```

CI ([`.github/workflows/check.yml`](.github/workflows/check.yml)) runs `vp check` and `vp test run` on Ubuntu for every pull request and every push to `main`. `vp run test:e2e` runs locally: it sends real email through Resend and real tender analyses through Workers AI, so it needs a working `RESEND_API_KEY` in `.dev.vars` and `vp exec wrangler login`.

## Deploy

GitHub Actions deploys: the `deploy` job in [`.github/workflows/check.yml`](.github/workflows/check.yml) runs `vp run deploy` on every push to `main`, and only after Check passes, so a change whose tests fail never reaches production. Pull requests are checked, not deployed. Cloudflare builds nothing itself: the Worker is not connected to Git.

The job reads these from the repository's **Settings → Secrets and variables → Actions**:

| Name                    | Kind     | Purpose                                                                  |
| ----------------------- | -------- | ------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Secret   | User API token from the "Edit Cloudflare Workers" template, Work account |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | The Work account                                                         |

`vp run deploy` also works from a laptop after `vp exec wrangler login`.

The deploy does not migrate D1. Run `vp run db:migrate:remote` before merging a change that adds a migration.

## Production secrets

Set these with `wrangler secret put` (or the dashboard) before the first deploy. Do not put them in `wrangler.jsonc`.

| Secret                                         | Purpose                                      |
| ---------------------------------------------- | -------------------------------------------- |
| `BETTER_AUTH_SECRET`                           | Session signing (≥32 chars)                  |
| `BETTER_AUTH_URL`                              | Public origin, e.g. `https://vektorhq.co.za` |
| `APP_URL`                                      | Same public origin (email links, referrals)  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`    | Google OAuth (Cloud Console → Credentials)   |
| `RESEND_API_KEY`                               | Transactional email                          |
| `EMAIL_FROM` or `SENDER_NAME` + `SENDER_EMAIL` | Default `Vektor <no-reply@vektorhq.co.za>`   |
| `EFT_BANK_NAME`                                | Shown on billing                             |
| `EFT_ACCOUNT_HOLDER`                           |                                              |
| `EFT_ACCOUNT_NUMBER`                           |                                              |
| `EFT_BRANCH_CODE`                              |                                              |
| `EFT_ACCOUNT_TYPE`                             | Defaults to `Cheque` if unset                |

The Worker name is `vektor`. Workers AI is enabled via the `AI` binding in `wrangler.jsonc`. The account must have Workers AI on.

After secrets: `vp run db:migrate:remote`, then deploy.
