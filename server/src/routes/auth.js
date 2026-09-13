import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/signup", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Enter your full name." });
  // users.name is VARCHAR(120) in the schema — check this before hitting the
  // database, so a too-long name gets a clean 400 instead of falling through
  // to a raw 500 from MySQL's ER_DATA_TOO_LONG (found via live testing, see
  // FORM_VALIDATION_REPORT.md).
  if (name.trim().length > 120) return res.status(400).json({ error: "Name must be 120 characters or fewer." });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Use at least 8 characters." });

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
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!password) return res.status(400).json({ error: "Enter a password." });

  const rows = await query("SELECT * FROM users WHERE email = :email", { email });
  const dbUser = rows[0];
  // Generic error — never reveal whether the email exists.
  if (!dbUser) return res.status(401).json({ error: "Invalid email or password." });

  const ok = await bcrypt.compare(password, dbUser.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });

  const user = { id: dbUser.id, name: dbUser.name, email: dbUser.email };
  res.json({ user, token: sign(user) });
}));

export default router;
