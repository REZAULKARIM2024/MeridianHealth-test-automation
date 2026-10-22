import { Router } from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
const MAX_QTY = 99;

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  let { items, address, city, zip, rxConfirmed } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty." });
  }
  // Type guards: every field must be the expected primitive; nothing is coerced.
  const validItems = items.every(
    (i) => i && typeof i === "object" && typeof i.medicineId === "string" && Number.isInteger(i.qty) && i.qty >= 1 && i.qty <= MAX_QTY
  );
  if (!validItems || [address, city, zip].some((v) => typeof v !== "string")) {
    return res.status(400).json({ error: "Invalid request." });
  }
  if (address.length > 200 || city.length > 100) return res.status(400).json({ error: "Invalid request." });
  if (!address?.trim()) return res.status(400).json({ error: "Enter a shipping address." });
  if (!city?.trim()) return res.status(400).json({ error: "Enter a city." });
  if (!/^\d{4,6}$/.test(zip || "")) return res.status(400).json({ error: "Enter a valid ZIP/postal code." });

  // Merge repeated lines for the same medicine so the stock check sees the true total.
  const merged = new Map();
  for (const i of items) merged.set(i.medicineId, (merged.get(i.medicineId) || 0) + i.qty);
  items = [...merged].map(([medicineId, qty]) => ({ medicineId, qty }));

  const ids = items.map((i) => i.medicineId);
  const placeholders = ids.map(() => "?").join(",");
  const [medicines] = await pool.query(
    `SELECT * FROM medicines WHERE id IN (${placeholders})`,
    ids
  );
  const byId = Object.fromEntries(medicines.map((m) => [m.id, m]));

  const needsRx = items.some((i) => byId[i.medicineId]?.rx_required);
  if (needsRx && !rxConfirmed) {
    return res.status(400).json({ error: "Upload a valid prescription for Rx items in your cart." });
  }

  for (const item of items) {
    const med = byId[item.medicineId];
    if (!med) return res.status(404).json({ error: `Unknown medicine: ${item.medicineId}` });
    if (item.qty < 1) return res.status(400).json({ error: "Quantity must be at least 1." });
    if (med.stock < item.qty) return res.status(409).json({ error: `${med.name} is out of stock.` });
  }

  const total = items.reduce((sum, i) => sum + Number(byId[i.medicineId].price) * i.qty, 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      "INSERT INTO orders (user_id, address, city, zip, total) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, address, city, zip, total.toFixed(2)]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      const med = byId[item.medicineId];
      await conn.query(
        "INSERT INTO order_items (order_id, medicine_id, qty, price_each) VALUES (?, ?, ?, ?)",
        [orderId, item.medicineId, item.qty, med.price]
      );
      await conn.query(
        "UPDATE medicines SET stock = stock - ? WHERE id = ?",
        [item.qty, item.medicineId]
      );
    }

    await conn.commit();
    res.status(201).json({ orderId, total: Number(total.toFixed(2)) });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Could not place order. Please try again." });
  } finally {
    conn.release();
  }
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const orders = await query(
    "SELECT * FROM orders WHERE user_id = :userId ORDER BY created_at DESC",
    { userId: req.user.id }
  );
  res.json(orders);
}));

export default router;
