CREATE DATABASE IF NOT EXISTS meridian_health
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE meridian_health;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS doctors (
  id         VARCHAR(10) PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  specialty  VARCHAR(80)  NOT NULL,
  rating     DECIMAL(2,1) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS doctor_slots (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id  VARCHAR(10) NOT NULL,
  slot_label VARCHAR(20) NOT NULL,
  UNIQUE KEY uq_doctor_slot (doctor_id, slot_label),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  doctor_id  VARCHAR(10) NOT NULL,
  slot_label VARCHAR(20) NOT NULL,
  reason     TEXT,
  status     VARCHAR(20) DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medicines (
  id          VARCHAR(10) PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  rx_required TINYINT(1) NOT NULL DEFAULT 0,
  stock       INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  address    VARCHAR(200) NOT NULL,
  city       VARCHAR(100) NOT NULL,
  zip        VARCHAR(12)  NOT NULL,
  total      DECIMAL(10,2) NOT NULL,
  status     VARCHAR(20) DEFAULT 'placed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  medicine_id VARCHAR(10) NOT NULL,
  qty         INT NOT NULL,
  price_each  DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trials (
  id             VARCHAR(10) PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  phase          VARCHAR(20)  NOT NULL,
  condition_name VARCHAR(50)  NOT NULL,
  min_age        INT NOT NULL,
  max_age        INT NOT NULL,
  location       VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trial_interests (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  trial_id   VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_interest (user_id, trial_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (trial_id) REFERENCES trials(id)
) ENGINE=InnoDB;
