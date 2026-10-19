import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");

  console.log("Applying schema.sql ...");
  await conn.query(schema);
  // Migration for databases created before uq_doctor_slot existed:
  // CREATE TABLE IF NOT EXISTS won't add the key to an existing table, and an
  // older DB may already hold duplicate slots (repeated bulk seeding did this).
  const [idx] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = 'meridian_health' AND table_name = 'doctor_slots'
        AND index_name = 'uq_doctor_slot' LIMIT 1`
  );
  if (idx.length === 0) {
    console.log("Migrating doctor_slots: removing duplicates + adding uq_doctor_slot ...");
    await conn.query(
      `DELETE t1 FROM meridian_health.doctor_slots t1
         INNER JOIN meridian_health.doctor_slots t2
            ON t1.doctor_id = t2.doctor_id AND t1.slot_label = t2.slot_label AND t1.id > t2.id`
    );
    await conn.query(
      "ALTER TABLE meridian_health.doctor_slots ADD UNIQUE KEY uq_doctor_slot (doctor_id, slot_label)"
    );
  }
  console.log("Applying seed.sql ...");
  await conn.query(seed);
  console.log("Database ready: meridian_health");

  await conn.end();
}

run().catch((err) => {
  console.error("DB init failed:", err.message);
  process.exit(1);
});
