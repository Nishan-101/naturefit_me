const SETTINGS = {
  whatsapp_business_number: "971502483083",
  whatsapp_mode: "click_to_chat",
  delivery_weekdays: "[0,1,2,3,4,5,6]",
  min_delivery_days: "5",
  delivery_fee_aed: "0",
  cod_enabled: "false",
  bank_transfer_enabled: "false",
  bank_details: "",
  card_payments_enabled: "true",
  meal_customization_enabled: "false",
  change_cutoff_time: "18:00",
  change_cutoff_lead_days: "1",
  service_emirates: '["Dubai"]',
  instagram_url: "https://www.instagram.com/naturefit.res/",
  facebook_url: "https://www.facebook.com/naturefit.res/",
  public_phone: "+971 50 248 3083",
  public_email: "naturefitdxb@gmail.com",
  public_address: "Nature Fit Restaurant, Al Safa Complex, Dubai, UAE",
  public_hours: "Daily · 8:00 AM – 12:00 PM",
};

const PLANS = [
  ["weight-loss", "Weight Loss", "Calorie-conscious plates with enough protein to stay satisfied.", "Portioned for a steady calorie deficit. Tell the kitchen about foods you avoid and the plan is built around them.", '["Protein-focused portions","Designed for a calorie deficit","3 meals a day: 1350–1500 kcal"]', 1, 0],
  ["balance", "Balanced Lifestyle", "Everyday meals for steady energy, without a strict cut or bulk.", "A practical mix for people who want consistent meals through the week.", '["Steady everyday energy","Balanced plates","3 meals a day: 1600–1750 kcal"]', 2, 0],
  ["lifestyle", "Healthy Lifestyle", "Whole-food meals for people who want to eat well every day.", "Fresh meals for a routine that is about eating well, not a short challenge.", '["Whole-food cooking","Ready for the week","3 meals a day: 1750–1800 kcal"]', 3, 0],
  ["muscle-gain", "Muscle Gain", "Higher-calorie plates for training and recovery.", "Four meals a day are available on this plan. One-meal and two-meal calorie ranges stay blank until the kitchen publishes them.", '["Higher-protein plates","Supports training days","3 meals: 1900–2100 kcal","4 meals: 2200–2300 kcal"]', 4, 1],
];

const CALORIES = [
  ["weight-loss", 1, null, null],
  ["weight-loss", 2, null, null],
  ["weight-loss", 3, 1350, 1500],
  ["balance", 1, null, null],
  ["balance", 2, null, null],
  ["balance", 3, 1600, 1750],
  ["lifestyle", 1, null, null],
  ["lifestyle", 2, null, null],
  ["lifestyle", 3, 1750, 1800],
  ["muscle-gain", 1, null, null],
  ["muscle-gain", 2, null, null],
  ["muscle-gain", 3, 1900, 2100],
  ["muscle-gain", 4, 2200, 2300],
];

async function ensureColumn(connection, table, column, definition) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!Number(rows[0].total)) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function ensureCommerceSchema(connection) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS meal_plan_catalog (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(80) NOT NULL,
      summary VARCHAR(300) NOT NULL,
      description TEXT NOT NULL,
      benefits TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      active TINYINT NOT NULL DEFAULT 1,
      allow_four_meals TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS calorie_bands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_slug VARCHAR(40) NOT NULL,
      meals_per_day TINYINT UNSIGNED NOT NULL,
      min_kcal INT NULL,
      max_kcal INT NULL,
      UNIQUE KEY uq_calorie_band (plan_slug, meals_per_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS plan_durations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      days INT NOT NULL UNIQUE,
      label VARCHAR(80) NOT NULL,
      active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS price_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_slug VARCHAR(40) NOT NULL,
      meals_per_day TINYINT UNSIGNED NOT NULL,
      duration_days INT NOT NULL,
      price_aed DECIMAL(10,2) NULL,
      active TINYINT NOT NULL DEFAULT 1,
      UNIQUE KEY uq_price_rule (plan_slug, meals_per_day, duration_days)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS delivery_slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS add_ons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      price_aed DECIMAL(10,2) NOT NULL,
      active TINYINT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(400) NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'Meal',
      kcal INT NULL,
      protein_g DECIMAL(6,1) NULL,
      carbs_g DECIMAL(6,1) NULL,
      fat_g DECIMAL(6,1) NULL,
      image_path VARCHAR(300) NULL,
      active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS promo_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      discount_type VARCHAR(20) NOT NULL,
      discount_value DECIMAL(10,2) NOT NULL,
      active TINYINT NOT NULL DEFAULT 1,
      max_uses INT NULL,
      uses INT NOT NULL DEFAULT 0,
      expires_at DATE NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(24) NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      plan_slug VARCHAR(40) NOT NULL,
      plan_name VARCHAR(80) NOT NULL,
      meals_per_day TINYINT UNSIGNED NOT NULL,
      duration_days INT NOT NULL,
      delivery_days TEXT NOT NULL,
      delivery_slot_id INT NULL,
      delivery_slot_label VARCHAR(80) NULL,
      start_date DATE NOT NULL,
      end_date DATE NULL,
      address_line VARCHAR(300) NOT NULL,
      emirate VARCHAR(40) NOT NULL,
      area VARCHAR(80) NOT NULL,
      building VARCHAR(160) NULL,
      instructions VARCHAR(500) NULL,
      allergies VARCHAR(500) NULL,
      menu_item_ids TEXT NULL,
      add_on_ids TEXT NULL,
      promo_code VARCHAR(40) NULL,
      subtotal_aed DECIMAL(10,2) NULL,
      discount_aed DECIMAL(10,2) NOT NULL DEFAULT 0,
      delivery_fee_aed DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_aed DECIMAL(10,2) NULL,
      currency CHAR(3) NOT NULL DEFAULT 'AED',
      price_status VARCHAR(20) NOT NULL,
      payment_method VARCHAR(40) NOT NULL,
      payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
      order_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
      privacy_consent TINYINT NOT NULL DEFAULT 0,
      whatsapp_opt_in TINYINT NOT NULL DEFAULT 0,
      whatsapp_click_url TEXT NULL,
      calorie_label VARCHAR(40) NULL,
      email_sent TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'inactive',
      start_date DATE NOT NULL,
      end_date DATE NULL,
      CONSTRAINT fk_subscription_order FOREIGN KEY (order_id) REFERENCES orders(id),
      CONSTRAINT fk_subscription_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscription_id INT NOT NULL,
      delivery_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      UNIQUE KEY uq_delivery (subscription_id, delivery_date),
      CONSTRAINT fk_delivery_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS pause_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscription_id INT NOT NULL,
      customer_id INT NOT NULL,
      request_type VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason VARCHAR(300) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pause_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      provider VARCHAR(40) NOT NULL,
      method VARCHAR(40) NOT NULL,
      amount_aed DECIMAL(10,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'AED',
      status VARCHAR(30) NOT NULL,
      provider_ref VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      direction VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL,
      recipient VARCHAR(30) NULL,
      body_preview VARCHAR(500) NULL,
      provider_message_id VARCHAR(120) NULL,
      error_message VARCHAR(300) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_whatsapp_once (order_id, direction),
      CONSTRAINT fk_whatsapp_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS testimonials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      author_name VARCHAR(80) NOT NULL,
      area VARCHAR(80) NULL,
      quote_text TEXT NOT NULL,
      approved TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS phone_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone_e164 VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      twilio_sid VARCHAR(64) NULL,
      send_count INT NOT NULL DEFAULT 1,
      check_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      proof_hash CHAR(64) NULL,
      proof_expires_at DATETIME NULL,
      consumed_at DATETIME NULL,
      order_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_phone_proof (proof_hash),
      INDEX idx_phone_verification (phone_e164, created_at),
      CONSTRAINT fk_phone_verification_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS package_inquiries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(24) NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      plan_slug VARCHAR(40) NOT NULL,
      plan_name VARCHAR(80) NOT NULL,
      meals_per_day TINYINT UNSIGNED NOT NULL,
      duration_days INT NOT NULL,
      delivery_days TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NULL,
      address_line VARCHAR(300) NOT NULL,
      instructions VARCHAR(500) NULL,
      total_aed DECIMAL(10,2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'AED',
      request_type VARCHAR(20) NOT NULL DEFAULT 'inquiry',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      email_sent TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_package_inquiry_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS stripe_events (
      event_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      order_reference VARCHAR(24) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const statement of statements) {
    await connection.query(statement);
  }

  const columns = [
    ["customers", "password_hash", "VARCHAR(255) NULL"],
    ["customers", "privacy_consent", "TINYINT NOT NULL DEFAULT 0"],
    ["customers", "whatsapp_opt_in", "TINYINT NOT NULL DEFAULT 0"],
    ["payments", "checkout_session_id", "VARCHAR(160) NULL"],
    ["customer_profiles", "emirate", "VARCHAR(40) NULL"],
    ["customer_profiles", "area", "VARCHAR(80) NULL"],
    ["customer_profiles", "building", "VARCHAR(160) NULL"],
  ];
  for (const [table, column, definition] of columns) {
    await ensureColumn(connection, table, column, definition);
  }

  for (const [key, value] of Object.entries(SETTINGS)) {
    await connection.execute("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)", [key, value]);
  }
  for (const plan of PLANS) {
    await connection.execute(
      `INSERT IGNORE INTO meal_plan_catalog (slug, name, summary, description, benefits, sort_order, allow_four_meals)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      plan
    );
  }
  for (const band of CALORIES) {
    await connection.execute(
      "INSERT IGNORE INTO calorie_bands (plan_slug, meals_per_day, min_kcal, max_kcal) VALUES (?, ?, ?, ?)",
      band
    );
  }
  for (const [days, label, sort] of [
    [20, "20 delivery days", 1],
    [24, "24 delivery days", 2],
    [30, "30 delivery days", 3],
    [90, "90 delivery days", 4],
  ]) {
    await connection.execute("INSERT IGNORE INTO plan_durations (days, label, sort_order) VALUES (?, ?, ?)", [days, label, sort]);
  }
  const [slots] = await connection.execute("SELECT COUNT(*) AS total FROM delivery_slots");
  if (!Number(slots[0].total)) {
    await connection.execute("INSERT INTO delivery_slots (label, sort_order) VALUES (?, ?)", ["Morning · 8:00 AM – 12:00 PM", 1]);
  }
  console.log("✅ MySQL: meal-plan commerce tables ready");
}

module.exports = { ensureCommerceSchema };
