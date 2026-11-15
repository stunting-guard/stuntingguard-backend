# AGENTS.md

REST API for **StuntingGuard Desa** (village stunting/social-aid system). Express + Prisma, CommonJS, Node 18+.

## Commands
- `npm install`
- `npm run dev` — nodemon; `npm start` — node. Both run root **`server.js`**, which does not exist yet (create it). The `main: index.js` field is unused.
- `npx prisma migrate dev --name <name>` — create/apply migrations.
- `npx prisma generate` — regenerate client after schema edits.
- `npx prisma migrate status` / `npx prisma validate` — verify DB state/schema.
- No test, lint, or typecheck scripts are configured. Do not invent them; verify by starting the server and hitting endpoints.

## Layout (current vs. README)
- Real source root is **`src/`** with `config/`, `controllers/`, `middlewares/`, `routes/` (all currently empty).
- `README.md`'s folder tree is stale/aspirational: it shows root-level `config/`, `controllers/`, etc. plus `models/`, `services/`, `utils/` that do not exist. Follow `src/`, not the README.
- All code is CommonJS (`require`), not ESM.

## Prisma / DB (read before touching DB code)
- Prisma **7.10.1**, provider **MySQL/MariaDB** only. README's "PostgreSQL" option is wrong; `schema.prisma` and `migration_lock.toml` are both `mysql`.
- `prisma/schema.prisma` intentionally has **no `datasource.url`**. The URL comes from `prisma.config.ts` (`dotenv/config` + `env("DATABASE_URL")`). Do not add `url` back to the schema. The Prisma CLI does not auto-load `.env` here — keep the `import "dotenv/config"` in `prisma.config.ts`.
- Runtime client **must use the driver adapter**: `new PrismaClient({ adapter: new PrismaMariaDb(...) })` from `@prisma/adapter-mariadb`. A bare `new PrismaClient()` will not work. Import is `{ PrismaMariaDb }`.
- `PrismaMariaDb` accepts either a connection string (`process.env.DATABASE_URL`) or a `mariadb` pool config object (`{ host, user, password, database }`).
- The adapter bundles the `mariadb` driver; `mysql2` is installed separately and is not what the adapter uses.
- Env (copy `.env.example` → `.env`, which is gitignored): `PORT=5000`, `DATABASE_URL`, `JWT_SECRET`.

## Domain conventions
- Keep Indonesian model/field names (`Dusun`, `SkriningStunting`, `kodeKeluarga`, `zonaRisiko`, …); do not translate them.
- Enums: `Role = KADER | APARATUR | ADMIN`, `ZonaRisiko = MERAH | KUNING | HIJAU`. Note `SkriningStunting.statusRisiko` is a free-form `String`, not the enum.
- Three role modules: Kader/Posyandu input, Aparatur executive dashboard, Admin & AI console. Auth is JWT (`jsonwebtoken`) + `bcryptjs`, with role-based middleware.
- ML predictions come from an external Python Random Forest API via `axios`; `ml_models/` is an empty placeholder. Do not assume the model runs in this process.

## API contract & task rules (mandatory)
- Before writing any endpoint, controller, route, or middleware, read **`FRONTEND_CONTRACT.md`**. It is the source of truth for paths, roles, request/response keys, and JSON envelopes.
- Every JSON endpoint must use the contract envelope: `{ "success": true, "message": "...", "data": ... }` on success and `{ "success": false, "message": "..." }` on error. Only file-export endpoints return binary.
- Keep response keys aligned with the frontend aliases documented in the contract; update the contract in the same change if a key must change.
- Follow the Prisma v7 rules above (driver adapter `PrismaMariaDb`, no `datasource.url`) and CommonJS (`require`).
- Git is read-only for agents: **never** run `git add`, `git commit`, `git push`, branch changes, or any history rewrite. The user owns all Git operations.

## Repo gotchas
- `.gitignore` excludes `.agents/`, `.claude/`, `.cursor/`, `.devin/` (local-only AI skills) — do not commit them. The `prisma-*` skills there are available via OpenCode's `skill` tool.
- Update `prisma/schema.prisma` and add a migration together; never edit files under `prisma/migrations/` by hand.
