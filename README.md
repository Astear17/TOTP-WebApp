# TOTP-WebApp

TOTP-WebApp is an offline-first authenticator for managing time-based one-time password (TOTP) accounts in the browser. It encrypts vault data locally before storage or sync, supports import/export workflows, and includes an optional account-based sync API for self-hosted deployments.

Made by Astear17.

## Overview

This repository is a TypeScript monorepo containing:

- `apps/web`: React and Vite frontend for the web app, PWA, and Chrome extension build.
- `apps/api`: Fastify API for account registration, login, JWT auth, and encrypted vault sync.
- `packages/crypto`: Browser crypto helpers for vault encryption and decryption.
- `packages/shared`: Shared TOTP, import, validation, and schema utilities.

The app is designed so TOTP secrets are usable offline after the vault is created or restored. Cloud sync is optional and stores only encrypted vault records.

## Features

- Encrypted local vault storage in IndexedDB.
- TOTP generation for SHA1, SHA256, SHA512, 6-digit and 8-digit codes.
- QR scanning, QR image import, manual entry, and migration import support.
- Encrypted backup export and restore.
- Optional account sync with register/login, JWT sessions, conflict detection, and encrypted vault upload/download.
- Chrome extension build with Manifest V3.
- Light and dark themes, search, copy, edit, delete, reorder, tags, auto-lock, and clipboard clearing.

## Security Model

The master password is used only in the client. It derives an AES-GCM key through Web Crypto PBKDF2-SHA256 with a per-vault salt. Decrypted vault data, plaintext TOTP secrets, generated codes, and the master password are never sent to the backend.

The sync API stores:

- User id and email.
- Bcrypt hash of the sync account password.
- Encrypted vault JSON.
- Vault version, revision, and timestamps.

The backend treats vault content as opaque encrypted data.

## Deployment

Render deployment uses three services:

- `totp-webapp-web`: static frontend.
- `totp-webapp-api`: Node API.
- `totp-webapp-db`: PostgreSQL database.

The included `render.yaml` is configured for those service names. If you rename services, update the public external URLs, for example:

- `VITE_API_BASE_URL=https://your-api-service.onrender.com`
- `CORS_ORIGIN=https://your-web-service.onrender.com`

Do not use only the internal Render service name such as `totp-webapp-api` as a browser-facing URL. Browser requests must use the public `.onrender.com` URL.

## Local Development

Requirements:

- Node.js 20+
- npm
- PostgreSQL, or Docker for the included Compose database

Install dependencies:

```bash
npm install
```

Start PostgreSQL:

```bash
docker compose up -d
```

Create environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Run database setup:

```bash
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
```

Start the API and web app:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:5173`.

## Build Commands

Build the full Render/web deployment:

```bash
npm run build:render
```

Build only the Chrome extension output:

```bash
npm run build:extension -w apps/web
```

The extension build is written to:

```text
D:\Windows Tool\TOTP-Extension
```

Load that folder in Chrome through `chrome://extensions` with Developer Mode enabled.

## Environment Variables

API:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: signing secret, minimum 32 characters.
- `CORS_ORIGIN`: public frontend origin, for example `https://totp-webapp-web.onrender.com`.
- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: API port.

Web:

- `VITE_API_BASE_URL`: public API URL, for example `https://totp-webapp-api.onrender.com`.

## Import And Backup

Encrypted backup files contain only encrypted vault data. They still require the original master password after restore. Plain `otpauth://` imports, Google Authenticator migration QR images, and Proton Authenticator exports are parsed in the browser and immediately encrypted into the open vault.

## Testing

Run all checks:

```bash
npm run typecheck
npm test
```

## Known Limitations

- No independent security audit has been performed.
- PBKDF2 is used for browser compatibility; Argon2id is not bundled.
- Sync conflict handling is conservative and does not merge individual entries.
- Sync tokens are stored in browser storage.
- Web authenticators have inherent XSS risk because decrypted secrets exist in memory while the vault is unlocked.

## License

MIT. See `LICENSE`.
