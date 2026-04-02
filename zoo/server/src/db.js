import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123',
  database: process.env.DB_NAME || 'zoo',
  ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
})

export async function query(text, params = []) {
  return pool.query(text, params)
}

export async function ensureSchema() {
  await query(`
    ALTER TABLE animals
    ADD COLUMN IF NOT EXISTS image_path TEXT
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS technician_animals (
      technician_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      animal_id INTEGER NOT NULL REFERENCES animals(animal_id) ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (technician_id, animal_id)
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS procedure_types (
      type_id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      default_interval_days INTEGER DEFAULT 1
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS purchase_requests (
      request_id SERIAL PRIMARY KEY,
      feed_id INTEGER NOT NULL REFERENCES feed(feed_id) ON DELETE CASCADE,
      amount DECIMAL(10,2) NOT NULL,
      note VARCHAR(500),
      status VARCHAR(20) DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
    )
  `)
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_animals_name_species_birth
     ON animals (LOWER(name), LOWER(species), birth_date)`,
  ).catch(() => {})
}
