# Collaborative Code Editor

**Multiple users edit the same code file simultaneously, with live cursors showing who's where and what they're typing — backed by a CRDT so edits never conflict or get lost.**

---

## Demo

```markdown
<!-- Add a screenshot or GIF here -->
<!-- Recommended: record a 30-second screen recording showing two browser tabs
     editing the same document simultaneously with cursor labels visible -->
```

---

## Features

- **Real-time sync** — all connected clients see changes instantly; document state converges regardless of edit conflicts or network timing
- **Live cursor presence** — named, colored cursor labels follow each user's position as they type, Google Docs style
- **Awareness indicators** — connected user list in the header, presence updates on join/leave
- **Role-based rooms** — create rooms, share a URL, assign owner/editor/viewer roles
- **Viewer enforcement** — viewers see live updates but cannot edit; server rejects their edit attempts
- **Persistent documents** — Yjs document state is snapshot to disk every 30 seconds; survives server restarts
- **JWT authentication** — signup/login, session persisted across page refreshes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Sync | Yjs CRDT (`yjs`) + y-websocket relay |
| Editor↔Yjs binding | y-monaco (`y-monaco`) |
| Routing | react-router-dom v7 |
| Auth | JWT (`jsonwebtoken`), bcrypt |
| Backend | Node.js, Express |
| Persistence | y-websocket `setPersistence()` → filesystem snapshots |

---

## Architecture

```
┌──────────────┐         ┌─────────────────────────┐         ┌──────────────┐
│  Browser A  │◄──────►│  y-websocket relay      │◄──────►│  Browser B   │
│  (Monaco +   │  WS    │  (port 1234)           │  WS    │  (Monaco +   │
│   Yjs)       │         │  — verifies JWT on      │         │   Yjs)        │
│              │         │    upgrade              │         │              │
└──────────────┘         │  — enforces roles on    │         └──────────────┘
                         │    edit messages          │
                         │  — snapshots doc state   │
                         │    every 30s             │
                         └─────────────────────────┘
                                   ▲
                         ┌─────────┴──────────┐
                         │  Auth server         │
                         │  (port 3001)        │
                         │  — /auth/signup     │
                         │  — /auth/login       │
                         │  — /rooms CRUD       │
                         │  — /rooms/:id/role   │
                         └─────────────────────┘
```

**Data flow:** Browser edits locally in Monaco → Yjs applies the change to the local CRDT document → the update is serialized and sent over WebSocket → y-websocket relay broadcasts it to all other clients in the room → each client applies it to their local Yjs document → Monaco re-renders.

The relay is **stateless** — it has no understanding of document content. Auth and room metadata live in the auth server. Document state lives in each browser's Yjs document and is snapshot to disk by the relay.

---

## Why CRDTs

Traditional collaborative editors (early Google Docs) used **Operational Transformation (OT)**. When two users edit the same position simultaneously, the server transforms each operation against the others — shifting positions, adjusting offsets. The transformation functions are notoriously complex and historically required a central server to work.

**CRDTs (Conflict-free Replicated Data Types)** solve this differently. Every character in a Yjs document is identified by a `(clientID, clock)` tuple instead of a numeric position. When Alice and Bob both insert "X" at position 5, they get different IDs. During merge, all characters are sorted by ID deterministically — every client produces the identical document without any server-side transformation.

This means:
- **No central authority** — the relay never needs to understand or transform operations
- **Works offline** — each client has a complete local copy, merges on reconnect
- **No server-side conflict resolution** — the math guarantees convergence

Yjs is the most widely-used CRDT library for JavaScript. It's used by Figma, Notion, Apple (iWork collaboration), and Atlassian.

---

## Setup

### Prerequisites

- Node.js 18+ (ESM modules are used throughout)
- npm

### Install dependencies

```bash
git clone https://github.com/Digitivity-Farhan/collaborative-code-editor.git
cd collaborative-code-editor
npm install
```

### Start the servers

Three processes need to run simultaneously, in separate terminals:

```bash
# Terminal 1 — Auth server (port 3001)
node server/auth-server.js

# Terminal 2 — y-websocket relay (port 1234)
node server/index.js

# Terminal 3 — Frontend dev server (port 5173)
npm run dev
```

Open `http://localhost:5173` in your browser.

### How to use

1. **Sign up** with a username and password
2. Click **+ Create new room** — you're the owner
3. **Copy the URL** and open it in another browser/tab
4. Log in as a different user in the new tab — you're a viewer by default
5. As the owner, use **Manage access** to change roles

### Environment variables (optional)

```bash
JWT_SECRET=your-secret-here   # default: "dev-secret-change-in-production"
PORT=1234                     # default: 1234 (y-websocket relay)
AUTH_PORT=3001               # default: 3001 (auth server)
```

---

## Challenges / What I Learned

**Server-side enforcement vs. client-side enforcement**
Setting Monaco's `readOnly: true` for viewers is UX, not security. Any user can open dev tools and bypass it. Real enforcement is in the relay: every Yjs edit message is intercepted and checked against `doc.permissions[username]`. If the role is `'viewer'`, the message is dropped before it reaches any other client. This distinction — "what the user sees" vs. "what the server actually allows" — came up in every auth feature I built.

**WebSocket auth and the HTTP upgrade handshake**
WebSockets begin as HTTP `Upgrade` requests, so standard `Authorization:` headers aren't available. The JWT must be passed as a query parameter (`?token=<jwt>`). The server intercepts the upgrade event, verifies the token, and either accepts or destroys the socket before the WebSocket is established. The `y-websocket` provider has a built-in `params` option that correctly appends query params to the constructed URL — using it avoids the common bug of passing the room name in the server URL AND as the second argument, which causes the room name to appear twice in the final WebSocket URL.

**Merging two identity systems**
Milestone 3 (before auth existed) generated random display names per session (`Nebula-482`). When auth was added, awareness state was broadcasting both a random display name AND the real username, with the random name leaking into the permissions system and causing ghost entries in the access control list. The fix was making the auth username the sole identity for both awareness and permissions.

**React rendering bugs from stale merged state**
The access management panel was merging two data sources — stored room members and live awareness users — into a `Set` without deduplication. Users who appeared under both their random name and their auth username would render as duplicate rows. Fixed by making the permission registry the single authoritative source and using the auth username as a stable React key.

**Message interception timing with y-websocket**
y-websocket's `setupWSConnection` adds its message listener on connect. To intercept messages for permission checking, you must capture a reference to that listener AFTER `setupWSConnection` runs (not before), then replace the listener with a wrapper that checks permissions before delegating. Replacing the listener before calling `setupWSConnection` would break the connection.

---

## Future Improvements

**Redis pub/sub for multi-server scaling**
Currently all clients connect to a single y-websocket relay. To scale horizontally, the relay would need to publish document updates to a Redis channel that other relay instances subscribe to, so clients on different server processes still receive each other's updates.

**Document version history**
The current snapshot system only stores the latest state. Storing snapshots with timestamps (e.g. one per minute) would enable a "history" feature — browsing and restoring previous versions of a document.

**Granular permissions per document section**
Currently roles apply to the entire document. A more refined model would allow specifying read/edit permissions per file in a multi-file project, or per text range within a document.
