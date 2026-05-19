# TOTP-WebApp

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Astear17/TOTP-WebApp)

After forking, replace OWNER in the Deploy to Render URL with your GitHub username or organization name.

TOTP-WebApp is a self-hosted, offline-first TOTP authenticator web app with encrypted local vault storage and optional encrypted cloud sync.

## Project overview

This repository contains a TypeScript monorepo with a React/Vite PWA, browser crypto utilities, shared validation/TOTP utilities, and a Fastify/PostgreSQL sync API. The app works without an account. Sync is optional and stores only encrypted vault blobs.

## Features

- Offline-first PWA with installable manifest and service worker app-shell cache.
- Encrypted local vault in IndexedDB.
- TOTP generation for SHA1, SHA256, SHA512, 6 or 8 digits, and configurable periods.
- `otpauth://totp` QR camera scanning, QR image import, and manual entry.
- Search, copy, edit, rename, delete, reorder, tags, fallback issuer initials, light/dark mode.
- Encrypted Backup/Restore export and import.
- Chrome Extension package via the web build output.
- Optional encrypted cloud sync with conflict detection.
- Fastify API with Helmet, CORS, rate limits, JWT auth, bcrypt password hashing, Zod validation, Prisma, and PostgreSQL.

## Security model

The vault master password is entered only in the browser. The browser derives an AES-GCM key from that password using Web Crypto PBKDF2-SHA256 with a per-vault random salt. TOTP entries are encrypted before being saved to IndexedDB or uploaded for sync.

PBKDF2 is used instead of Argon2id because it is natively available in Web Crypto across modern browsers. Argon2id is stronger for password hashing, but browser use generally requires WASM packaging and an additional supply-chain review.

## What is stored locally

- Encrypted vault blob in IndexedDB.
- KDF salt, AES-GCM IV, vault version, revision, and timestamps.
- UI/security settings such as theme, auto-lock timeout, clipboard clear timeout, and sync token.

## What is stored on the backend

- User id.
- Email.
- Bcrypt hash of the sync account password.
- Encrypted vault blob.
- Vault version, revision, and timestamps.

## What is never sent to the backend

- Vault master password.
- Plaintext TOTP secrets.
- Plaintext vault data.
- Generated TOTP codes.
- Decoded QR contents.

## PWA / Chrome Extension / offline behavior

The service worker caches the app shell after first load. The encrypted vault remains in IndexedDB, so the authenticator dashboard can be unlocked and used while offline. The service worker does not cache decrypted vault data or API responses.

Install from the browser install prompt or menu after visiting the deployed static site over HTTPS.

For Chrome Extension publishing, build `apps/web` and upload the generated `apps/web/dist` folder as an unpacked extension or zipped Web Store package:

```bash
npm run build -w apps/web
```

The extension uses Manifest V3 with no host permissions. Backup and Restore are local encrypted JSON files and work offline. On first create or unlock in the extension, the master password is required; after that, Chrome extension storage remembers the vault key for this browser profile so reopening the popup does not ask every time. Use Security settings -> Require master password next launch to clear that remembered key.

## Open-source inspiration and attribution

TOTP-WebApp implements standard TOTP authentication behavior and common authenticator UX patterns. Its feature set is inspired by modern open-source authenticator applications that support offline TOTP generation, encrypted local vaults, QR enrollment, import/export, and optional encrypted sync.

Unless explicitly listed in the attribution list below, this project does not copy source code, branding, icons, UI assets, or proprietary infrastructure from any third-party authenticator.

Attribution list:

No source code from third-party authenticator apps is included. This project independently implements standard TOTP behavior using public specifications and open-source libraries.

Made by Astear17.

## Fully Render deployment guide

1. Fork this repository.
2. Replace `OWNER` in the Deploy to Render button URL with your GitHub username or organization.
3. Click the Deploy to Render button.
4. Confirm the Blueprint creates:
   - `totp-webapp-web`
   - `totp-webapp-api`
   - `totp-webapp-db`
5. After deploy, open the static site URL and create a local vault.

The root `render.yaml` uses Render Blueprint syntax with a Node API service, a static frontend service, and a managed PostgreSQL database. If Render changes Blueprint properties, create the services manually using the commands below.

The Blueprint sets both web services to `plan: free`. Render currently supports `host`, `hostport`, `port`, and `connectionString` service references in Blueprints, so the web app receives the API host and normalizes it to `https://...` at runtime. Render may still ask for payment information to verify the account or because free instance availability varies by account and region.

## Manual Render deployment guide

Create a PostgreSQL database named `totp-webapp-db`.

Create a Web Service named `totp-webapp-api`:

- Root directory: `apps/api`
- Build command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- Start command: `npm run start`
- Environment: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`

Create a Static Site named `totp-webapp-web`:

- Root directory: `apps/web`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment: `VITE_API_BASE_URL=https://your-api.onrender.com`

## Local development setup

Requirements: Node.js 20+, npm, PostgreSQL. A Docker Compose file is included for local PostgreSQL.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run dev:api
npm run dev:web
```

Open `http://localhost:5173`. The API defaults to `http://localhost:4000`.

## Environment variables

API:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random secret, minimum 32 characters.
- `CORS_ORIGIN`: frontend origin, for example `http://localhost:5173`.
- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: optional API port.

Web:

- `VITE_API_BASE_URL`: API base URL, for example `http://localhost:4000`.

## Database migration instructions

For development:

```bash
npm run prisma:migrate -w apps/api
```

For production on Render, the API build command runs:

```bash
npx prisma migrate deploy
```

## Import/export guide

Use Backup to download an encrypted JSON vault backup. Use Restore or Settings -> Import backup to restore it. The same master password is required to unlock that backup after import.

Use Add account -> Import backup to import an encrypted backup or paste a plain `otpauth://totp` URI. Plain imports are immediately encrypted into the open vault and are not stored as plaintext files.

## Known limitations

- No independent security audit has been performed.
- PBKDF2 is used for browser compatibility; Argon2id is not bundled.
- Sync conflict handling is conservative and does not merge individual entries.
- Sync tokens are stored in IndexedDB settings; use short token lifetimes and HTTPS.
- Web authenticators have an inherent XSS risk because decrypted secrets exist in browser memory while unlocked.

## Security checklist

- Use HTTPS only.
- Do not use for critical real accounts before independent security review.
- Backend must never receive plaintext TOTP secrets.
- Master password cannot be recovered.
- Losing the master password can permanently lock the encrypted vault.
- Browser XSS is the biggest threat to a web-based authenticator.
- Keep dependencies updated.
- Do not disable CSP or security headers in production.
- Set a strong `JWT_SECRET`.
- Keep Render environment variables private.

## Security disclaimer

This project is provided as-is under the MIT License. TOTP authenticators protect sensitive credentials; deploy and use this only after reviewing the source, dependency chain, hosting configuration, and threat model for your environment.

## License

MIT. See `LICENSE`.
