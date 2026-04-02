import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'zoo_secret')
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: 'Сессия истекла или недействительна' })
  }
}

export function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'zoo_admin') {
    return res.status(403).json({ message: 'Доступ только для администратора зоопарка' })
  }
  return next()
}
