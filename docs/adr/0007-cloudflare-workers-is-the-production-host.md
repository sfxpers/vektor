# Cloudflare Workers is the production host

Vektor deploys to Cloudflare Workers with TanStack Start (`@cloudflare/vite-plugin` and Wrangler), D1, and R2. Production is https://vektorhq.co.za. GitHub Actions deploys `main` only after check passes, straight to production. The Worker is not connected to Git. A remote D1 migration is `vp run db:migrate:remote`, run before a merge that adds one; the deploy job does not apply it. Workers Builds was rejected because it deployed `main` whether or not the tests had passed.
