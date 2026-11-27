const { pool } = require("../config/db");

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS public_menu_profiles (
  slug VARCHAR(80) NOT NULL PRIMARY KEY,
  profile_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

function missingTable(error) {
  return error && (error.code === "ER_NO_SUCH_TABLE" || error.errno === 1146);
}

function shapeRow(row) {
  let profile = {};
  try {
    profile = JSON.parse(row.profile_json);
  } catch (error) {
    profile = {};
  }
  return { ...profile, id: row.slug, updatedAt: row.updated_at };
}

async function listProfiles() {
  try {
    const [rows] = await pool.execute(
      "SELECT slug, profile_json, updated_at FROM public_menu_profiles ORDER BY slug"
    );
    return rows.map(shapeRow);
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

async function saveProfile(profile) {
  await pool.query(CREATE_SQL);
  await pool.execute(
    `INSERT INTO public_menu_profiles (slug, profile_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE profile_json = VALUES(profile_json)`,
    [profile.id, JSON.stringify(profile)]
  );
}

module.exports = { listProfiles, saveProfile };
