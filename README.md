# Chat Backend

A chat backend built with Node.js, TypeScript, PostgreSQL and Firebase Firestore.

Users, chats and chat membership are stored in PostgreSQL (through Prisma). Messages,
read receipts and last-seen pointers are stored in Firestore. Both 1:1 and group chats
are supported.

## Requirements

- Node 20 or newer
- PostgreSQL (a `docker-compose.yml` is included if you don't have one running)
- Firebase CLI and a JDK if you want to use the Firestore emulator locally
  (`npm i -g firebase-tools`)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `DATABASE_URL` in `.env` if your PostgreSQL is not on the default port, then
create the schema:

```bash
npm run db:up            # optional, starts PostgreSQL in Docker
npm run prisma:migrate
```

Start the Firestore emulator in one terminal:

```bash
npm run emulator
```

And the API in another:

```bash
npm run dev              # http://localhost:3000
```

Optional: `npm run seed` inserts a few users, a 1:1 chat, a group chat and some
messages so there is something to query.

To run against a real Firebase project instead of the emulator, remove
`FIRESTORE_EMULATOR_HOST` from `.env` and set either
`GOOGLE_APPLICATION_CREDENTIALS` (path to a service account file) or
`FIREBASE_SERVICE_ACCOUNT_JSON` (the same JSON inline). The queries need two
composite indexes, which are declared in `firestore.indexes.json`:

```bash
firebase deploy --only firestore:indexes,firestore:rules
```

## Endpoints

Every response uses the same shape:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "...", "details": [] } }
```

Error codes and their status: `VALIDATION_ERROR` 400, `FORBIDDEN` 403, `NOT_FOUND` 404,
`CONFLICT` 409, `INTERNAL_ERROR` 500.

The six endpoints from the task:

| Method | Path                                    | What it does                      |
| ------ | --------------------------------------- | --------------------------------- |
| POST   | `/chat/create`                          | Create or get the 1:1 chat        |
| POST   | `/chat/:chatId/message/send`            | Send a message                    |
| GET    | `/chat/:chatId/messages?limit=50`       | List messages, oldest first       |
| POST   | `/chat/:chatId/message/:messageId/read` | Mark a message read               |
| POST   | `/chat/:chatId/lastseen`                | Update a user's last seen message |
| GET    | `/user/:userId/chats`                   | List a user's chats               |

Supporting endpoints, mostly so the ones above can be used:

| Method | Path                     | What it does                     |
| ------ | ------------------------ | -------------------------------- |
| POST   | `/user`                  | Create a user                    |
| GET    | `/user/:userId`          | Get one user                     |
| GET    | `/users?limit=50`        | List users                       |
| GET    | `/chat/:chatId`          | Get one chat with its members    |
| GET    | `/chat/:chatId/lastseen` | Last seen pointer of each member |
| GET    | `/health`                | Health check                     |

The bonus items:

| Method | Path                               | What it does                   |
| ------ | ---------------------------------- | ------------------------------ |
| POST   | `/chat/group/create`               | Create a group chat            |
| POST   | `/chat/:chatId/members`            | Add members (owner or admin)   |
| DELETE | `/chat/:chatId/members/:userId`    | Remove a member, or leave      |
| PATCH  | `/chat/:chatId/message/:messageId` | Edit a message (author only)   |
| DELETE | `/chat/:chatId/message/:messageId` | Delete a message (author only) |

## Examples

Create two users and a chat between them:

```bash
ALICE=$(curl -s -X POST localhost:3000/user -H 'Content-Type: application/json' \
  -d '{"username":"alice","displayName":"Alice"}' | jq -r .data.user.userId)

BOB=$(curl -s -X POST localhost:3000/user -H 'Content-Type: application/json' \
  -d '{"username":"bob","displayName":"Bob"}' | jq -r .data.user.userId)

CHAT=$(curl -s -X POST localhost:3000/chat/create -H 'Content-Type: application/json' \
  -d "{\"userAId\":\"$ALICE\",\"userBId\":\"$BOB\"}" | jq -r .data.chatId)
```

Calling `/chat/create` again with the two ids swapped returns the same `chatId` and
`created: false`.

Send a message and read the conversation back:

```bash
curl -X POST localhost:3000/chat/$CHAT/message/send \
  -H 'Content-Type: application/json' \
  -d "{\"senderId\":\"$ALICE\",\"text\":\"Standup at 10?\"}"

curl "localhost:3000/chat/$CHAT/messages?limit=50"
```

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "messageId": "71Aa4EWEnGOQiemoX6No",
        "chatId": "9c9ebf60-7454-465d-9f38-921e49340185",
        "senderId": "c8d8f366-d10d-40ab-b622-7347a284c844",
        "text": "Standup at 10?",
        "createdAt": "2026-11-24T13:42:57.056Z",
        "editedAt": null,
        "deletedAt": null,
        "isDeleted": false,
        "isEdited": false,
        "readBy": []
      }
    ],
    "pageInfo": { "limit": 50, "count": 1, "hasMore": false, "nextBefore": null }
  }
}
```

`limit` defaults to 50 and is capped at 100. Paging goes backwards through history:
pass `pageInfo.nextBefore` as `?before=` to get the next older page.

Mark it read, then move the last seen pointer:

```bash
curl -X POST localhost:3000/chat/$CHAT/message/$MESSAGE/read \
  -H 'Content-Type: application/json' -d "{\"userId\":\"$BOB\"}"

curl -X POST localhost:3000/chat/$CHAT/lastseen \
  -H 'Content-Type: application/json' -d "{\"userId\":\"$BOB\",\"messageId\":\"$MESSAGE\"}"
```

List Bob's chats. Member ids come from PostgreSQL, the last message, last seen pointer
and unread count come from Firestore:

```bash
curl localhost:3000/user/$BOB/chats
```

```json
{
  "success": true,
  "data": {
    "chats": [
      {
        "chatId": "9c9ebf60-7454-465d-9f38-921e49340185",
        "type": "DIRECT",
        "name": null,
        "memberIds": ["c8d8f366-...", "3e2b0dc1-..."],
        "members": [{ "userId": "c8d8f366-...", "role": "MEMBER", "username": "alice" }],
        "lastMessage": { "messageId": "71Aa4EWEnGOQiemoX6No", "text": "Standup at 10?" },
        "lastSeenMessageId": "71Aa4EWEnGOQiemoX6No",
        "unreadCount": 0,
        "createdAt": "2026-11-24T13:42:56.901Z",
        "updatedAt": "2026-11-24T13:42:57.658Z"
      }
    ]
  }
}
```

Group chats use the same message endpoints. The creator becomes `OWNER`; only an owner
or admin can add or remove other members; any member can remove themselves to leave,
and the owner cannot be removed by someone else.

```bash
curl -X POST localhost:3000/chat/group/create -H 'Content-Type: application/json' \
  -d "{\"name\":\"Weekend plans\",\"creatorId\":\"$ALICE\",\"memberIds\":[\"$BOB\"]}"
```

Edits set `editedAt` and `isEdited`. Deletes are soft: the document stays so that
ordering, read receipts and paging cursors keep working, `text` becomes `null` and
`isDeleted` becomes `true`.

## Data model

PostgreSQL (see `prisma/schema.prisma`):

```
users                        chats                                chat_members
id           uuid PK         id            uuid PK                id        uuid PK
username     varchar unique  type          DIRECT | GROUP         chat_id   uuid FK
display_name varchar         name          varchar null           user_id   uuid FK
created_at   timestamp       direct_key    varchar unique null    role      OWNER|ADMIN|MEMBER
updated_at   timestamp       created_by_id uuid FK null           joined_at timestamp
                             created_at    timestamp              unique (chat_id, user_id)
                             updated_at    timestamp
```

Firestore:

```
chats/{chatId}/messages/{messageId}
  chatId, senderId, text, createdAt, editedAt, deletedAt, isDeleted,
  readBy: { userId: timestamp }

chats/{chatId}/lastSeen/{userId}
  userId, chatId, messageId, messageCreatedAt, updatedAt
```

Both collections sit under `chats/{chatId}`, so reading one conversation never
touches another chat's documents and deleting a chat is a single recursive delete.

## How it is put together

```
routes -> controllers -> services -> repositories -> PostgreSQL / Firestore
```

Controllers validate input with Zod and do nothing else. Services hold the rules:
membership checks, chat creation, author checks on edit and delete, role checks for
group management, unread counts. They talk to repository interfaces
(`src/repositories/interfaces.ts`), so they never import Prisma or `firebase-admin`
directly. `src/app.ts` builds the Express app from injected repositories, which is also
how the tests run the real HTTP stack against in-memory stores.

Services throw `AppError` with a code, and one Express error handler turns anything
thrown into the error response shape. Nothing else formats errors.

A few decisions worth explaining:

**One chat per pair.** `POST /chat/create` has to be idempotent, and "check then
insert" is a race: two requests for the same pair can both find nothing and both
insert. Each direct chat therefore stores a `direct_key` of the two user ids sorted and
joined, with a unique index on it. `(A, B)` and `(B, A)` produce the same key, so the
second insert fails on the constraint and the repository returns the existing chat
instead of an error. The database enforces it, not request timing.

**Messages in Firestore.** They grow without limit, are written far more often than
read back in bulk, and are rarely updated, so they sit badly in a relational table that
also serves membership joins. Per-chat subcollections split the data naturally, and
`serverTimestamp()` means ordering does not depend on the clock of whichever API
instance handled the request. The same documents can later be streamed to clients with
Firestore listeners without schema changes.

**Stable ordering.** Two messages can share a timestamp, so every query orders by
`createdAt` and then by document id. Paging uses `startAfter(snapshot)` rather than an
offset, so a page costs the same whether it is the first or the hundredth.

**Receipts and last seen are stored differently.** A read receipt belongs to the
message it refers to, so it lives in a `readBy` map on the message document and is read
along with it. Marking a message read runs in a transaction that keeps the first
timestamp, so re-reading is not a new event. The last seen pointer is per user per chat
and changes on a different rhythm, so it is its own document, and unread counts can be
a single `count()` aggregation. The pointer only moves forward, so a late client call
cannot make read messages unread again.

**Strict typing.** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noImplicitReturns`, with ESLint on
`strictTypeChecked`. Firestore hands back `DocumentData`, which is effectively `any`, so
every document goes through an explicit mapper in the repository layer. Past that
boundary only the domain types in `src/types/domain.ts` are used.

Known limitations:

- There is no authentication. The task passes `userId` and `senderId` in the request, so
  the API trusts them and checks only chat membership. In production the caller would
  come from a verified token and those fields would go away.
- Two stores means no single transaction. If a message is written to Firestore and the
  follow-up `updatedAt` bump on the chat row fails, the chat list ordering is stale but
  the message is not lost. That seemed better than putting message bodies in PostgreSQL
  just to get one transaction.
- Unread counts are computed per chat on each `GET /user/:userId/chats`, which is a few
  Firestore reads per chat. A counter maintained on write would be the next step if
  that got hot.
- Unread counts are of messages strictly after the last seen message's timestamp. If
  two messages ever shared a timestamp with the pointer, one would count as read.
  Ordering and paging are not affected, since they tie-break on document id.

## Tests

```bash
npm test
npm run typecheck
npm run lint
```

49 tests. They drive the real Express app, routing, validation, controllers and
services through supertest, backed by in-memory repositories that copy the ordering,
cursor and idempotency behaviour of PostgreSQL and Firestore. So the suite needs no
database, no emulator and no credentials, and CI runs it on every push.

They cover create-or-get in both argument orders, chats with yourself, unknown users,
membership checks on send, read and lastseen, message ordering, `limit` and `before`
paging, repeated read receipts, forward-only last seen pointers, unread counts, group
roles, author-only edit and delete, soft delete, duplicate usernames and the error
shape for unknown routes.

`scripts/smoke.sh` is a separate check against a running server with real PostgreSQL
and a real emulator. It walks every endpoint and asserts the status code of each call,
including the 400, 403, 404 and 409 cases:

```bash
npm start
./scripts/smoke.sh
```

## Scripts

| Command                  | What it does                    |
| ------------------------ | ------------------------------- |
| `npm run dev`            | Run with reload                 |
| `npm run build`          | Compile to `dist/`              |
| `npm start`              | Run the compiled server         |
| `npm test`               | Run the tests                   |
| `npm run typecheck`      | `tsc --noEmit`                  |
| `npm run lint`           | ESLint                          |
| `npm run format`         | Prettier                        |
| `npm run emulator`       | Firestore emulator on port 8080 |
| `npm run db:up`          | PostgreSQL in Docker            |
| `npm run prisma:migrate` | Apply migrations                |
| `npm run seed`           | Insert sample data              |

## Layout

```
src/
  app.ts                  Express app built from injected repositories
  index.ts                Startup, wiring and shutdown
  config/                 env, logger, Prisma and Firebase clients
  routes/                 URL definitions
  controllers/            Input validation and responses
  services/               Business rules
  repositories/
    interfaces.ts         Contract both stores implement
    postgres/             Prisma implementations
    firestore/            Firestore implementations
  validators/             Zod schemas
  middleware/             Error and 404 handlers
  types/                  Domain records and response types
  utils/                  Errors, response helpers, direct key, time
prisma/                   Schema and migrations
tests/
  unit/                   Direct key and schemas
  api/                    HTTP tests over in-memory stores
  helpers/                In-memory PostgreSQL and Firestore doubles
scripts/                  seed.ts and smoke.sh
```

## License

MIT
