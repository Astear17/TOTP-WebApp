# TOTP-WebApp

TOTP-WebApp is an offline-first, encrypted TOTP authenticator for the browser, PWA installs, and a Manifest V3 Chrome extension build. It stores the vault locally, encrypts secrets before persistence or sync, and supports encrypted Backup/Restore plus optional account-based sync for self-hosted deployments.

Made by Astear17.

## Repository Layout

- `apps/web`: React and Vite frontend shared by the hosted web app, PWA, and extension popup.
- `apps/api`: Fastify API for register/login, JWT auth, and encrypted vault sync.
- `packages/crypto`: Web Crypto vault encryption and decryption helpers.
- `packages/shared`: TOTP generation, importers, schemas, formatting, search, and reorder utilities.

The extension release repository, `D:\Windows Tool\TOTP-Extension`, is generated output from `apps/web`. Do not maintain a second source app there.

## Features

- Encrypted local vault storage in IndexedDB.
- TOTP generation for SHA1, SHA256, SHA512, 6-digit codes, and 8-digit codes.
- Display formatting as `XXX XXX` for 6-digit codes while copying the raw code.
- QR scanning, QR image import, manual entry, Google Authenticator migration import, and Proton Authenticator JSON import.
- Encrypted backup export and restore.
- Optional encrypted cloud sync with register/login, JWT sessions, conflict handling, and Backup/Restore controls.
- Search, edit, delete, reorder, tags, auto-lock, clipboard clearing, and visible lock controls.
- PWA support and a Chrome extension popup build.

## Lightweight Classic UI

The default UI is a lightweight classic utility interface designed for weak Chromium/WebView environments, Android TV browsers, and small extension popups.

The default theme uses solid backgrounds, simple borders, normal buttons, compact rows, minimal shadows, and reduced DOM/CSS cost. Expensive glassmorphism effects such as backdrop blur, animated gradients, large decorative backgrounds, and glow shadows are not used by default. The app also respects `prefers-reduced-motion`.

The previous glass-style presentation is not the default runtime theme. The current production target prioritizes responsiveness, readability, and popup safety.

## Performance Notes

- One global timer drives countdown/progress updates.
- TOTP codes are recalculated only when a token time step changes or the visible vault entries change.
- Search and reorder behavior live in shared utilities and are covered by tests.
- Account names, issuers, and long sync emails are constrained and ellipsized for small containers.
- Extension popup CSS caps width and height, disables horizontal overflow, and uses compact responsive layout rules.

## Security Model

The master password is used only in the client. It derives an AES-GCM key through Web Crypto PBKDF2-SHA256 with a per-vault salt. Decrypted vault data, plaintext TOTP secrets, generated codes, and the master password are never sent to the backend.

The sync API stores only account metadata, password hashes, and encrypted vault records. The backend treats vault content as opaque encrypted JSON.

The extension remembers the derived vault key after first unlock so the master password is not required every time the popup opens. Use Security Settings to clear the remembered extension unlock and require the master password on the next launch.

## Extension Permissions

The extension uses Manifest V3 with this permission set:

- `storage`: required for Chrome extension storage of the remembered unlock key metadata.

`unlimitedStorage` is intentionally not requested. Normal encrypted TOTP vaults are small, and avoiding broad permissions keeps Chrome Web Store review and user trust cleaner.

The extension CSP is restricted to self-hosted scripts and blocks object execution:

```text
script-src 'self'; object-src 'self'
```

## Deployment

Render deployment uses three services:

- `totp-webapp-web`: static frontend.
- `totp-webapp-api`: Node API.
- `totp-webapp-db`: PostgreSQL database.

The included `render.yaml` is configured for those service names. If you rename services, use public external URLs:

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

## Environment Variables

API:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: signing secret, minimum 32 characters.
- `CORS_ORIGIN`: public frontend origin, for example `https://totp-webapp-web.onrender.com`.
- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: API port.

Web:

- `VITE_API_BASE_URL`: public API URL, for example `https://totp-webapp-api.onrender.com`.

## Build And Release

Build the hosted web app and API for Render:

```bash
npm run build:render
```

Build the Chrome extension output from the main web app source:

```bash
npm run build:extension -w apps/web
```

By default, the extension build writes generated files to:

```text
D:\Windows Tool\TOTP-Extension
```

Load that folder in Chrome through `chrome://extensions` with Developer Mode enabled.

To build into another directory, set `EXTENSION_OUT_DIR`:

```bash
EXTENSION_OUT_DIR=extension-release npm run build:extension -w apps/web
```

Relative `EXTENSION_OUT_DIR` values are resolved from `apps/web`; absolute paths are recommended for CI.

The GitHub Actions workflow `.github/workflows/extension-release.yml` typechecks, tests, builds the extension, and uploads a versioned ZIP artifact named like:

```text
totp-extension-v1.0.0.zip
```

Publishing generated files back to `Astear17/TOTP-Extension` is optional and disabled by default. Enable it only by setting repository variable `PUSH_EXTENSION_REPO=true` and secret `EXTENSION_REPO_TOKEN`.

## Import And Backup

Encrypted backup files contain only encrypted vault data. They still require the original master password after restore. Plain `otpauth://` imports, Google Authenticator migration QR images, and Proton Authenticator exports are parsed in the browser and immediately encrypted into the open vault.

## Testing

Run all checks:

```bash
npm run typecheck
npm test
```

Test coverage includes RFC 6238 vectors, SHA1/SHA256/SHA512 generation, 6-digit and 8-digit output, `XXX XXX` display formatting, backup/restore crypto roundtrip, import roundtrip, search, reorder, and extension popup layout smoke checks.

## Known Limitations

- No independent security audit has been performed.
- PBKDF2 is used for browser compatibility; Argon2id is not bundled.
- Sync conflict handling is conservative and does not merge individual entries.
- Sync tokens are stored in browser storage.
- Decrypted secrets exist in memory while the vault is unlocked, which is an inherent risk for browser authenticators.

## License

MIT. See `LICENSE`.
