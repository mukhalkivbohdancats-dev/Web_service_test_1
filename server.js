const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const NOTE_TTL_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 30000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Temporary in-memory storage: no database and no files are written.
const notes = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}

function cleanExpiredNotes() {
  const now = Date.now();
  for (const [id, note] of notes) {
    if (note.expiresAt <= now) notes.delete(id);
  }
}

setInterval(cleanExpiredNotes, 30_000).unref();

function publicNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    expiresAt: note.expiresAt
  };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateNoteInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Invalid note data.";
  }
  if (typeof input.title !== "string" || typeof input.content !== "string") {
    return "Title and content must be text.";
  }
  if (input.title.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  if (input.content.length > MAX_CONTENT_LENGTH) {
    return `Note must be ${MAX_CONTENT_LENGTH} characters or fewer.`;
  }
  return null;
}

function serveApp(res) {
  const filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Could not load the website.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, storage: "memory", ttlMinutes: 15 });
    }

    if (req.method === "POST" && pathname === "/api/notes") {
      const input = await readJson(req);
      const invalid = validateNoteInput(input);
      if (invalid) return sendJson(res, 400, { error: invalid });

      const now = Date.now();
      const id = crypto.randomBytes(16).toString("base64url");
      const note = {
        id,
        title: input.title.trim() || "Без назви",
        content: input.content,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + NOTE_TTL_MS
      };
      notes.set(id, note);
      return sendJson(res, 201, publicNote(note));
    }

    const noteMatch = pathname.match(/^\/api\/notes\/([A-Za-z0-9_-]{10,80})$/);
    if (noteMatch) {
      const id = noteMatch[1];
      cleanExpiredNotes();
      const existing = notes.get(id);

      if (req.method === "GET") {
        if (!existing) return sendJson(res, 404, { error: "NOTE_NOT_FOUND_OR_EXPIRED" });
        return sendJson(res, 200, publicNote(existing));
      }

      if (req.method === "PUT") {
        if (!existing) return sendJson(res, 404, { error: "NOTE_NOT_FOUND_OR_EXPIRED" });
        const input = await readJson(req);
        const invalid = validateNoteInput(input);
        if (invalid) return sendJson(res, 400, { error: invalid });

        const now = Date.now();
        existing.title = input.title.trim() || "Без назви";
        existing.content = input.content;
        existing.updatedAt = now;
        existing.expiresAt = now + NOTE_TTL_MS;
        return sendJson(res, 200, publicNote(existing));
      }

      if (req.method === "DELETE") {
        if (!existing) return sendJson(res, 404, { error: "NOTE_NOT_FOUND_OR_EXPIRED" });
        notes.delete(id);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (req.method === "GET" && (pathname === "/" || pathname.startsWith("/n/"))) {
      return serveApp(res);
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.status ? error.message : "Internal server error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Temporary Notepad listening on ${HOST}:${PORT}`);
});
