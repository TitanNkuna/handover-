# Linebook

A shared floor book for a maintenance crew: the outstanding work list, shift handover notes, and a supervisor paper trail of every change.

- **Supervisors** build and assign the list, acknowledge handover notes, manage the crew and supervisor key, and read the full paper trail.
- **Technicians** see their own jobs and the crew pool, claim and clear jobs, and write handover notes.
- The first person to join becomes the supervisor and names the floor. Further supervisors need the supervisor key (Crew page), or a promotion.

Built with TanStack Start, React 19, Tailwind 4, Better Auth (username + password) and Postgres.

## Run locally

```bash
npm install
npm run dev        # http://localhost:8080
```

With no `DATABASE_URL` the app uses an embedded in-memory database (PGLite). Data resets when the dev server restarts.

## Deploy

Set these environment variables (see `.env.example`):

| Variable             | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection string (Neon, Supabase, etc.)    |
| `BETTER_AUTH_SECRET` | Long random string that signs sessions               |
| `BETTER_AUTH_URL`    | Public origin, e.g. `https://linebook.example.com`   |

`npm run build` builds the app (Vercel preset) and applies the SQL files in `migrations/` to `DATABASE_URL`.
Without `DATABASE_URL`, the build copies the embedded database files so `npm run preview` works at `http://127.0.0.1:8081`.

## Scripts

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run preview`

## Layout

- `src/components/floor/` – the app UI
- `src/lib/floor/api.ts` – server functions (all authenticated, role-checked, audited)
- `src/lib/floor/rules.ts` – pure visibility and key rules (unit tested)
- `src/lib/auth/` – Better Auth setup and session helpers
- `migrations/` – SQL schema, applied in name order
