import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
const MAX_REASON = 500;

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { doctorId, slot, reason } = req.body || {};
  if (!doctorId || !slot) return res.status(400).json({ error: "Select a time slot to continue." });
  // Type guard: ids/slots must be plain strings (arrays/objects/numbers are rejected, not coerced).
  const reasonOk = reason === undefined || reason === null || (typeof reason === "string" && reason.length <= MAX_REASON);
  if (typeof doctorId !== "string" || typeof slot !== "string" || !reasonOk) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const doctor = (await query("SELECT * FROM doctors WHERE id = :doctorId", { doctorId }))[0];
  if (!doctor) return res.status(404).json({ error: "Doctor not found." });

  const validSlot = await query(
    "SELECT 1 FROM doctor_slots WHERE doctor_id = :doctorId AND slot_label = :slot",
    { doctorId, slot }
  );
  if (!validSlot.length) return res.status(400).json({ error: "That slot isn't available for this doctor." });

  const result = await query(
    "INSERT INTO appointments (user_id, doctor_id, slot_label, reason) VALUES (:userId, :doctorId, :slot, :reason)",
    { userId: req.user.id, doctorId, slot, reason: reason || null }
  );

  res.status(201).json({
    id: result.insertId,
    doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty, rating: doctor.rating },
    slot,
    reason: reason || null,
  });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT a.id, a.slot_label, a.reason, a.status, a.created_at,
            d.id as doctor_id, d.name as doctor_name, d.specialty, d.rating
     FROM appointments a JOIN doctors d ON d.id = a.doctor_id
     WHERE a.user_id = :userId
     ORDER BY a.created_at DESC`,
    { userId: req.user.id }
  );
  res.json(rows);
}));

export default router;
