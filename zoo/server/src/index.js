import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ensureSchema, query } from './db.js'
import { adminRequired, authRequired } from './auth.js'
import { makeExcelReport, makePdfReport } from './reports.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 4000)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '../uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replaceAll(' ', '_')}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
})

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(uploadsDir))

async function logAction(userId, action, ipAddress) {
  await query(
    'INSERT INTO logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
    [userId || null, action, ipAddress || null],
  )
}

function validatePassword(password) {
  const minLen = password.length >= 8
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSpec = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  return minLen && hasUpper && hasLower && hasDigit && hasSpec
}

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1')
  res.json({ ok: true })
})

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body
  if (!login || !password) {
    return res.status(400).json({ message: 'Логин и пароль обязательны' })
  }

  const dbRes = await query(
    'SELECT user_id, login, password_hash, role, full_name, is_active FROM users WHERE LOWER(login) = LOWER($1) LIMIT 1',
    [login],
  )

  const user = dbRes.rows[0]
  if (!user?.is_active) {
    return res.status(401).json({ message: 'Неверный логин или пользователь неактивен' })
  }

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    await logAction(user.user_id, 'Неудачная попытка входа', req.ip)
    return res.status(401).json({ message: 'Неверный логин или пароль' })
  }

  const token = jwt.sign(
    { user_id: user.user_id, role: user.role, full_name: user.full_name, login: user.login },
    process.env.JWT_SECRET || 'zoo_secret',
    { expiresIn: '30m' },
  )

  await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [user.user_id])
  await logAction(user.user_id, 'Успешный вход в систему', req.ip)
  return res.json({ token, user: { ...user, password_hash: undefined } })
})

app.post('/api/auth/change-password', authRequired, async (req, res) => {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Старый и новый пароль обязательны' })
  }
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ message: 'Пароль не соответствует политике безопасности' })
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({ message: 'Новый пароль не должен совпадать со старым' })
  }

  const dbRes = await query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id])
  const ok = await bcrypt.compare(oldPassword, dbRes.rows[0].password_hash)
  if (!ok) return res.status(401).json({ message: 'Старый пароль введен неверно' })

  const newHash = await bcrypt.hash(newPassword, 12)
  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, req.user.user_id])
  await logAction(req.user.user_id, 'Смена пароля', req.ip)
  return res.json({ message: 'Пароль успешно изменен' })
})

app.get('/api/dashboard', authRequired, adminRequired, async (_req, res) => {
  const [a, p, u, lowFeed] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM animals'),
    query('SELECT COUNT(*)::int AS count FROM procedures WHERE next_performed >= NOW()'),
    query('SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE'),
    query('SELECT COUNT(*)::int AS count FROM feed WHERE quantity <= min_restock'),
  ])

  const lastActions = await query(
    'SELECT l.log_id, u.login, l.action, l.timestamp, l.ip_address FROM logs l LEFT JOIN users u ON u.user_id = l.user_id ORDER BY l.timestamp DESC LIMIT 20',
  )

  const visitorTrend = await query(
    'SELECT date, total FROM visitors ORDER BY date DESC LIMIT 7',
  )

  const activeTechnicians = await query(
    `SELECT u.user_id, u.full_name,
            COUNT(p.procedure_id)::int AS assigned_count
     FROM users u
     LEFT JOIN procedures p ON p.assigned_technic_id = u.user_id
     WHERE u.role = 'technician' AND u.is_active = TRUE
     GROUP BY u.user_id, u.full_name
     ORDER BY u.full_name`,
  )

  const animalHealth = await query(
    'SELECT health_status, COUNT(*)::int AS count FROM animals GROUP BY health_status ORDER BY count DESC',
  )

  res.json({
    cards: {
      animals: a.rows[0].count,
      procedures: p.rows[0].count,
      users: u.rows[0].count,
      lowFeed: lowFeed.rows[0].count,
    },
    lastActions: lastActions.rows,
    visitorTrend: visitorTrend.rows.reverse(),
    activeTechnicians: activeTechnicians.rows,
    animalHealth: animalHealth.rows,
  })
})

app.get('/api/animals', authRequired, adminRequired, async (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : null
  const status = req.query.status || null
  const dbRes = await query(
    `SELECT animal_id, name, species, birth_date, temperature, character, care_notes, health_status, image_path, created_at
     FROM animals
     WHERE ($1::text IS NULL OR name ILIKE $1 OR species ILIKE $1)
       AND ($2::text IS NULL OR health_status = $2)
     ORDER BY created_at DESC`,
    [search, status],
  )
  res.json(dbRes.rows)
})

app.post('/api/animals', authRequired, adminRequired, upload.single('image'), async (req, res) => {
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null
  const body = req.body || {}
  const {
    name, species, birth_date, temperature, character, care_notes, health_status,
  } = body
  const numericTemp = Number(temperature)
  if (Number.isNaN(numericTemp) || numericTemp < 5 || numericTemp > 45) {
    return res.status(400).json({ message: 'Температура должна быть в диапазоне 5..45' })
  }

  const duplicate = await query(
    `SELECT animal_id
     FROM animals
     WHERE LOWER(name) = LOWER($1)
       AND LOWER(species) = LOWER($2)
       AND birth_date = $3::date
     LIMIT 1`,
    [name, species, birth_date],
  )
  if (duplicate.rows[0]) {
    return res.status(409).json({ message: 'Такое животное уже есть в базе' })
  }

  let dbRes
  try {
    dbRes = await query(
      `INSERT INTO animals (name, species, birth_date, temperature, character, care_notes, health_status, image_path)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'нормальный'),$8)
       RETURNING animal_id, name, species, birth_date, temperature, character, care_notes, health_status, image_path, created_at`,
      [name, species, birth_date, temperature, character, care_notes, health_status, imagePath],
    )
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Такое животное уже есть в базе' })
    }
    throw error
  }
  await logAction(req.user.user_id, `Добавление животного: ${name}`, req.ip)
  res.status(201).json(dbRes.rows[0])
})

app.patch('/api/animals/:id', authRequired, adminRequired, upload.single('image'), async (req, res) => {
  const { id } = req.params
  const body = req.body || {}
  const {
    name, species, birth_date, temperature, character, care_notes, health_status,
  } = body
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null
  const normText = (v) => (typeof v === 'string' ? v.trim() : v)
  const normalizeDate = (value) => {
    const s = normText(value)
    if (!s) return null
    const dot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s))
    if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`
    return s
  }
  const rawTemp = normText(temperature)
  const numericTemp = rawTemp === '' || rawTemp === null || rawTemp === undefined
    ? null
    : Number(String(rawTemp).replace(',', '.'))
  if (numericTemp !== null && (Number.isNaN(numericTemp) || numericTemp < 5 || numericTemp > 45)) {
    return res.status(400).json({ message: 'Температура должна быть в диапазоне 5..45' })
  }
  const params = [
    normText(name) || '',
    normText(species) || '',
    normalizeDate(birth_date),
    numericTemp,
    normText(character) || '',
    normText(care_notes) || '',
    normText(health_status) || '',
    imagePath,
    id,
  ]
  try {
    await query(
      `UPDATE animals
       SET name = COALESCE(NULLIF($1, ''), name),
           species = COALESCE(NULLIF($2, ''), species),
           birth_date = COALESCE($3::date, birth_date),
           temperature = COALESCE($4, temperature),
           character = COALESCE(NULLIF($5, ''), character),
           care_notes = COALESCE(NULLIF($6, ''), care_notes),
           health_status = COALESCE(NULLIF($7, ''), health_status),
           image_path = COALESCE($8, image_path)
       WHERE animal_id = $9`,
      params,
    )
  } catch (error) {
    if (error?.code === '42703' && String(error.message || '').includes('image_path')) {
      await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS image_path TEXT')
      await query(
        `UPDATE animals
         SET name = COALESCE(NULLIF($1, ''), name),
             species = COALESCE(NULLIF($2, ''), species),
             birth_date = COALESCE(NULLIF($3, '')::date, birth_date),
             temperature = COALESCE(NULLIF($4, '')::numeric, temperature),
             character = COALESCE(NULLIF($5, ''), character),
             care_notes = COALESCE(NULLIF($6, ''), care_notes),
             health_status = COALESCE(NULLIF($7, ''), health_status),
             image_path = COALESCE($8, image_path)
         WHERE animal_id = $9`,
        params,
      )
    } else {
      throw error
    }
  }
  await logAction(req.user.user_id, `Изменение данных животного ID=${id}`, req.ip)
  res.json({ message: 'Данные животного обновлены' })
})

app.get('/api/animals/:id/history', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const dbRes = await query(
    `SELECT procedure_id, type_procedure, schedule, interval, last_performed, next_performed,
            u.full_name AS technician_name
     FROM procedures p
     LEFT JOIN users u ON u.user_id = p.assigned_technic_id
     WHERE p.animal_id = $1
     ORDER BY p.next_performed DESC`,
    [id],
  )
  res.json(dbRes.rows)
})

app.post('/api/animals/deduplicate', authRequired, adminRequired, async (req, res) => {
  const groups = await query(
    `SELECT
       LOWER(name) AS name_key,
       LOWER(species) AS species_key,
       birth_date,
       ARRAY_AGG(animal_id ORDER BY animal_id) AS ids
     FROM animals
     GROUP BY LOWER(name), LOWER(species), birth_date
     HAVING COUNT(*) > 1`,
  )

  let removed = 0
  let groupsMerged = 0

  for (const group of groups.rows) {
    const ids = group.ids || []
    if (ids.length < 2) continue
    const [keepId, ...dupIds] = ids
    groupsMerged += 1

    for (const dupId of dupIds) {
      await query('UPDATE procedures SET animal_id = $1 WHERE animal_id = $2', [keepId, dupId])
      await query(
        `INSERT INTO technician_animals (technician_id, animal_id)
         SELECT technician_id, $1
         FROM technician_animals
         WHERE animal_id = $2
         ON CONFLICT DO NOTHING`,
        [keepId, dupId],
      )
      await query('DELETE FROM technician_animals WHERE animal_id = $1', [dupId])
      await query('DELETE FROM animals WHERE animal_id = $1', [dupId])
      removed += 1
    }
  }

  await logAction(req.user.user_id, `Очистка дублей животных: удалено ${removed}`, req.ip)
  res.json({ groupsMerged, removed })
})

app.get('/api/animals/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const dbRes = await query(
    `SELECT animal_id, name, species, birth_date, temperature, character, care_notes, health_status, image_path, created_at
     FROM animals WHERE animal_id = $1`,
    [id],
  )
  if (!dbRes.rows[0]) return res.status(404).json({ message: 'Животное не найдено' })
  res.json(dbRes.rows[0])
})

app.delete('/api/animals/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const checks = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM procedures WHERE animal_id = $1 AND next_performed::date <= CURRENT_DATE + INTERVAL '30 days') AS active_count,
      (SELECT COUNT(*)::int FROM procedures WHERE animal_id = $1 AND next_performed < NOW()) AS overdue_count`,
    [id],
  )
  const { active_count: activeCount, overdue_count: overdueCount } = checks.rows[0]
  if (activeCount > 0 || overdueCount > 0) {
    return res.status(400).json({ message: 'Удаление запрещено: есть активные/просроченные процедуры' })
  }
  await query('DELETE FROM animals WHERE animal_id = $1', [id])
  await logAction(req.user.user_id, `Удаление животного ID=${id}`, req.ip)
  res.json({ message: 'Животное удалено' })
})

app.get('/api/users', authRequired, adminRequired, async (_req, res) => {
  const dbRes = await query(
    `SELECT user_id, login, role, full_name, position, is_active, email, phone, last_login
     FROM users ORDER BY created_at DESC`,
  )
  res.json(dbRes.rows)
})

app.post('/api/users', authRequired, adminRequired, async (req, res) => {
  const { login, role, full_name, position, email, phone } = req.body
  if (!login || !role || !full_name) return res.status(400).json({ message: 'Логин, роль и ФИО обязательны' })
  const tempPassword = `Zoo_${Math.random().toString(36).slice(2, 6)}A1!`
  const hash = await bcrypt.hash(tempPassword, 12)
  await query(
    `INSERT INTO users (login, password_hash, role, full_name, position, email, phone, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
    [login, hash, role, full_name, position || null, email || null, phone || null],
  )
  await logAction(req.user.user_id, `Создание пользователя ${login}`, req.ip)
  res.status(201).json({ message: 'Пользователь создан', tempPassword })
})

app.patch('/api/users/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const { full_name, position, email, phone, is_active } = req.body
  await query(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         position = COALESCE($2, position),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         is_active = COALESCE($5, is_active)
     WHERE user_id = $6`,
    [full_name, position, email, phone, is_active, id],
  )
  await logAction(req.user.user_id, `Изменение пользователя ID=${id}`, req.ip)
  res.json({ message: 'Пользователь обновлен' })
})

app.post('/api/users/:id/reset-password', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const tempPassword = `Zoo_${Math.random().toString(36).slice(2, 6)}A1!`
  const hash = await bcrypt.hash(tempPassword, 12)
  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, id])
  await logAction(req.user.user_id, `Сброс пароля пользователя ID=${id}`, req.ip)
  res.json({ message: 'Пароль сброшен', tempPassword })
})

app.delete('/api/users/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  if (Number(id) === req.user.user_id) {
    return res.status(400).json({ message: 'Нельзя удалить самого себя' })
  }
  await query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [id])
  await logAction(req.user.user_id, `Деактивация пользователя ID=${id}`, req.ip)
  res.json({ message: 'Пользователь деактивирован' })
})

app.get('/api/assignments', authRequired, adminRequired, async (_req, res) => {
  const dbRes = await query(
    `SELECT ta.technician_id, u.full_name AS technician_name, ta.animal_id, a.name AS animal_name, ta.assigned_at
     FROM technician_animals ta
     JOIN users u ON u.user_id = ta.technician_id
     JOIN animals a ON a.animal_id = ta.animal_id
     ORDER BY u.full_name, a.name`,
  )
  res.json(dbRes.rows)
})

app.post('/api/assignments', authRequired, adminRequired, async (req, res) => {
  const { technician_id, animal_id } = req.body
  if (!technician_id || !animal_id) {
    return res.status(400).json({ message: 'technician_id и animal_id обязательны' })
  }
  await query(
    'INSERT INTO technician_animals (technician_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [technician_id, animal_id],
  )
  await logAction(req.user.user_id, `Назначение животного ${animal_id} технику ${technician_id}`, req.ip)
  res.status(201).json({ message: 'Назначение сохранено' })
})

app.delete('/api/assignments/:technicianId/:animalId', authRequired, adminRequired, async (req, res) => {
  const { technicianId, animalId } = req.params
  await query('DELETE FROM technician_animals WHERE technician_id = $1 AND animal_id = $2', [technicianId, animalId])
  await logAction(req.user.user_id, `Отзыв назначения животного ${animalId} у техника ${technicianId}`, req.ip)
  res.json({ message: 'Назначение отозвано' })
})

app.get('/api/procedure-types', authRequired, adminRequired, async (_req, res) => {
  const t = await query('SELECT type_id, name, default_interval_days FROM procedure_types ORDER BY name')
  res.json(t.rows)
})

app.post('/api/procedure-types', authRequired, adminRequired, async (req, res) => {
  const { name, default_interval_days } = req.body
  if (!name) return res.status(400).json({ message: 'Название типа обязательно' })
  await query(
    'INSERT INTO procedure_types (name, default_interval_days) VALUES ($1, COALESCE($2, 1)) ON CONFLICT (name) DO NOTHING',
    [name, default_interval_days],
  )
  res.status(201).json({ message: 'Тип добавлен' })
})

app.post('/api/procedures/bulk', authRequired, adminRequired, async (req, res) => {
  const { animal_ids, type_procedure, schedule, interval, next_performed, assigned_technic_id } = req.body
  if (!Array.isArray(animal_ids) || animal_ids.length === 0 || !type_procedure || !next_performed) {
    return res.status(400).json({ message: 'Нужны animal_ids[], type_procedure, next_performed' })
  }
  for (const aid of animal_ids) {
    await query(
      `INSERT INTO procedures (animal_id, type_procedure, schedule, interval, next_performed, assigned_technic_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [aid, type_procedure, schedule || '', interval || 1, next_performed, assigned_technic_id || null],
    )
  }
  await logAction(req.user.user_id, `Массовое назначение процедур «${type_procedure}»`, req.ip)
  res.status(201).json({ message: `Создано процедур: ${animal_ids.length}` })
})

app.get('/api/purchase-requests', authRequired, adminRequired, async (_req, res) => {
  const dbRes = await query(
    `SELECT r.request_id, r.feed_id, f.name AS feed_name, r.amount, r.note, r.status, r.created_at, u.login AS created_by_login
     FROM purchase_requests r
     JOIN feed f ON f.feed_id = r.feed_id
     LEFT JOIN users u ON u.user_id = r.created_by
     ORDER BY r.created_at DESC LIMIT 100`,
  )
  res.json(dbRes.rows)
})

app.post('/api/purchase-requests', authRequired, adminRequired, async (req, res) => {
  const { feed_id, amount, note } = req.body
  if (!feed_id || !amount) return res.status(400).json({ message: 'feed_id и amount обязательны' })
  await query(
    'INSERT INTO purchase_requests (feed_id, amount, note, created_by) VALUES ($1, $2, $3, $4)',
    [feed_id, amount, note || null, req.user.user_id],
  )
  await logAction(req.user.user_id, `Заявка на закупку корма ID=${feed_id}`, req.ip)
  res.status(201).json({ message: 'Заявка создана' })
})

app.patch('/api/purchase-requests/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  await query('UPDATE purchase_requests SET status = COALESCE($1, status) WHERE request_id = $2', [status, id])
  res.json({ message: 'Статус обновлён' })
})

app.get('/api/procedures', authRequired, adminRequired, async (_req, res) => {
  const dbRes = await query(
    `SELECT p.procedure_id, p.animal_id, p.assigned_technic_id, p.type_procedure, p.schedule, p.interval, p.last_performed, p.next_performed,
            a.name AS animal_name, u.full_name AS technician_name
     FROM procedures p
     JOIN animals a ON a.animal_id = p.animal_id
     LEFT JOIN users u ON u.user_id = p.assigned_technic_id
     ORDER BY p.next_performed ASC`,
  )
  res.json(dbRes.rows)
})

app.post('/api/procedures', authRequired, adminRequired, async (req, res) => {
  const { animal_id, type_procedure, schedule, interval, next_performed, assigned_technic_id } = req.body
  await query(
    `INSERT INTO procedures (animal_id, type_procedure, schedule, interval, next_performed, assigned_technic_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [animal_id, type_procedure, schedule, interval, next_performed, assigned_technic_id || null],
  )
  await logAction(req.user.user_id, `Назначение процедуры ${type_procedure} животному ID=${animal_id}`, req.ip)
  res.status(201).json({ message: 'Процедура создана' })
})

app.patch('/api/procedures/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const { schedule, interval, next_performed, assigned_technic_id } = req.body
  await query(
    `UPDATE procedures
     SET schedule = COALESCE($1, schedule),
         interval = COALESCE($2, interval),
         next_performed = COALESCE($3, next_performed),
         assigned_technic_id = COALESCE($4, assigned_technic_id)
     WHERE procedure_id = $5`,
    [schedule, interval, next_performed, assigned_technic_id, id],
  )
  await logAction(req.user.user_id, `Изменение процедуры ID=${id}`, req.ip)
  res.json({ message: 'Процедура обновлена' })
})

app.delete('/api/procedures/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const dbRes = await query('SELECT next_performed, last_performed FROM procedures WHERE procedure_id = $1', [id])
  const proc = dbRes.rows[0]
  if (!proc) return res.status(404).json({ message: 'Процедура не найдена' })
  if (proc.last_performed) return res.status(400).json({ message: 'Нельзя удалить уже выполненную процедуру' })
  const msLeft = new Date(proc.next_performed).getTime() - Date.now()
  if (msLeft < 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'Можно удалить только если до выполнения больше 24 часов' })
  }
  await query('DELETE FROM procedures WHERE procedure_id = $1', [id])
  await logAction(req.user.user_id, `Удаление процедуры ID=${id}`, req.ip)
  res.json({ message: 'Процедура удалена' })
})

app.get('/api/feed', authRequired, adminRequired, async (_req, res) => {
  const dbRes = await query(
    `SELECT feed_id, name, unit, norm_per_procedure, min_restock, quantity, price, last_restock_date,
     CASE WHEN quantity <= min_restock THEN 'Требуется закупка'
          WHEN quantity <= min_restock * 2 THEN 'Запас заканчивается'
          ELSE 'Норма' END AS status
     FROM feed ORDER BY name ASC`,
  )
  res.json(dbRes.rows)
})

app.post('/api/feed', authRequired, adminRequired, async (req, res) => {
  const { name, unit, norm_per_procedure, min_restock, quantity, price, last_restock_date } = req.body
  await query(
    `INSERT INTO feed (name, unit, norm_per_procedure, min_restock, quantity, price, last_restock_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [name, unit, norm_per_procedure, min_restock, quantity, price, last_restock_date],
  )
  await logAction(req.user.user_id, `Добавление корма ${name}`, req.ip)
  res.status(201).json({ message: 'Корм добавлен' })
})

app.patch('/api/feed/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const { name, unit, norm_per_procedure, min_restock, price } = req.body
  await query(
    `UPDATE feed
     SET name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         norm_per_procedure = COALESCE($3, norm_per_procedure),
         min_restock = COALESCE($4, min_restock),
         price = COALESCE($5, price)
     WHERE feed_id = $6`,
    [name, unit, norm_per_procedure, min_restock, price, id],
  )
  await logAction(req.user.user_id, `Изменение корма ID=${id}`, req.ip)
  res.json({ message: 'Корм обновлен' })
})

app.post('/api/feed/:id/restock', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const amount = Number(req.body.amount || 0)
  if (amount <= 0) return res.status(400).json({ message: 'Пополнение должно быть больше 0' })
  await query(
    'UPDATE feed SET quantity = quantity + $1, last_restock_date = CURRENT_DATE WHERE feed_id = $2',
    [amount, id],
  )
  await logAction(req.user.user_id, `Пополнение корма ID=${id} на ${amount}`, req.ip)
  res.json({ message: 'Склад пополнен' })
})

app.delete('/api/feed/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const checks = await query(
    `SELECT
      (SELECT quantity FROM feed WHERE feed_id = $1) AS qty,
      (SELECT COUNT(*)::int FROM procedure_logs WHERE feed_id = $1 AND performed_at >= NOW() - INTERVAL '90 days') AS used_recently`,
    [id],
  )
  const row = checks.rows[0]
  if (Number(row.qty) > 0 || row.used_recently > 0) {
    return res.status(400).json({ message: 'Удаление запрещено: остаток не ноль или корм использовался за 90 дней' })
  }
  await query('DELETE FROM feed WHERE feed_id = $1', [id])
  await logAction(req.user.user_id, `Удаление корма ID=${id}`, req.ip)
  res.json({ message: 'Корм удален' })
})

app.get('/api/visitors', authRequired, adminRequired, async (req, res) => {
  const { from, to } = req.query
  if (from && to) {
    const dbRes = await query(
      `SELECT visitors_id, morning_shift, evening_shift, total, date FROM visitors
       WHERE date >= $1::date AND date <= $2::date ORDER BY date DESC`,
      [from, to],
    )
    return res.json(dbRes.rows)
  }
  const dbRes = await query(
    'SELECT visitors_id, morning_shift, evening_shift, total, date FROM visitors ORDER BY date DESC LIMIT 120',
  )
  res.json(dbRes.rows)
})

app.post('/api/visitors', authRequired, adminRequired, async (req, res) => {
  const { date, morning_shift, evening_shift } = req.body
  await query(
    `INSERT INTO visitors (date, morning_shift, evening_shift)
     VALUES ($1, $2, $3)
     ON CONFLICT(date) DO UPDATE SET morning_shift = EXCLUDED.morning_shift, evening_shift = EXCLUDED.evening_shift`,
    [date, morning_shift, evening_shift],
  )
  await logAction(req.user.user_id, `Ввод посещаемости за ${date}`, req.ip)
  res.status(201).json({ message: 'Посещаемость сохранена' })
})

app.delete('/api/visitors/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params
  const dbRes = await query('SELECT date FROM visitors WHERE visitors_id = $1', [id])
  if (!dbRes.rows[0]) return res.status(404).json({ message: 'Запись не найдена' })
  const date = new Date(dbRes.rows[0].date)
  const today = new Date()
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > 7) return res.status(400).json({ message: 'Удаление запрещено для дат старше 7 дней' })
  await query('DELETE FROM visitors WHERE visitors_id = $1', [id])
  await logAction(req.user.user_id, `Удаление посещаемости ID=${id}`, req.ip)
  res.json({ message: 'Запись посещаемости удалена' })
})

app.get('/api/audit', authRequired, adminRequired, async (req, res) => {
  const { from, to, userId } = req.query
  const conditions = []
  const params = []
  if (from) {
    params.push(from)
    conditions.push(`l.timestamp::date >= $${params.length}::date`)
  }
  if (to) {
    params.push(to)
    conditions.push(`l.timestamp::date <= $${params.length}::date`)
  }
  if (userId) {
    params.push(userId)
    conditions.push(`l.user_id = $${params.length}::int`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const dbRes = await query(
    `SELECT l.log_id, l.user_id, l.action, l.timestamp, l.ip_address, u.login
     FROM logs l LEFT JOIN users u ON u.user_id = l.user_id
     ${where}
     ORDER BY l.timestamp DESC LIMIT 1000`,
    params,
  )
  res.json(dbRes.rows)
})

app.get('/api/notifications', authRequired, adminRequired, async (_req, res) => {
  const [lowStock, overdue] = await Promise.all([
    query(`SELECT name, quantity, min_restock FROM feed WHERE quantity <= min_restock ORDER BY quantity ASC`),
    query(`SELECT p.procedure_id, a.name AS animal_name, p.type_procedure, p.next_performed
           FROM procedures p
           JOIN animals a ON a.animal_id = p.animal_id
           WHERE p.next_performed < NOW() ORDER BY p.next_performed ASC LIMIT 20`),
  ])

  res.json({
    lowStock: lowStock.rows,
    overdueProcedures: overdue.rows,
  })
})

app.get('/api/reports/export/:format', authRequired, adminRequired, async (req, res) => {
  const { format } = req.params
  const reportType = req.query.type || 'visitors'
  const { from, to } = req.query

  let title = ''
  let headers = []
  let rows = []

  const hasRange = from && to

  if (reportType === 'visitors') {
    title = hasRange ? `Отчет по посещаемости (${from} — ${to})` : 'Отчет по посещаемости'
    headers = ['Дата', 'Утренняя смена', 'Вечерняя смена', 'Итого']
    const dbRes = hasRange
      ? await query(
        `SELECT date, morning_shift, evening_shift, total FROM visitors
         WHERE date >= $1::date AND date <= $2::date ORDER BY date ASC`,
        [from, to],
      )
      : await query('SELECT date, morning_shift, evening_shift, total FROM visitors ORDER BY date DESC LIMIT 120')
    rows = dbRes.rows.map((x) => [new Date(x.date).toLocaleDateString('ru-RU'), x.morning_shift, x.evening_shift, x.total])
  } else if (reportType === 'feed') {
    title = 'Отчет по складу кормов'
    headers = ['Название', 'Ед.', 'Количество', 'Мин. остаток', 'Статус']
    const dbRes = await query('SELECT name, unit, quantity, min_restock FROM feed ORDER BY name')
    rows = dbRes.rows.map((x) => [x.name, x.unit, x.quantity, x.min_restock, Number(x.quantity) <= Number(x.min_restock) ? 'Требуется закупка' : 'Норма'])
  } else if (reportType === 'procedures') {
    title = hasRange ? `Отчет по процедурам (${from} — ${to})` : 'Отчет по процедурам'
    headers = ['Животное', 'Процедура', 'Следующее выполнение', 'Ответственный']
    const dbRes = hasRange
      ? await query(
        `SELECT a.name AS animal_name, p.type_procedure, p.next_performed, u.full_name AS technician
         FROM procedures p
         JOIN animals a ON a.animal_id = p.animal_id
         LEFT JOIN users u ON u.user_id = p.assigned_technic_id
         WHERE p.next_performed::date >= $1::date AND p.next_performed::date <= $2::date
         ORDER BY p.next_performed ASC`,
        [from, to],
      )
      : await query(
        `SELECT a.name AS animal_name, p.type_procedure, p.next_performed, u.full_name AS technician
         FROM procedures p
         JOIN animals a ON a.animal_id = p.animal_id
         LEFT JOIN users u ON u.user_id = p.assigned_technic_id
         ORDER BY p.next_performed ASC LIMIT 500`,
      )
    rows = dbRes.rows.map((x) => [x.animal_name, x.type_procedure, new Date(x.next_performed).toLocaleString('ru-RU'), x.technician || '-'])
  } else if (reportType === 'animals') {
    title = 'Реестр животных'
    headers = ['ID', 'Кличка', 'Вид', 'Статус здоровья', 'Температура']
    const dbRes = await query(
      'SELECT animal_id, name, species, health_status, temperature FROM animals ORDER BY name',
    )
    rows = dbRes.rows.map((x) => [x.animal_id, x.name, x.species, x.health_status, x.temperature])
  } else if (reportType === 'audit') {
    title = hasRange ? `Журнал аудита (${from} — ${to})` : 'Журнал аудита'
    headers = ['ID', 'Пользователь', 'Действие', 'Дата', 'IP']
    const params = []
    const conditions = []
    if (from) {
      params.push(from)
      conditions.push(`l.timestamp::date >= $${params.length}::date`)
    }
    if (to) {
      params.push(to)
      conditions.push(`l.timestamp::date <= $${params.length}::date`)
    }
    if (req.query.userId) {
      params.push(req.query.userId)
      conditions.push(`l.user_id = $${params.length}::int`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const dbRes = await query(
      `SELECT l.log_id, u.login, l.action, l.timestamp, l.ip_address
       FROM logs l LEFT JOIN users u ON u.user_id = l.user_id
       ${where}
       ORDER BY l.timestamp DESC LIMIT 2000`,
      params,
    )
    rows = dbRes.rows.map((x) => [x.log_id, x.login || '-', x.action, new Date(x.timestamp).toLocaleString('ru-RU'), x.ip_address || '-'])
  } else {
    return res.status(400).json({ message: 'Неизвестный тип отчета' })
  }

  if (format === 'pdf') {
    const pdf = await makePdfReport(title, headers, rows)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="zoo-report.pdf"')
    return res.send(pdf)
  }

  if (format === 'excel') {
    const buffer = makeExcelReport('Report', headers, rows)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="zoo-report.xlsx"')
    return res.send(buffer)
  }

  return res.status(400).json({ message: 'Поддерживаются только pdf и excel' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Файл слишком большой. Максимум 5 МБ.' })
  }
  if (error?.name === 'MulterError') {
    return res.status(400).json({ message: 'Ошибка загрузки файла. Проверьте формат JPG/PNG.' })
  }
  res.status(500).json({ message: 'Ошибка сервера', details: error.message })
})

async function start() {
  await ensureSchema()
  await query(
    `INSERT INTO procedure_types (name, default_interval_days)
     SELECT DISTINCT ON (type_procedure) type_procedure, COALESCE(interval, 1) FROM procedures ORDER BY type_procedure
     ON CONFLICT (name) DO NOTHING`,
  ).catch(() => {})
  app.listen(port, () => {
    console.log(`API server listening on ${port}`)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
