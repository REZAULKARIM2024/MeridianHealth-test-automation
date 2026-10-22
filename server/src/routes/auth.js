import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password policy: 8+ characters with at least one letter and one number.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// Brute-force protection: after MAX_FAILED wrong passwords for one email inside the window, further
// attempts for that email get 429 until the window ends. Keyed by the *attempted* email (even if no such
// account exists) so the lock itself reveals nothing. In-memory, per process: fine for a single demo API,
// would need a shared store (e.g. Redis) behind several instances. A known trade-off of per-account
// lockout is that someone can deliberately lock another person's account for the window.
const MAX_FAILED = Number(process.env.LOGIN_MAX_FAILED) || 5;
const LOCK_WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MS) || 15 * 60 * 1000;
const failedLogins = new Map(); // email -> { count, since }

function isLocked(email) {
  const rec = failedLogins.get(email);
  if (!rec) return false;
  if (Date.now() - rec.since > LOCK_WINDOW_MS) { failedLogins.delete(email); return false; }
  return rec.count >= MAX_FAILED;
}

function recordFailure(email) {
  const rec = failedLogins.get(email);
  if (!rec || Date.now() - rec.since > LOCK_WINDOW_MS) failedLogins.set(email, { count: 1, since: Date.now() });
  else rec.count += 1;
}

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Wrong-typed JSON fields (numbers, objects, arrays) used to reach .trim()/bcrypt and surface as a 500.
const allStrings = (...vals) => vals.every((v) => v === undefined || typeof v === "string");

router.post("/signup", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!allStrings(name, email, password)) return res.status(400).json({ error: "Name, email and password must be text." });
  if (!name?.trim()) return res.status(400).json({ error: "Enter your full name." });
  // users.name is VARCHAR(120) in the schema — check this before hitting the
  // database, so a too-long name gets a clean 400 instead of falling through
  // to a raw 500 from MySQL's ER_DATA_TOO_LONG (found via live testing, see
  // FORM_VALIDATION_REPORT.md).
  if (name.trim().length > 120) return res.status(400).json({ error: "Name must be 120 characters or fewer." });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
  if (!PASSWORD_RE.test(password)) return res.status(400).json({ error: "Use at least one letter and one number." });

  const existing = await query("SELECT id FROM users WHERE email = :email", { email });
  if (existing.length) return res.status(409).json({ error: "An account with this email already exists." });

  // Cost 8 instead of bcrypt's default 10 — this is a demo/QA app, not a
  // security-sensitive product, and bcryptjs (pure JS, no native bindings)
  // is noticeably CPU-heavier than native bcrypt at the same cost.
  const hash = await bcrypt.hash(password, 8);
  const result = await query(
    "INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)",
    { name, email, hash }
  );
  const user = { id: result.insertId, name, email };
  res.status(201).json({ user, token: sign(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!allStrings(email, password)) return res.status(400).json({ error: "Email and password must be text." });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!password) return res.status(400).json({ error: "Enter a password." });

  const key = email.toLowerCase();
  if (isLocked(key)) return res.status(429).json({ error: "Too many failed attempts. Try again later." });

  const rows = await query("SELECT * FROM users WHERE email = :email", { email });
  const dbUser = rows[0];
  // Generic error — never reveal whether the email exists.
  if (!dbUser) { recordFailure(key); return res.status(401).json({ error: "Invalid email or password." }); }

  const ok = await bcrypt.compare(password, dbUser.password_hash);
  if (!ok) { recordFailure(key); return res.status(401).json({ error: "Invalid email or password." }); }
  failedLogins.delete(key);

  const user = { id: dbUser.id, name: dbUser.name, email: dbUser.email };
  res.json({ user, token: sign(user) });
}));

export default router;
