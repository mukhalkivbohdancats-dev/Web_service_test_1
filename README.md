# Kishka Notes

A tiny Node.js notepad with temporary in-memory storage.

## Run locally

```bash
npm start
```

Open http://localhost:3000

## Render settings

- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment: Node.js 18 or newer

The app listens on `0.0.0.0` and uses Render's `PORT` environment variable.

## Storage and expiry

- No database and no files are used for note storage.
- Notes live only in the Node.js process memory.
- Each note expires 15 minutes after its latest successful save.
- A note is removed automatically; it can also be deleted through the API.
- Restarting/redeploying/spinning down the service clears every note immediately.
- Render Free web services spin down after 15 minutes without inbound traffic, so the service's sleep can clear notes before their own TTL in some situations.

## API

- `POST /api/notes` — create note; JSON body: `{"title":"...","content":"..."}`
- `GET /api/notes/:id` — load note
- `PUT /api/notes/:id` — update note and refresh its 15-minute TTL
- `DELETE /api/notes/:id` — delete note immediately
- `GET /api/health` — health check

Anyone with a note's private link can read and edit it. Do not store passwords or sensitive information.
