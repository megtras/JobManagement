# Megtras Job Management Demo

Standalone Megtras Job Management demo deployed at `https://demo.megtras.com`.

## Cloudflare boundary

This repository owns one independent Cloudflare application:

- Worker: `jobmanagement`
- Custom domain: `demo.megtras.com`
- D1 database: `jobmanagement-db` (`DB` binding)
- R2 uploads: `jobmanagement-uploads` (`UPLOADS` binding)
- R2 framework cache: `jobmanagement-cache` (`NEXT_INC_CACHE_R2_BUCKET` binding)
- Worker self-reference: `jobmanagement` (`WORKER_SELF_REFERENCE` binding)

The corporate website is a separate project at `megtras.com`. It only links to
`https://demo.megtras.com`; this application does not import, call, deploy, or
share infrastructure with the corporate website or any production system.

## First-time Cloudflare setup

Create resources in the Cloudflare account that owns `megtras.com`:

```powershell
npx wrangler d1 create jobmanagement-db
npx wrangler r2 bucket create jobmanagement-uploads
npx wrangler r2 bucket create jobmanagement-cache
```

Copy the D1 ID returned by the first command into `database_id` in
`wrangler.jsonc`. Do not substitute another project's database ID.

Store this application's secrets on the `jobmanagement` Worker:

```powershell
npx wrangler secret put NEXTAUTH_SECRET
```

Only add SMTP or map credentials if those integrations are explicitly enabled.
They must be demo-specific values, never credentials from another deployment.

Apply and seed the dedicated remote D1 database:

```powershell
npm run db:migrate:remote
npm run db:seed:remote
```

Then deploy only this Worker:

```powershell
npm run deploy
```

## Local setup

Requirements: Node.js 20 or newer and npm.

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open `http://localhost:3100/app/login`. Local development uses Wrangler's local
D1 and R2 emulation through the same `DB` and `UPLOADS` bindings used in the
Worker.

Demo accounts use the password `DemoOnly@1234`:

- `supervisor@demo.local`
- `manager@demo.local`
- `admin@demo.local`
- `technician1@demo.local`
- `technician2@demo.local`

## Commands

- `npm run dev`: Webpack development server on port 3100
- `npm run build`: Turbopack production build used by OpenNext
- `npm run preview`: build and preview in the Workers runtime
- `npm run deploy`: build and deploy `jobmanagement`
- `npm run upload`: upload a Worker version without deploying it
- `npm run cf:typegen`: regenerate Cloudflare binding types
- `npm run db:migrate:local`: apply D1 migrations locally
- `npm run db:migrate:remote`: apply migrations to `jobmanagement-db`
- `npm run db:seed:local`: seed fictional local demo data
- `npm run db:seed:remote`: seed fictional remote demo data
