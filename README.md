# Megtras Job Management Demo

This is an independent local demo copy of the GenPlus Job Management application. The current GenPlus interface and code structure are intentionally retained for now; rebranding is a separate step.

## Safety boundaries

- Uses only the local PostgreSQL database configured in `.env`.
- Stores new demo uploads under `demo-data/uploads`.
- Email and WhatsApp report integrations are disabled unless explicitly opted in.
- Does not include the GenPlus marketing website, production uploads, customer files, production environment files, database dumps, build output, dependency folders, or Git history.

## Requirements

- Node.js compatible with Next.js 16
- npm
- Docker Desktop (recommended for the isolated PostgreSQL database), or a separate local PostgreSQL instance

## Local setup

```powershell
docker compose up -d database
npm ci
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3100/app/login`.

Demo accounts use the password `DemoOnly@1234`:

- `supervisor@demo.local`
- `manager@demo.local`
- `admin@demo.local`
- `technician1@demo.local`
- `technician2@demo.local`

`npm run db:push` and `npm run db:seed` affect only the database URL in this project's safe local `.env`. Review that URL before running either command.

## Application architecture

The frontend and backend are one Next.js application:

- Frontend: App Router pages and React components under `src/app` and `src/components`.
- Backend: route handlers under `src/app/api`, server actions under `src/lib/actions`, and Prisma under `prisma` / `src/lib/prisma.ts`.
- Offline/PWA: `src/sw.ts`, `src/lib/offline`, and PWA components under `src/components/pwa`.

## Commands

- Development (frontend + backend): `npm run dev`
- Production build: `npm run build`
- Production start: `npm start`
- Generate Prisma client only: `npm run db:generate`
- Apply schema to the isolated local demo DB: `npm run db:push`
- Seed fictional demo accounts: `npm run db:seed`
