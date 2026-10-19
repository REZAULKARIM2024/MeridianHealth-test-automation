USE meridian_health;

INSERT INTO doctors (id, name, specialty, rating) VALUES
  ('d1', 'Dr. Amara Osei', 'Cardiology', 4.9),
  ('d2', 'Dr. Rajiv Nair', 'General Physician', 4.8),
  ('d3', 'Dr. Elena Petrova', 'Dermatology', 4.7),
  ('d4', 'Dr. Marcus Webb', 'Psychiatry', 4.9)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- doctor_slots has a UNIQUE (doctor_id, slot_label) key (uq_doctor_slot), so
-- duplicates are impossible; the table is still cleared and reinserted so the
-- base seed always matches this file exactly.
DELETE FROM doctor_slots;
INSERT INTO doctor_slots (doctor_id, slot_label) VALUES
  ('d1','9:00 AM'), ('d1','11:30 AM'), ('d1','2:00 PM'), ('d1','4:30 PM'),
  ('d2','8:30 AM'), ('d2','10:00 AM'), ('d2','1:00 PM'), ('d2','5:30 PM'),
  ('d3','10:30 AM'), ('d3','12:00 PM'), ('d3','3:00 PM'),
  ('d4','9:30 AM'), ('d4','1:30 PM'), ('d4','4:00 PM');

INSERT INTO medicines (id, name, price, rx_required, stock) VALUES
  ('m1', 'Amoxicillin 500mg', 12.50, 1, 24),
  ('m2', 'Ibuprofen 200mg', 6.20, 0, 120),
  ('m3', 'Metformin 500mg', 9.80, 1, 0),
  ('m4', 'Cetirizine 10mg', 4.50, 0, 80),
  ('m5', 'Omeprazole 20mg', 11.00, 1, 15),
  ('m6', 'Vitamin D3 1000IU', 8.00, 0, 200)
ON DUPLICATE KEY UPDATE price = VALUES(price), stock = VALUES(stock);

INSERT INTO trials (id, title, phase, condition_name, min_age, max_age, location) VALUES
  ('t1', 'Novel GLP-1 Therapy for Type 2 Diabetes', 'Phase III', 'diabetes', 30, 65, 'Boston, MA'),
  ('t2', 'Early-Stage Hypertension Management Study', 'Phase II', 'hypertension', 18, 70, 'Remote / Nationwide'),
  ('t3', 'Migraine Prevention with Monoclonal Antibody', 'Phase III', 'migraine', 18, 60, 'Chicago, IL'),
  ('t4', 'Pediatric Asthma Inhaler Comparison', 'Phase IV', 'asthma', 6, 17, 'Remote / Nationwide')
ON DUPLICATE KEY UPDATE title = VALUES(title);
