# Env Vault (Tubo Vault)

> **Enterprise-Grade, Offline-First, End-to-End Encrypted Environment Variable Management Monorepo**

Env Vault is a secure secrets and configuration management platform designed for modern engineering teams. It allows developers to organize, synchronize, and share environment variables across projects and environments (**Development**, **Staging**, **Production**) with zero plaintext leaks, client-side AES encryption, and protocol buffer serialization.

---

## 🌟 Key Capabilities

- **🔐 End-to-End Encryption**: Sensitive environment values are encrypted using client-side **AES-256-CBC** with cryptographic IVs and serialized inside **Protocol Buffer (`EncryptedEnvEnvelope`)** envelopes.
- **📱 Offline-First Mobile Experience**: Built with **React Native (Expo)** and persistent **SQLite via Drizzle ORM**. Work seamlessly without internet connectivity; local changes are queued and synced automatically once online.
- **⚡ High-Performance Protocol Buffers Wire Transfer**: High-throughput sync endpoints transfer binary-packed protobuf messages (`/api/proto/*`) with automatic JSON fallback.
- **👥 Multi-Tenant Workspaces & RBAC Teams**: Granular organization hierarchy: **Workspaces $\rightarrow$ Teams $\rightarrow$ Environments $\rightarrow$ Folders $\rightarrow$ Variables**. Role-based access control distinguishes Team Admins and Members.
- **📄 Advanced .env Parser & Bulk Import**: Intelligent `.env` parser that accurately extracts keys and values, unescapes strings, supports multi-line quoted values (e.g. RSA keys), and cleanly ignores full-line and inline comments (`#`, `//`, `;`).
- **📋 Ergonomic Copy Tools**: One-tap copying on mobile for:
  - Full `KEY=VALUE` pair (formatted for `.env` files)
  - Key name only
  - Decrypted value only (even when visually masked)
- **📦 ZIP Export & Backup**: Export environments as organized, compressed `.zip` archives with folders separated into subdirectories.
- **🔄 Secure Authentication & Token Rotation**: JWT authentication with rotating refresh tokens, native SecureStore integration, password resets, email verification, and deep-link portals.

---

## 🏗️ Architecture Overview

The repository is organized as an enterprise-grade **Turborepo Monorepo**:

```
env_storage/
├── apps/
│   ├── api/                 # Node.js + Express + tRPC + Drizzle ORM backend service
│   └── mobile/              # React Native + Expo mobile application (Android / iOS)
├── packages/
│   ├── proto/               # Protobuf schemas, wire encoders/decoders & DotEnv parser
│   └── db/                  # PostgreSQL schema definitions, relations & Drizzle database clients
├── docker-compose.yml       # Production/Local PostgreSQL infrastructure
├── pnpm-workspace.yaml      # Monorepo workspace configuration
└── turbo.json               # Turbo build pipelines and task caching
```

### High-Level Architecture Diagram

```mermaid
graph TD
    subgraph Client Layer ["Mobile Client (Expo / React Native)"]
        UI["UI Screens (EnvVault, Team, Auth)"]
        LocalDB["Local SQLite (Drizzle ORM)"]
        SyncMgr["MobileSyncManager (Queue & Reconciliation)"]
        CryptoClient["Vault Crypto (AES-256-CBC + Protobuf)"]
        UI --> LocalDB
        UI --> CryptoClient
        LocalDB --> SyncMgr
    end

    subgraph Transport Layer ["Wire Protocols"]
        TRPC["tRPC API (/trpc/*)"]
        ProtoAPI["Protobuf Binary API (/api/proto/*)"]
        WebAuth["Deep-Link Web Auth Portal (/auth/*)"]
    end

    subgraph Backend Layer ["Node.js API Service"]
        Express["Express Server"]
        AuthService["Auth & Token Rotation Store"]
        DataStore["DataStore Repository"]
        CryptoServer["Vault Crypto Service"]
        Express --> TRPC
        Express --> ProtoAPI
        Express --> WebAuth
        TRPC --> DataStore
        ProtoAPI --> DataStore
        Express --> AuthService
    end

    subgraph Database Layer ["Persistence"]
        Postgres[(PostgreSQL via Drizzle ORM)]
        DataStore --> Postgres
        AuthService --> Postgres
    end

    SyncMgr -- "Binary Sync (application/x-protobuf)" --> ProtoAPI
    SyncMgr -- "Mutations & RPC" --> TRPC
```

---

## 🔄 How It Works

### 1. Offline-First Synchronization Loop
1. **Local-First Writes**: When a developer creates, updates, or deletes a variable or folder on mobile, the operation is immediately committed to persistent local SQLite via `drizzle-orm/expo-sqlite`. The UI updates with zero latency.
2. **Sync Queue**: A mutation event (`create`, `update`, `delete`, `bulk_import`) is enqueued into SQLite's `sync_queue` table with a pending status.
3. **Background Sync Worker**: `mobileSyncManager` listens for network connectivity changes and app foreground events. It drains the queue against `/api/proto` or `/trpc` endpoints.
4. **Reconciliation**: On successful API sync, temporary local IDs (`pending_create`) are reconciled with remote PostgreSQL primary keys.

### 2. End-to-End Encryption Scheme
- Values flagged as secrets (`isSecret: true`) are never stored in plaintext in the database or transmitted dry.
- Payload is encrypted with AES-256-CBC using an initialization vector (IV).
- The ciphertext, IV, algorithm, version, and key ID are packed into a Google Protocol Buffers binary message (`EncryptedEnvEnvelope`) encoded with the `enc:pb1:` prefix.
- Legacy `enc:v1:` ciphertexts remain backwards-compatible.

### 3. Bulk .env Parser Engine
Located in `packages/proto/src/dotenvParser.ts`:
- **Comment Filtering**: Ignores empty lines and full-line comments (`#`, `//`, `;`, even if indented).
- **Inline Comment Stripping**: Removes comments after quotes or preceded by whitespace (`KEY=val # comment`).
- **Hash Preservation**: Does not strip hashes inside quotes (`KEY="p#ss"`) or hex colors/URLs (`COLOR=#1E293B`, `URL=http://x.com#frag`).
- **Escape Resolution**: Properly decodes `\n`, `\t`, `\"`, etc., in double-quoted strings.
- **Multi-line Strings**: Seamlessly accumulates multi-line values (such as RSA private keys or certificates) across line breaks.

---

## 🛣️ Routes & API Endpoints

### 1. Protobuf Binary Routes (`/api/proto`)
High-performance binary endpoints accepting `application/x-protobuf` and `application/octet-stream`:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/proto/folder.list` | `POST` | Fetches folders serialized as `ListFoldersResponseProto` |
| `/api/proto/env.list` | `POST` | Fetches environment variables serialized as `ListEnvsResponseProto` |
| `/api/proto/env.upsert` | `POST` | Upserts variable from binary envelope into Postgres |

### 2. tRPC Router (`/trpc`)
Type-safe RPC endpoints accessible under `/trpc/<router>.<procedure>`:

#### `auth`
- `auth.register` — Create new user account.
- `auth.login` — Authenticate and receive access + refresh token pair.
- `auth.renewTokens` — Rotate refresh tokens and generate new session tokens.
- `auth.logout` — Invalidate user tokens across all devices.
- `auth.requestPasswordReset` — Trigger email with password reset link.
- `auth.verifyResetToken` — Verify token validity before password change.
- `auth.resetPassword` — Submit new password using reset token.
- `auth.requestEmailChange` — Send confirmation email to new address.
- `auth.updateProfile` — Update user display name and profile fields.
- `auth.changePassword` — Update password while authenticated.
- `auth.deleteAccount` — Permanently delete user and associated records.

#### `workspace`
- `workspace.list` — List workspaces where user is a member.
- `workspace.create` — Create a new workspace.
- `workspace.update` — Rename or update workspace.
- `workspace.delete` — Delete workspace and cascaded teams.

#### `team`
- `team.list` — List teams inside a workspace.
- `team.create` — Create a team under a workspace.
- `team.invite` — Generate teammate invite code.
- `team.acceptInvite` — Join a team using invite token.
- `team.updateMemberRole` — Promote/demote team member (`admin` vs `member`).
- `team.removeMember` — Remove user from team.

#### `folder`
- `folder.list` — List folders filtered by workspace, team, and environment.
- `folder.create` — Create a folder to categorize variables.
- `folder.update` — Rename or update description.
- `folder.delete` — Delete folder (optionally cascades variables).

#### `env`
- `env.list` — Retrieve environment variables by scope.
- `env.upsert` — Insert or update an environment variable.
- `env.delete` — Delete an environment variable by ID.
- `env.bulkImport` — Parse and batch-insert raw `.env` contents.
- `env.exportZip` — Export scoped variables as a compressed ZIP file with folder trees.

### 3. Deep-Link Web Auth Endpoints (`/auth`)
Responsive web portal with automated mobile app deep-linking (`envvault://` and `tubovault://`):
- `GET /auth/verify-email?token=...` — Verifies new email address.
- `GET /auth/reset-password?token=...` — Web reset password interface.
- `POST /auth/reset-password` — Processes web password reset.
- `GET /auth/accept-invite?token=...` — Web teammate invite landing page.
- `POST /auth/accept-invite` — Sets password for invited teammate.

---

## 💻 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Monorepo Manager** | [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/) |
| **Mobile App** | [React Native](https://reactnative.dev/) + [Expo](https://expo.dev/) (SDK 55) |
| **Mobile Storage** | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) + [Drizzle ORM](https://orm.drizzle.team/) |
| **Backend API** | [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) + [tRPC](https://trpc.io/) |
| **Cloud Database** | [PostgreSQL](https://www.postgresql.org/) + [Drizzle ORM](https://orm.drizzle.team/) |
| **Serialization** | [Protocol Buffers (protobufjs)](https://protobuf.dev/) |
| **Cryptography** | AES-256-CBC, PBKDF2, SHA-256, [CryptoJS](https://cryptojs.altervista.org/) |
| **Security Storage** | [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/secure-store/) |
| **Form Management** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **pnpm**: `v9+` (`npm install -g pnpm`)
- **Docker & Docker Compose**: (for local PostgreSQL database)
- **Expo Go / Development Client**: (for testing mobile app on iOS/Android)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/env_storage.git
cd env_storage
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` into `apps/api/.env` and `apps/mobile/.env`:

```bash
cp .env.example apps/api/.env
```

Key environment variables in `apps/api/.env`:
```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tubo_vault
JWT_SECRET=your-super-secret-jwt-key
GMAIL_USER=your-smtp-email@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
```

### 3. Launch Local Database
```bash
docker compose up -d
```

### 4. Build Monorepo Packages
```bash
pnpm run build
```

### 5. Start API Dev Server
```bash
pnpm --filter api dev
```
The API server will listen on `http://localhost:4000`.

### 6. Start Mobile Application
```bash
cd apps/mobile
npx expo start
```
- Press `a` for Android emulator or device.
- Press `i` for iOS simulator.
- Scan QR code using the Expo Development Client.

---

## 🧪 Verification & Testing

The monorepo includes automated test suites covering Protocol Buffers, encryption envelopes, and DotEnv parsing:

```bash
# 1. Run DotEnv parser verification suite
npx tsx packages/proto/scripts/test-dotenv-parser.ts

# 2. Run Protobuf encryption & wire transfer test suite
pnpm --filter api exec tsx ../../packages/proto/scripts/test-protobuf.ts

# 3. Typecheck all workspaces
pnpm run build

# 4. Run Expo Doctor project validation
cd apps/mobile && npx expo-doctor
```

---

## 📱 Mobile Database Inspector CLI
The mobile workspace provides an interactive terminal database viewer for inspecting local SQLite records:

```bash
cd apps/mobile
pnpm run db:inspect
# View secrets unmasked:
pnpm run db:inspect --show-secrets
```

---

## 📄 License
Private & Proprietary. All rights reserved.
