# Auction Backend (Node.js + Express + MongoDB + Socket.io)

REST API + real-time layer for the auction assignment. Admins create
auctions; users browse and bid; auctions close themselves at their end
time and record a winner — all driven by data in MongoDB, not by anything
that lives only in server memory, so it survives restarts/redeploys.

## Stack

- Express (REST API)
- MongoDB + Mongoose
- Socket.io (live bid updates)
- JWT auth (no signup — accounts are seeded)
- Cloudinary (auction image storage that survives redeploys)
- node-cron (auto-closes auctions at `endTime`)

## 1. Install

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:

- `MONGO_URI` — a local MongoDB (`mongodb://127.0.0.1:27017/auction_app`) or a free
  [MongoDB Atlas](https://www.mongodb.com/atlas) cluster connection string.
- `JWT_SECRET` — any long random string.
- `CLOUDINARY_*` — free account at https://cloudinary.com → dashboard gives you
  cloud name / API key / API secret. See **Image storage** below for why this
  matters.

## 2. Seed the database

```bash
npm run seed
```

This creates **1 admin + 5 users** (as required by the assignment) and prints
their credentials. Default seeded accounts (override via `.env`):

| Role  | Email                | Password   |
|-------|-----------------------|------------|
| admin | admin@auction.test   | Admin@123  |
| user  | aarav@auction.test   | User@123   |
| user  | diya@auction.test    | User@123   |
| user  | rohan@auction.test   | User@123   |
| user  | isha@auction.test    | User@123   |
| user  | kabir@auction.test   | User@123   |

Re-running `npm run seed` is idempotent (upserts the same accounts).

## 3. Run

```bash
npm run dev     # with nodemon
# or
npm start
```

Health check: `GET /health`.

## API overview

All routes except `/api/auth/login` require `Authorization: Bearer <token>`.

| Method | Path                      | Role        | Description |
|--------|---------------------------|-------------|--------------|
| POST   | /api/auth/login           | public      | `{ email, password }` → `{ token, user }` |
| GET    | /api/auth/me              | any         | current user |
| GET    | /api/auctions?status=     | any         | list auctions, optional `upcoming\|live\|ended` filter |
| GET    | /api/auctions/:id         | any         | auction detail (status/highest bid are always computed live) |
| GET    | /api/auctions/:id/bids    | any         | full bid history, newest first |
| GET    | /api/auctions/mine/bids   | any         | auctions the current user has bid on, with outcome |
| POST   | /api/auctions             | admin       | multipart/form-data: `title, description, startingPrice, minIncrement, startTime, endTime, image` |
| POST   | /api/auctions/:id/bids    | user/admin  | `{ amount }` → places a bid |

Error responses are always `{ success: false, message: "<human-readable reason>" }`
with an appropriate HTTP status (400 validation, 401/403 auth, 404 not found,
409 "someone else just outbid you / auction just ended").

## How the auction rules are enforced

- **Bid window** — a bid is rejected with a clear message if `now < startTime`
  or `now >= endTime`.
- **First bid ≥ starting price**, **later bids ≥ highest + minIncrement** —
  checked in `bidController.js` before attempting the write.
- **Concurrency correctness** — two bids arriving at the same instant are
  resolved with a single atomic `findOneAndUpdate` whose *filter* (not just
  its intent) requires `currentHighestBid.amount < newAmount`. MongoDB
  applies that comparison at the moment it writes, not at the moment the
  request was read, so only one of two simultaneous equal/overlapping bids
  can ever succeed — the other gets a `409` telling the user someone just
  outbid them. See the comment block at the top of `bidController.placeBid`.
- **Auto-closing at endTime, even if the server was down or restarted** —
  `services/auctionCloser.js` runs a cron tick every few seconds (and once
  immediately on boot) that finds every auction whose `endTime` has passed
  and is not yet `ended`, and closes it with the then-current highest
  bidder as winner (or no winner if there were no bids). Because this is
  derived purely from `endTime` stored in MongoDB, it doesn't matter if the
  process restarted or nobody had the app open — the next tick/boot catches
  up. `listAuctions`/`getAuction` also call the same close function before
  reading, so a client can never see a stale "live" auction whose time is
  actually up.
- **Bids can't be edited/withdrawn** — there's simply no update/delete route
  for bids.

## Real-time updates (Socket.io)

- Client connects and emits `auction:join` with an auction id to join that
  auction's room.
- Server emits `bid:placed` (new highest bid + bid history entry) to that
  room right after a bid is accepted, and `auction:ended` (winner + final
  amount) when the closer job ends it.
- No polling needed for "see bids from other users without refreshing".

## Image storage (why Cloudinary)

Render/Railway's free web-service tiers use an **ephemeral filesystem** —
anything written to local disk (including `multer`'s default disk storage)
is lost on restart or redeploy. Since the assignment requires uploaded
images to "stay available after the server restarts or redeploys", this API
uploads images to Cloudinary's free tier instead (`src/middleware/upload.js`).
If `CLOUDINARY_*` env vars are not set, it falls back to local disk under
`uploads/` for convenience in local dev only — don't rely on that in
production.

## Deploying (Render, free tier)

1. Push this `backend/` folder to a Git repo (or the root of your submission
   repo with `backend/` as a subfolder).
2. On Render: **New → Web Service** → connect the repo → set **Root
   Directory** to `backend` → Build command `npm install` → Start command
   `npm start`.
3. Add the same environment variables as `.env` (Render → Environment tab).
   Use a MongoDB Atlas free cluster for `MONGO_URI` (Render's own Postgres
   add-on doesn't apply here — this is MongoDB).
4. Once live, SSH/Shell into the instance (or run locally against the Atlas
   URI) and run `npm run seed` once to create the admin + 5 users.
5. Render free services spin down when idle — the first request after idle
   can take ~30-60s to respond. Keep this in mind during your review window;
   you can ping `/health` periodically to keep it warm (e.g. a free
   [cron-job.org](https://cron-job.org) hit every 10 minutes) if that
   matters for your review.

Railway works the same way (set root directory to `backend`, same env vars,
same build/start commands); Railway's free tier currently requires a card
on file but no charge for small usage.

## AI tool usage disclosure

This backend (and the Flutter app alongside it) was scaffolded with the
help of an AI coding assistant (Claude): architecture, model design, the
atomic-bid concurrency strategy, the restart-safe auto-closing job, and the
bulk of the boilerplate were generated with AI assistance and then reviewed
and adjusted. See the top-level `README.md` for the full disclosure.
