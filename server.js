const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { randomUUID } = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "reviews.json");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 16 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW = 10 * 60 * 1000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const rateBuckets = new Map();
let writeQueue = Promise.resolve();

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function cleanText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanRating(value) {
  let rating = Math.round(Number(value));
  if (!Number.isFinite(rating)) rating = 0;
  return Math.max(0, Math.min(5, rating));
}

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function normalizeReview(input) {
  const description = cleanText(input && input.description, 1200);
  const email = cleanText(input && input.email, 254);
  if (description.length < 10 || !isValidEmail(email)) return null;
  return {
    id: randomUUID(),
    name: cleanText(input && input.name, 60),
    email,
    rating: cleanRating(input && input.rating),
    description,
    pros: cleanText(input && input.pros, 400),
    cons: cleanText(input && input.cons, 400),
    replies: [],
    createdAt: new Date().toISOString()
  };
}

function normalizeReply(input) {
  const text = cleanText(input && input.text, 600);
  if (text.length < 2) return null;
  return {
    id: randomUUID(),
    name: cleanText(input && input.name, 40),
    text,
    createdAt: new Date().toISOString()
  };
}

function publicReply(reply) {
  return {
    id: String(reply.id || ""),
    name: cleanText(reply.name, 40),
    text: cleanText(reply.text, 600),
    createdAt: typeof reply.createdAt === "string" ? reply.createdAt : ""
  };
}

function publicReview(review) {
  return {
    id: String(review.id || ""),
    name: cleanText(review.name, 60),
    rating: cleanRating(review.rating),
    description: cleanText(review.description, 1200),
    pros: cleanText(review.pros, 400),
    cons: cleanText(review.cons, 400),
    replies: Array.isArray(review.replies) ? review.replies.map(publicReply) : [],
    createdAt: typeof review.createdAt === "string" ? review.createdAt : ""
  };
}

async function readReviews() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeReviews(reviews) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(DATA_FILE, JSON.stringify(reviews, null, 2) + "\n", "utf8");
  });
  return writeQueue;
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt > RATE_WINDOW) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  if (bucket.count >= RATE_LIMIT) return true;
  bucket.count += 1;
  return false;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        settled = true;
        const error = new Error("request too large");
        error.status = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }
  const relative = decoded.replace(/^[/\\]+/, "") || "index.html";
  const parts = relative.split(/[/\\]/);
  if (parts.some((part) => part.startsWith("."))) return null;
  if (relative.toLowerCase() === "server.js" || parts[0].toLowerCase() === "data") return null;
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;
  return filePath;
}

async function serveStatic(request, response, pathname) {
  let filePath = resolveFile(pathname);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const data = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const isHtml = extension === ".html";
    response.writeHead(200, {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  } catch (error) {
    const status = error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500;
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(status === 404 ? "Not found" : "Server error");
  }
}

async function handleReviews(request, response) {
  if (request.method === "GET") {
    const reviews = await readReviews();
    sendJson(response, 200, { reviews: reviews.map(publicReview) });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const ip = request.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    sendJson(response, 429, { error: "Too many reviews. Try again later." });
    return;
  }

  let input;
  try {
    const raw = await readBody(request);
    input = JSON.parse(raw);
  } catch (error) {
    sendJson(response, error.status === 413 ? 413 : 400, { error: "Invalid request" });
    return;
  }

  if (input && input.website) {
    sendJson(response, 400, { error: "Invalid request" });
    return;
  }

  const review = normalizeReview(input);
  if (!review) {
    sendJson(response, 400, { error: "Invalid review data" });
    return;
  }

  const reviews = await readReviews();
  reviews.unshift(review);
  await writeReviews(reviews.slice(0, 1000));
  sendJson(response, 201, { review: publicReview(review) });
}

async function handleReplies(request, response, reviewId) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const ip = request.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    sendJson(response, 429, { error: "Too many replies. Try again later." });
    return;
  }

  let input;
  try {
    const raw = await readBody(request);
    input = JSON.parse(raw);
  } catch (error) {
    sendJson(response, error.status === 413 ? 413 : 400, { error: "Invalid request" });
    return;
  }

  if (input && input.website) {
    sendJson(response, 400, { error: "Invalid request" });
    return;
  }

  const reply = normalizeReply(input);
  if (!reply) {
    sendJson(response, 400, { error: "Reply is too short" });
    return;
  }

  const reviews = await readReviews();
  const review = reviews.find((item) => String(item.id) === reviewId);
  if (!review) {
    sendJson(response, 404, { error: "Review not found" });
    return;
  }
  if (!Array.isArray(review.replies)) review.replies = [];
  if (review.replies.length >= 200) {
    sendJson(response, 400, { error: "Reply limit reached" });
    return;
  }
  review.replies.push(reply);
  await writeReviews(reviews);
  sendJson(response, 201, { review: publicReview(review) });
}

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch (error) {
    sendJson(response, 400, { error: "Invalid URL" });
    return;
  }

  if (pathname === "/api/reviews") {
    try {
      await handleReviews(request, response);
    } catch (error) {
      sendJson(response, 500, { error: "Server error" });
    }
    return;
  }

  const replyMatch = pathname.match(/^\/api\/reviews\/([^/]+)\/replies$/);
  if (replyMatch) {
    let reviewId;
    try {
      reviewId = decodeURIComponent(replyMatch[1]);
    } catch (error) {
      sendJson(response, 400, { error: "Invalid review id" });
      return;
    }
    try {
      await handleReplies(request, response, reviewId);
    } catch (error) {
      sendJson(response, 500, { error: "Server error" });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  await serveStatic(request, response, pathname);
});

server.listen(PORT, () => {
  console.log(`KAban portfolio running at http://localhost:${PORT}`);
});
