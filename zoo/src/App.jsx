import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { VisitorTrendChart, HealthPieChart, VisitorBarChart } from './charts.jsx'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const apiBase = apiUrl.replace(/\/api\/?$/, '')

function animalEmojiByText(text) {
  const t = String(text || '').toLowerCase()
  if (t.includes('горилл') || t.includes('gorilla')) return '🦍'
  if (t.includes('лев') || t.includes('lion')) return '🦁'
  if (t.includes('тигр') || t.includes('tiger')) return '🐯'
  if (t.includes('слон') || t.includes('elephant')) return '🐘'
  if (t.includes('жираф') || t.includes('giraffe')) return '🦒'
  if (t.includes('зебр') || t.includes('zebra')) return '🦓'
  if (t.includes('обезь') || t.includes('monkey')) return '🐒'
  if (t.includes('медвед') || t.includes('bear')) return '🐻'
  if (t.includes('волк') || t.includes('wolf')) return '🐺'
  if (t.includes('лиса') || t.includes('fox')) return '🦊'
  if (t.includes('пингв') || t.includes('penguin')) return '🐧'
  if (t.includes('фламин') || t.includes('flamingo')) return '🦩'
  if (t.includes('крокод') || t.includes('crocodile')) return '🐊'
  if (t.includes('черепах') || t.includes('turtle')) return '🐢'
  if (t.includes('зме') || t.includes('snake')) return '🐍'
  if (t.includes('рыб') || t.includes('fish')) return '🐟'
  return '🐾'
}

function animalPlaceholderSrc(animal) {
  const label = animal?.species || animal?.name || 'Животное'
  const emoji = animalEmojiByText(`${animal?.species || ''} ${animal?.name || ''}`)
  const short = String(label).slice(0, 16)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">
  <rect width="64" height="48" rx="7" fill="#e8f5e9"/>
  <text x="50%" y="44%" dominant-baseline="middle" text-anchor="middle" font-size="20">${emoji}</text>
  <text x="50%" y="84%" dominant-baseline="middle" text-anchor="middle" font-size="7" fill="#2e7d32" font-family="Arial, sans-serif">${short}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const menu = [
  { key: 'dashboard', title: 'Главная' },
  { key: 'animals', title: 'Животные' },
  { key: 'staff', title: 'Персонал' },
  { key: 'procedures', title: 'Процедуры' },
  { key: 'feed', title: 'Склад' },
  { key: 'visitors', title: 'Посещаемость' },
  { key: 'reports', title: 'Отчёты' },
  { key: 'audit', title: 'Аудит' },
  { key: 'profile', title: 'Профиль' },
]

const pageTitles = {
  dashboard: 'Главная панель',
  animals: 'Управление животными',
  staff: 'Управление персоналом',
  procedures: 'Планирование процедур',
  feed: 'Склад кормов и материалов',
  visitors: 'Учёт посещаемости',
  reports: 'Отчёты и аналитика',
  audit: 'Журнал аудита',
  profile: 'Профиль и безопасность',
}

function buildQuery(params) {
  const u = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) u.set(k, String(v))
  })
  const s = u.toString()
  return s ? `?${s}` : ''
}

function workloadBadgeClass(count) {
  const n = Number(count) || 0
  if (n <= 5) return 'load-ok'
  if (n <= 8) return 'load-warn'
  return 'load-bad'
}

function workloadLabel(count) {
  const n = Number(count) || 0
  if (n <= 5) return 'норма'
  if (n <= 8) return 'повышенная'
  return 'критическая'
}

function App() {
  const [login, setLogin] = useState('zoo_admin')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState(() => {
    const raw = localStorage.getItem('zoo_user') || sessionStorage.getItem('zoo_user')
    return raw ? JSON.parse(raw) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem('zoo_token') || sessionStorage.getItem('zoo_token') || '')
  const [activePage, setActivePage] = useState('dashboard')
  const [dashboard, setDashboard] = useState({
    cards: {},
    lastActions: [],
    visitorTrend: [],
    activeTechnicians: [],
    animalHealth: [],
  })
  const [animals, setAnimals] = useState([])
  const [users, setUsers] = useState([])
  const [procedures, setProcedures] = useState([])
  const [feed, setFeed] = useState([])
  const [visitors, setVisitors] = useState([])
  const [assignments, setAssignments] = useState([])
  const [procedureTypes, setProcedureTypes] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [notifications, setNotifications] = useState({ lowStock: [], overdueProcedures: [] })
  const [animalForm, setAnimalForm] = useState({
    name: '',
    species: '',
    birth_date: '',
    temperature: '',
    character: '',
    care_notes: '',
    health_status: 'нормальный',
    image: null,
  })
  const [staffForm, setStaffForm] = useState({
    login: '',
    role: 'technician',
    full_name: '',
    position: '',
    email: '',
    phone: '',
  })
  const [procedureForm, setProcedureForm] = useState({
    animal_id: '',
    type_procedure: '',
    schedule: '',
    interval: 1,
    next_performed: '',
    assigned_technic_id: '',
  })
  const [bulkProcedureForm, setBulkProcedureForm] = useState({
    type_procedure: '',
    schedule: '',
    interval: 1,
    next_performed: '',
    assigned_technic_id: '',
    selectedAnimalIds: [],
  })
  const [feedForm, setFeedForm] = useState({
    name: '',
    unit: 'кг',
    norm_per_procedure: '',
    min_restock: '',
    quantity: '',
    price: '',
    last_restock_date: '',
  })
  const [visitorForm, setVisitorForm] = useState({
    date: '',
    morning_shift: 0,
    evening_shift: 0,
  })
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' })
  const [notice, setNotice] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const adminUsers = useMemo(() => ['zoo_admin', 'petrova'], [])

  const apiFetch = async (url, options = {}) => {
    const headers = options.headers ? { ...options.headers } : {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await fetch(`${apiUrl}${url}`, { ...options, headers })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      if (payload?.message) throw new Error(payload.message)
      if (response.status === 429) throw new Error('Слишком много запросов. Подождите или перезапустите сервер API.')
      throw new Error(`Ошибка ${response.status}: ${response.statusText || 'запроса'}`)
    }
    return response
  }

  const loadAll = async () => {
    const [d, a, s, p, f, v, n, asg, pt, pr] = await Promise.all([
      apiFetch('/dashboard').then((x) => x.json()),
      apiFetch('/animals').then((x) => x.json()),
      apiFetch('/users').then((x) => x.json()),
      apiFetch('/procedures').then((x) => x.json()),
      apiFetch('/feed').then((x) => x.json()),
      apiFetch('/visitors').then((x) => x.json()),
      apiFetch('/notifications').then((x) => x.json()),
      apiFetch('/assignments').then((x) => x.json()).catch(() => []),
      apiFetch('/procedure-types').then((x) => x.json()).catch(() => []),
      apiFetch('/purchase-requests').then((x) => x.json()).catch(() => []),
    ])
    setDashboard(d)
    setAnimals(a)
    setUsers(s)
    setProcedures(p)
    setFeed(f)
    setVisitors(v)
    setNotifications(n)
    setAssignments(asg)
    setProcedureTypes(pt)
    setPurchaseRequests(pr)
  }

  const notify = (text) => {
    setNotice(text)
    setTimeout(() => setNotice(''), 3500)
  }

  useEffect(() => {
    if (!token) return
    loadAll().catch((error) => setAuthError(error.message))
    const timer = setInterval(() => {
      loadAll().catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [token])

  const handleAuth = (event) => {
    event.preventDefault()
    apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    })
      .then((x) => x.json())
      .then((payload) => {
        const storage = rememberMe ? localStorage : sessionStorage
        const other = rememberMe ? sessionStorage : localStorage
        other.removeItem('zoo_token')
        other.removeItem('zoo_user')
        storage.setItem('zoo_token', payload.token)
        storage.setItem('zoo_user', JSON.stringify(payload.user))
        setCurrentUser(payload.user)
        setToken(payload.token)
        setAuthError('')
      })
      .catch((error) => setAuthError(error.message))
  }

  if (!currentUser) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <h1>ZooМенеджер</h1>
          <p>Веб-интерфейс администратора зоопарка</p>
          <form onSubmit={handleAuth} className="auth-form">
            <label>
              <span>Логин</span>
              <select value={login} autoComplete="username" onChange={(e) => setLogin(e.target.value)}>
                {adminUsers.map((userLogin) => (
                  <option key={userLogin} value={userLogin}>
                    {userLogin}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Запомнить меня</span>
            </label>
            <button type="button" className="link-like" onClick={() => globalThis.alert('Для восстановления пароля обратитесь к системному администратору или используйте сброс пароля в разделе «Персонал».')}>
              Забыли пароль?
            </button>
            {authError && <p className="error">{authError}</p>}
            <button type="submit">Войти</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <div className={sidebarOpen ? 'app-shell sidebar-open' : 'app-shell sidebar-closed'}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo-mark" aria-hidden>ZM</div>
          <div>
            <h2>ZooМенеджер</h2>
            <p className="sidebar-sub">Панель администратора</p>
          </div>
        </div>
        <div className="sidebar-user">
          <p className="user-name">{currentUser.full_name}</p>
          <p className="user-meta">Администратор зоопарка</p>
        </div>
        <nav className="sidebar-nav">
          {menu.map((item) => (
            <button
              key={item.key}
              className={item.key === activePage ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActivePage(item.key)}
              type="button"
            >
              <span className="nav-dot" aria-hidden />
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="logout"
            onClick={() => {
              localStorage.removeItem('zoo_token')
              localStorage.removeItem('zoo_user')
              sessionStorage.removeItem('zoo_token')
              sessionStorage.removeItem('zoo_user')
              setToken('')
              setCurrentUser(null)
            }}
          >
            Выйти из системы
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-top">
          <div className="content-head">
            <button
              type="button"
              className="menu-toggle"
              aria-label={sidebarOpen ? 'Свернуть меню' : 'Открыть меню'}
              onClick={() => setSidebarOpen((x) => !x)}
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
            <h1 className="page-title">{pageTitles[activePage]}</h1>
            <p className="page-sub">Информационная система «ЗооМенеджер»</p>
          </div>
          <NotificationCenter
            notifications={notifications}
            open={notificationsOpen}
            onToggle={() => setNotificationsOpen((o) => !o)}
            onClose={() => setNotificationsOpen(false)}
          />
        </header>
        {notice && <div className="toast success" role="status">{notice}</div>}
        {activePage === 'dashboard' && <Dashboard dashboard={dashboard} />}
        {activePage === 'animals' && (
          <AnimalsPage animals={animals} animalForm={animalForm} setAnimalForm={setAnimalForm} apiFetch={apiFetch} onSaved={loadAll} notify={notify} />
        )}
        {activePage === 'staff' && (
          <StaffPage users={users} animals={animals} procedures={procedures} assignments={assignments} staffForm={staffForm} setStaffForm={setStaffForm} apiFetch={apiFetch} onSaved={loadAll} notify={notify} />
        )}
        {activePage === 'procedures' && (
          <ProceduresPage
            procedures={procedures}
            animals={animals}
            users={users}
            procedureTypes={procedureTypes}
            procedureForm={procedureForm}
            setProcedureForm={setProcedureForm}
            bulkForm={bulkProcedureForm}
            setBulkForm={setBulkProcedureForm}
            apiFetch={apiFetch}
            onSaved={loadAll}
            notify={notify}
          />
        )}
        {activePage === 'feed' && (
          <FeedPage feed={feed} feedForm={feedForm} setFeedForm={setFeedForm} purchaseRequests={purchaseRequests} notifications={notifications} apiFetch={apiFetch} onSaved={loadAll} notify={notify} />
        )}
        {activePage === 'visitors' && (
          <VisitorsPage visitors={visitors} visitorForm={visitorForm} setVisitorForm={setVisitorForm} apiFetch={apiFetch} onSaved={loadAll} notify={notify} />
        )}
        {activePage === 'reports' && (
          <ReportsPage apiFetch={apiFetch} notify={notify} users={users} visitors={visitors} animals={animals} feed={feed} procedures={procedures} />
        )}
        {activePage === 'audit' && <AuditPage apiFetch={apiFetch} users={users} />}
        {activePage === 'profile' && (
          <ProfilePage passwordForm={passwordForm} setPasswordForm={setPasswordForm} apiFetch={apiFetch} notify={notify} />
        )}
        <footer className="content-footer">
          <div className="footer-col">
            <h4>ZooМенеджер</h4>
            <p>Информационная система управления зоопарком</p>
            <p>© {new Date().getFullYear()} Все права защищены</p>
          </div>
          <div className="footer-col">
            <h4>Контакты</h4>
            <p>Телефон: +7 (900) 123-45-67</p>
            <p>Email: info@zoomanager.local</p>
            <p>Адрес: г. Москва, ул. Примерная, 10</p>
          </div>
          <div className="footer-col">
            <h4>Режим работы</h4>
            <p>Пн-Пт: 09:00-18:00</p>
            <p>Сб: 10:00-16:00</p>
            <p>Вс: выходной</p>
          </div>
        </footer>
      </main>
    </div>
  )
}

function NotificationCenter({ notifications, open, onToggle, onClose }) {
  const low = notifications.lowStock || []
  const overdue = notifications.overdueProcedures || []
  const total = low.length + overdue.length
  return (
    <div className="notif-wrap">
      <button type="button" className="notif-bell" onClick={onToggle} aria-expanded={open} aria-label="Уведомления">
        <svg className="notif-bell-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
        </svg>
        {total > 0 && <span className="notif-badge">{total}</span>}
      </button>
      {open && (
        <>
          <button type="button" className="notif-backdrop" aria-label="Закрыть" onClick={onClose} />
          <div className="notif-panel" role="dialog" aria-label="Центр уведомлений">
            <div className="notif-head">
              <strong>Уведомления</strong>
              <button type="button" className="notif-close" onClick={onClose}>×</button>
            </div>
            <div className="notif-section">
              <h4>Склад: низкий остаток</h4>
              {low.length === 0 ? <p className="notif-empty">Все в норме</p> : (
                <ul className="notif-list">
                  {low.map((item, i) => (
                    <li key={`${item.name}-${i}`} className="notif-item warn">
                      <span>{item.name}</span>
                      <span className="notif-meta">{item.quantity} / мин. {item.min_restock}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="notif-section">
              <h4>Процедуры: просрочено</h4>
              {overdue.length === 0 ? <p className="notif-empty">Нет просрочек</p> : (
                <ul className="notif-list">
                  {overdue.map((item) => (
                    <li key={item.procedure_id} className="notif-item danger">
                      <span>{item.animal_name} — {item.type_procedure}</span>
                      <span className="notif-meta">{new Date(item.next_performed).toLocaleString('ru-RU')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

NotificationCenter.propTypes = {
  notifications: PropTypes.shape({
    lowStock: PropTypes.array,
    overdueProcedures: PropTypes.array,
  }).isRequired,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

function Dashboard({ dashboard }) {
  const techs = dashboard.activeTechnicians || []
  const health = dashboard.animalHealth || []
  const trend = dashboard.visitorTrend || []
  return (
    <section className="page-section">
      <div className="cards">
        <article className="card card-accent"><h3>Всего животных</h3><p>{dashboard.cards.animals || 0}</p></article>
        <article className="card"><h3>Предстоящие процедуры</h3><p>{dashboard.cards.procedures || 0}</p></article>
        <article className="card"><h3>Сотрудников в системе</h3><p>{dashboard.cards.users || 0}</p></article>
        <article className="card card-warn"><h3>Низкий запас корма</h3><p>{dashboard.cards.lowFeed || 0}</p><span className="card-hint">позиций ≤ мин. остатка</span></article>
      </div>
      <div className="charts-grid">
        {trend.length > 0 ? <VisitorTrendChart data={trend} /> : <div className="chart-card"><p className="muted">Нет данных посещаемости за неделю</p></div>}
        {health.length > 0 ? <HealthPieChart data={health} /> : <div className="chart-card"><p className="muted">Нет данных по животным</p></div>}
      </div>
      <div className="panel">
        <h3>Активные техники</h3>
        <p className="panel-hint">Загрузка: зелёный ≤5 животных, жёлтый 6–8, красный ≥9 (по схеме ТЗ)</p>
        <ul className="tech-list">
          {techs.length === 0 ? <li className="muted">Нет активных техников</li> : techs.map((t) => (
            <li key={t.user_id} className="tech-row">
              <span>{t.full_name}</span>
              <span className={`load-pill ${workloadBadgeClass(t.assigned_count)}`}>
                {t.assigned_count} задач — {workloadLabel(t.assigned_count)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <h2 className="block-title">Последние действия</h2>
      <Table
        headers={['Пользователь', 'Действие', 'Время', 'IP']}
        rows={dashboard.lastActions.map((item) => [item.login || '-', item.action, new Date(item.timestamp).toLocaleString('ru-RU'), item.ip_address || '-'])}
      />
    </section>
  )
}

function AnimalsPage({ animals, animalForm, setAnimalForm, apiFetch, onSaved, notify }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [creatingAnimal, setCreatingAnimal] = useState(false)
  const [dedupingAnimals, setDedupingAnimals] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [editImage, setEditImage] = useState(null)
  const [historyFor, setHistoryFor] = useState(null)
  const [historyRows, setHistoryRows] = useState([])

  const filtered = useMemo(() => {
    let list = animals
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q) || (a.species || '').toLowerCase().includes(q))
    }
    if (statusFilter) list = list.filter((a) => a.health_status === statusFilter)
    return list
  }, [animals, search, statusFilter])

  const submitAnimal = async (event) => {
    event.preventDefault()
    if (creatingAnimal) return
    setCreatingAnimal(true)
    try {
      const formData = new FormData()
      Object.entries(animalForm).forEach(([key, value]) => {
        if (value) formData.append(key, value)
      })
      await apiFetch('/animals', { method: 'POST', body: formData })
      setAnimalForm({
        name: '',
        species: '',
        birth_date: '',
        temperature: '',
        character: '',
        care_notes: '',
        health_status: 'нормальный',
        image: null,
      })
      await onSaved()
      notify('Животное добавлено')
    } catch (error) {
      notify(error.message || 'Не удалось добавить животное')
    } finally {
      setCreatingAnimal(false)
    }
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    if (!editRow) return
    try {
      const formData = new FormData()
      formData.append('name', editRow.name || '')
      formData.append('species', editRow.species || '')
      formData.append('birth_date', editRow.birth_date?.slice(0, 10) || '')
      formData.append('temperature', String(editRow.temperature ?? ''))
      formData.append('character', editRow.character || '')
      formData.append('care_notes', editRow.care_notes || '')
      formData.append('health_status', editRow.health_status || 'нормальный')
      if (editImage) formData.append('image', editImage)
      await apiFetch(`/animals/${editRow.animal_id}`, {
        method: 'PATCH',
        body: formData,
      })
      setEditRow(null)
      setEditImage(null)
      await onSaved()
      notify('Карточка обновлена')
    } catch (error) {
      notify(error.message || 'Не удалось сохранить изменения')
    }
  }

  const openHistory = async (id) => {
    setHistoryFor(id)
    const rows = await apiFetch(`/animals/${id}/history`).then((r) => r.json())
    setHistoryRows(rows)
  }

  const removeAnimal = async (id) => {
    if (!globalThis.confirm('Удалить животное?')) return
    await apiFetch(`/animals/${id}`, { method: 'DELETE' })
    await onSaved()
    notify('Животное удалено')
  }

  const removeDuplicates = async () => {
    if (dedupingAnimals) return
    if (!globalThis.confirm('Удалить дубли животных (по имени, виду и дате рождения)?')) return
    setDedupingAnimals(true)
    try {
      const payload = await apiFetch('/animals/deduplicate', { method: 'POST' }).then((r) => r.json())
      await onSaved()
      notify(`Удалено дублей: ${payload.removed || 0}`)
    } catch (error) {
      notify(error.message || 'Не удалось удалить дубли')
    } finally {
      setDedupingAnimals(false)
    }
  }

  return (
    <section className="page-section">
      <div className="toolbar">
        <input className="search-input" placeholder="Поиск по кличке или виду" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Все статусы здоровья</option>
          {[...new Set(animals.map((a) => a.health_status))].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="btn-secondary" onClick={removeDuplicates} disabled={dedupingAnimals}>
          {dedupingAnimals ? 'Удаление...' : 'Убрать дубли'}
        </button>
      </div>
      <h3 className="section-title">Новая карточка</h3>
      <form className="inline-form" onSubmit={submitAnimal}>
        <input placeholder="Кличка*" value={animalForm.name} onChange={(e) => setAnimalForm({ ...animalForm, name: e.target.value })} required />
        <input placeholder="Вид*" value={animalForm.species} onChange={(e) => setAnimalForm({ ...animalForm, species: e.target.value })} required />
        <input type="date" value={animalForm.birth_date} onChange={(e) => setAnimalForm({ ...animalForm, birth_date: e.target.value })} required />
        <input placeholder="Температура*" value={animalForm.temperature} onChange={(e) => setAnimalForm({ ...animalForm, temperature: e.target.value })} required />
        <input placeholder="Характер" value={animalForm.character} onChange={(e) => setAnimalForm({ ...animalForm, character: e.target.value })} />
        <input placeholder="Особенности ухода" value={animalForm.care_notes} onChange={(e) => setAnimalForm({ ...animalForm, care_notes: e.target.value })} />
        <select value={animalForm.health_status} onChange={(e) => setAnimalForm({ ...animalForm, health_status: e.target.value })}>
          <option value="нормальный">нормальный</option>
          <option value="под наблюдением">под наблюдением</option>
          <option value="критический">критический</option>
        </select>
        <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setAnimalForm({ ...animalForm, image: e.target.files?.[0] || null })} />
        <button type="submit" disabled={creatingAnimal}>{creatingAnimal ? 'Добавление...' : 'Добавить'}</button>
      </form>
      <Table
        headers={['Фото', 'ID', 'Имя', 'Вид', 'Температура', 'Характер', 'Статус', 'Действия']}
        rows={filtered.map((item) => [
          <img key={`image-${item.animal_id}`} className="animal-photo" src={item.image_path ? `${apiBase}${item.image_path}` : animalPlaceholderSrc(item)} alt={`Фото: ${item.name}`} />,
          item.animal_id,
          item.name,
          item.species,
          item.temperature,
          item.character,
          item.health_status,
          <div key={`act-${item.animal_id}`} className="cell-actions">
            <button type="button" className="btn-secondary" onClick={() => { setEditRow({ ...item }); setEditImage(null) }}>Изменить</button>
            <button type="button" className="btn-secondary" onClick={() => openHistory(item.animal_id)}>История процедур</button>
            <button type="button" className="btn-danger" onClick={() => removeAnimal(item.animal_id)}>Удалить</button>
          </div>,
        ])}
      />
      {editRow && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setEditRow(null); setEditImage(null) }}>
          <div className="modal" role="dialog" aria-labelledby="edit-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-title">Редактирование: {editRow.name}</h3>
            <form className="modal-form" onSubmit={saveEdit}>
              <label>Кличка<input value={editRow.name} onChange={(e) => setEditRow({ ...editRow, name: e.target.value })} required /></label>
              <label>Вид<input value={editRow.species} onChange={(e) => setEditRow({ ...editRow, species: e.target.value })} required /></label>
              <label>Дата рождения<input type="date" value={editRow.birth_date?.slice(0, 10) || ''} onChange={(e) => setEditRow({ ...editRow, birth_date: e.target.value })} /></label>
              <label>Температура<input value={editRow.temperature} onChange={(e) => setEditRow({ ...editRow, temperature: e.target.value })} required /></label>
              <label>Характер<input value={editRow.character || ''} onChange={(e) => setEditRow({ ...editRow, character: e.target.value })} /></label>
              <label>Уход<textarea rows={3} value={editRow.care_notes || ''} onChange={(e) => setEditRow({ ...editRow, care_notes: e.target.value })} /></label>
              <label>Статус здоровья
                <select value={editRow.health_status} onChange={(e) => setEditRow({ ...editRow, health_status: e.target.value })}>
                  <option value="нормальный">нормальный</option>
                  <option value="под наблюдением">под наблюдением</option>
                  <option value="критический">критический</option>
                </select>
              </label>
              <label>Фото
                <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setEditImage(e.target.files?.[0] || null)} />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setEditRow(null); setEditImage(null) }}>Отмена</button>
                <button type="submit">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {historyFor && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setHistoryFor(null); setHistoryRows([]) }}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>История процедур (животное ID {historyFor})</h3>
            <Table
              headers={['Тип', 'Расписание', 'Интервал', 'Последнее', 'Следующее', 'Техник']}
              rows={historyRows.map((h) => [
                h.type_procedure,
                h.schedule,
                h.interval,
                h.last_performed ? new Date(h.last_performed).toLocaleString('ru-RU') : '—',
                new Date(h.next_performed).toLocaleString('ru-RU'),
                h.technician_name || '—',
              ])}
            />
            <button type="button" className="btn-secondary" onClick={() => { setHistoryFor(null); setHistoryRows([]) }}>Закрыть</button>
          </div>
        </div>
      )}
    </section>
  )
}

function StaffPage({ users, animals, procedures, assignments, staffForm, setStaffForm, apiFetch, onSaved, notify }) {
  const [assignTech, setAssignTech] = useState('')
  const [assignAnimal, setAssignAnimal] = useState('')

  const workloadMap = useMemo(() => {
    const m = {}
    procedures.forEach((p) => {
      if (p.assigned_technic_id) {
        m[p.assigned_technic_id] = (m[p.assigned_technic_id] || 0) + 1
      }
    })
    return m
  }, [procedures])

  const assignAnimalToTech = async (event) => {
    event.preventDefault()
    if (!assignTech || !assignAnimal) return
    await apiFetch('/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ technician_id: Number(assignTech), animal_id: Number(assignAnimal) }),
    })
    setAssignAnimal('')
    await onSaved()
    notify('Животное назначено технику')
  }

  const revokeAssignment = async (technicianId, animalId) => {
    await apiFetch(`/assignments/${technicianId}/${animalId}`, { method: 'DELETE' })
    await onSaved()
    notify('Назначение отозвано')
  }

  const createUser = async (event) => {
    event.preventDefault()
    const response = await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staffForm),
    }).then((x) => x.json())
    notify(`Пользователь создан, временный пароль: ${response.tempPassword}`)
    setStaffForm({ login: '', role: 'technician', full_name: '', position: '', email: '', phone: '' })
    await onSaved()
  }

  const toggleUser = async (userId, active) => {
    await apiFetch(`/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    })
    await onSaved()
  }

  const resetUserPassword = async (userId) => {
    const payload = await apiFetch(`/users/${userId}/reset-password`, { method: 'POST' }).then((x) => x.json())
    notify(`Новый временный пароль: ${payload.tempPassword}`)
  }

  return (
    <section className="page-section">
      <h3 className="section-title">Назначение животных техникам</h3>
      <form className="inline-form" onSubmit={assignAnimalToTech}>
        <select value={assignTech} onChange={(e) => setAssignTech(e.target.value)} required>
          <option value="">Техник</option>
          {users.filter((u) => u.role === 'technician' && u.is_active).map((u) => (
            <option key={u.user_id} value={u.user_id}>{u.full_name}</option>
          ))}
        </select>
        <select value={assignAnimal} onChange={(e) => setAssignAnimal(e.target.value)} required>
          <option value="">Животное</option>
          {animals.map((a) => <option key={a.animal_id} value={a.animal_id}>{a.name}</option>)}
        </select>
        <button type="submit">Назначить</button>
      </form>
      <Table
        headers={['Техник', 'Животное', 'Дата назначения', 'Действие']}
        rows={(assignments || []).map((row) => [
          row.technician_name,
          row.animal_name,
          row.assigned_at ? new Date(row.assigned_at).toLocaleString('ru-RU') : '—',
          <button key={`rv-${row.technician_id}-${row.animal_id}`} type="button" className="btn-danger" onClick={() => revokeAssignment(row.technician_id, row.animal_id)}>Отозвать</button>,
        ])}
      />
      <h3 className="section-title">Учётные записи</h3>
      <form className="inline-form" onSubmit={createUser}>
        <input placeholder="Логин*" value={staffForm.login} onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })} required />
        <input placeholder="ФИО*" value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} required />
        <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
          <option value="technician">technician</option>
          <option value="zoo_admin">zoo_admin</option>
        </select>
        <input placeholder="Должность" value={staffForm.position} onChange={(e) => setStaffForm({ ...staffForm, position: e.target.value })} />
        <input placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
        <input placeholder="Телефон" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
        <button type="submit">Добавить пользователя</button>
      </form>
      <Table
        headers={['ID', 'ФИО', 'Логин', 'Должность', 'Роль', 'Загрузка', 'Активен', 'Последний вход', 'Действия']}
        rows={users.map((item) => {
          const cnt = item.role === 'technician' ? (workloadMap[item.user_id] || 0) : '—'
          const loadUi = item.role === 'technician' ? (
            <span className={`load-pill sm ${workloadBadgeClass(cnt)}`}>{cnt} задач</span>
          ) : '—'
          return [
          item.user_id,
          item.full_name,
          item.login,
          item.position,
          item.role,
          loadUi,
          item.is_active ? 'Да' : 'Нет',
          item.last_login ? new Date(item.last_login).toLocaleString('ru-RU') : '-',
          <div key={`a-${item.user_id}`} className="cell-actions">
            <button type="button" onClick={() => toggleUser(item.user_id, item.is_active)}>{item.is_active ? 'Отключить' : 'Включить'}</button>
            <button type="button" onClick={() => resetUserPassword(item.user_id)}>Сброс пароля</button>
          </div>,
          ]
        })}
      />
    </section>
  )
}

function ProceduresPage({
  procedures,
  animals,
  users,
  procedureTypes,
  procedureForm,
  setProcedureForm,
  bulkForm,
  setBulkForm,
  apiFetch,
  onSaved,
  notify,
}) {
  const [typeName, setTypeName] = useState('')
  const [typeInterval, setTypeInterval] = useState(1)

  const addType = async (event) => {
    event.preventDefault()
    await apiFetch('/procedure-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: typeName, default_interval_days: typeInterval }),
    })
    setTypeName('')
    await onSaved()
    notify('Тип процедуры добавлен')
  }

  const toggleAnimalBulk = (id) => {
    const set = new Set(bulkForm.selectedAnimalIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setBulkForm({ ...bulkForm, selectedAnimalIds: [...set] })
  }

  const submitBulk = async (event) => {
    event.preventDefault()
    if (bulkForm.selectedAnimalIds.length === 0) {
      notify('Отметьте хотя бы одно животное')
      return
    }
    await apiFetch('/procedures/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animal_ids: bulkForm.selectedAnimalIds,
        type_procedure: bulkForm.type_procedure,
        schedule: bulkForm.schedule,
        interval: bulkForm.interval,
        next_performed: bulkForm.next_performed,
        assigned_technic_id: bulkForm.assigned_technic_id || null,
      }),
    })
    setBulkForm({ ...bulkForm, selectedAnimalIds: [] })
    await onSaved()
    notify('Массовое назначение выполнено')
  }

  const createProcedure = async (event) => {
    event.preventDefault()
    const payload = {
      animal_id: procedureForm.animal_id,
      type_procedure: procedureForm.type_procedure,
      schedule: procedureForm.schedule,
      interval: procedureForm.interval,
      next_performed: procedureForm.next_performed,
      assigned_technic_id: procedureForm.assigned_technic_id || null,
    }
    await apiFetch('/procedures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await onSaved()
    notify('Процедура создана')
  }

  const deleteProcedure = async (id) => {
    await apiFetch(`/procedures/${id}`, { method: 'DELETE' })
    await onSaved()
    notify('Процедура удалена')
  }

  const applyTypePreset = (name) => {
    const t = procedureTypes.find((x) => x.name === name)
    setProcedureForm({
      ...procedureForm,
      type_procedure: name,
      interval: t ? t.default_interval_days : procedureForm.interval,
    })
  }

  return (
    <section className="page-section">
      <h3 className="section-title">Справочник типов процедур</h3>
      <div className="two-col">
        <Table
          headers={['Тип', 'Периодичность (дн.)']}
          rows={procedureTypes.map((t) => [t.name, t.default_interval_days])}
        />
        <form className="stack-form" onSubmit={addType}>
          <label>Новый тип<input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Например: Кормление" required /></label>
          <label>Интервал по умолчанию (дней)<input type="number" min="1" value={typeInterval} onChange={(e) => setTypeInterval(Number(e.target.value))} /></label>
          <button type="submit">Добавить тип</button>
        </form>
      </div>

      <h3 className="section-title">Массовое назначение</h3>
      <p className="muted small">Отметьте животных и задайте общие параметры процедуры.</p>
      <form onSubmit={submitBulk}>
        <div className="animal-check-grid">
          {animals.map((a) => (
            <label key={a.animal_id} className="check-tile">
              <input
                type="checkbox"
                checked={bulkForm.selectedAnimalIds.includes(a.animal_id)}
                onChange={() => toggleAnimalBulk(a.animal_id)}
              />
              <span>{a.name}</span>
            </label>
          ))}
        </div>
        <div className="inline-form" style={{ marginTop: 12 }}>
          <select value={bulkForm.type_procedure} onChange={(e) => setBulkForm({ ...bulkForm, type_procedure: e.target.value })} required>
            <option value="">Тип процедуры</option>
            {procedureTypes.map((t) => <option key={t.type_id} value={t.name}>{t.name}</option>)}
          </select>
          <input placeholder="Расписание" value={bulkForm.schedule} onChange={(e) => setBulkForm({ ...bulkForm, schedule: e.target.value })} required />
          <input type="number" min="1" value={bulkForm.interval} onChange={(e) => setBulkForm({ ...bulkForm, interval: Number(e.target.value) })} />
          <input type="datetime-local" value={bulkForm.next_performed} onChange={(e) => setBulkForm({ ...bulkForm, next_performed: e.target.value })} required />
          <select
            value={bulkForm.assigned_technic_id === '' ? '' : String(bulkForm.assigned_technic_id)}
            onChange={(e) => setBulkForm({ ...bulkForm, assigned_technic_id: e.target.value ? Number(e.target.value) : '' })}
          >
            <option value="">Техник</option>
            {users.filter((u) => u.role === 'technician').map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
          </select>
          <button type="submit">Назначить выбранным</button>
        </div>
      </form>

      <h3 className="section-title">Индивидуальное назначение</h3>
      <form className="inline-form" onSubmit={createProcedure}>
        <select value={procedureForm.animal_id} onChange={(e) => setProcedureForm({ ...procedureForm, animal_id: Number(e.target.value) })} required>
          <option value="">Животное</option>
          {animals.map((a) => <option key={a.animal_id} value={a.animal_id}>{a.name}</option>)}
        </select>
        <select value={procedureForm.type_procedure} onChange={(e) => applyTypePreset(e.target.value)} required>
          <option value="">Тип процедуры</option>
          {procedureTypes.map((t) => <option key={t.type_id} value={t.name}>{t.name}</option>)}
        </select>
        <input placeholder="Расписание" value={procedureForm.schedule} onChange={(e) => setProcedureForm({ ...procedureForm, schedule: e.target.value })} required />
        <input type="number" min="1" value={procedureForm.interval} onChange={(e) => setProcedureForm({ ...procedureForm, interval: Number(e.target.value) })} required />
        <input type="datetime-local" value={procedureForm.next_performed} onChange={(e) => setProcedureForm({ ...procedureForm, next_performed: e.target.value })} required />
        <select
          value={procedureForm.assigned_technic_id === '' ? '' : String(procedureForm.assigned_technic_id)}
          onChange={(e) => setProcedureForm({ ...procedureForm, assigned_technic_id: e.target.value ? Number(e.target.value) : '' })}
        >
          <option value="">Техник</option>
          {users.filter((u) => u.role === 'technician').map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
        </select>
        <button type="submit">Создать</button>
      </form>

      <h3 className="section-title">Все назначения</h3>
      <Table
        headers={['ID', 'Животное', 'Процедура', 'Расписание', 'Интервал', 'Назначен', 'Следующее', '']}
        rows={procedures.map((item) => [
          item.procedure_id,
          item.animal_name,
          item.type_procedure,
          item.schedule,
          item.interval,
          item.technician_name || '—',
          new Date(item.next_performed).toLocaleString('ru-RU'),
          <button key={`pd-${item.procedure_id}`} type="button" className="btn-danger" onClick={() => deleteProcedure(item.procedure_id)}>Удалить</button>,
        ])}
      />
    </section>
  )
}

function FeedPage({ feed, feedForm, setFeedForm, purchaseRequests, notifications, apiFetch, onSaved, notify }) {
  const [tab, setTab] = useState('directory')
  const [prForm, setPrForm] = useState({ feed_id: '', amount: '', note: '' })

  const createFeed = async (event) => {
    event.preventDefault()
    await apiFetch('/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedForm),
    })
    await onSaved()
    notify('Корм добавлен в справочник')
  }

  const restock = async (id) => {
    const amount = globalThis.prompt('Количество пополнения', '10')
    if (!amount) return
    await apiFetch(`/feed/${id}/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount) }),
    })
    await onSaved()
    notify('Остаток обновлён')
  }

  const submitPurchase = async (event) => {
    event.preventDefault()
    await apiFetch('/purchase-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feed_id: Number(prForm.feed_id),
        amount: Number(prForm.amount),
        note: prForm.note,
      }),
    })
    setPrForm({ feed_id: '', amount: '', note: '' })
    await onSaved()
    notify('Заявка на закупку создана')
  }

  const setPurchaseStatus = async (id, status) => {
    await apiFetch(`/purchase-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await onSaved()
  }

  const low = notifications.lowStock || []

  return (
    <section className="page-section">
      <div className="tabs">
        <button type="button" className={tab === 'directory' ? 'tab active' : 'tab'} onClick={() => setTab('directory')}>Справочник кормов</button>
        <button type="button" className={tab === 'alerts' ? 'tab active' : 'tab'} onClick={() => setTab('alerts')}>Низкий остаток</button>
        <button type="button" className={tab === 'requests' ? 'tab active' : 'tab'} onClick={() => setTab('requests')}>Заявки на закупку</button>
      </div>
      {tab === 'directory' && (
        <>
          <form className="inline-form" onSubmit={createFeed}>
            <input placeholder="Название*" value={feedForm.name} onChange={(e) => setFeedForm({ ...feedForm, name: e.target.value })} required />
            <input placeholder="Ед." value={feedForm.unit} onChange={(e) => setFeedForm({ ...feedForm, unit: e.target.value })} required />
            <input placeholder="Норма*" type="number" step="0.01" value={feedForm.norm_per_procedure} onChange={(e) => setFeedForm({ ...feedForm, norm_per_procedure: e.target.value })} required />
            <input placeholder="Мин. остаток*" type="number" step="0.01" value={feedForm.min_restock} onChange={(e) => setFeedForm({ ...feedForm, min_restock: e.target.value })} required />
            <input placeholder="Количество*" type="number" step="0.01" value={feedForm.quantity} onChange={(e) => setFeedForm({ ...feedForm, quantity: e.target.value })} required />
            <input placeholder="Цена*" type="number" step="0.01" value={feedForm.price} onChange={(e) => setFeedForm({ ...feedForm, price: e.target.value })} required />
            <input type="date" value={feedForm.last_restock_date} onChange={(e) => setFeedForm({ ...feedForm, last_restock_date: e.target.value })} required />
            <button type="submit">Добавить позицию</button>
          </form>
          <Table
            headers={['ID', 'Название', 'Ед.', 'Количество', 'Мин.', 'Цена', 'Статус', '']}
            rows={feed.map((item) => [
              item.feed_id,
              item.name,
              item.unit,
              item.quantity,
              item.min_restock,
              `${item.price} ₽`,
              item.status,
              <button key={`fr-${item.feed_id}`} type="button" className="btn-secondary" onClick={() => restock(item.feed_id)}>Пополнить</button>,
            ])}
          />
        </>
      )}
      {tab === 'alerts' && (
        <div className="panel">
          <p className="small muted">Позиции, где остаток не выше минимального порога.</p>
          <Table
            headers={['Корм', 'Остаток', 'Мин. порог']}
            rows={low.map((item) => [item.name, item.quantity, item.min_restock])}
          />
          {low.length === 0 && <p className="text-muted">Нет критических позиций</p>}
        </div>
      )}
      {tab === 'requests' && (
        <>
          <form className="inline-form" onSubmit={submitPurchase}>
            <select value={prForm.feed_id} onChange={(e) => setPrForm({ ...prForm, feed_id: e.target.value })} required>
              <option value="">Корм</option>
              {feed.map((f) => <option key={f.feed_id} value={f.feed_id}>{f.name}</option>)}
            </select>
            <input type="number" step="0.01" placeholder="Количество*" value={prForm.amount} onChange={(e) => setPrForm({ ...prForm, amount: e.target.value })} required />
            <input placeholder="Комментарий" value={prForm.note} onChange={(e) => setPrForm({ ...prForm, note: e.target.value })} />
            <button type="submit">Создать заявку</button>
          </form>
          <Table
            headers={['ID', 'Корм', 'Кол-во', 'Статус', 'Дата', 'Автор', '']}
            rows={(purchaseRequests || []).map((r) => [
              r.request_id,
              r.feed_name,
              r.amount,
              r.status,
              r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : '—',
              r.created_by_login || '—',
              r.status === 'new' ? (
                <span key={`st-${r.request_id}`} className="cell-actions">
                  <button type="button" className="btn-secondary" onClick={() => setPurchaseStatus(r.request_id, 'approved')}>В работу</button>
                  <button type="button" className="btn-secondary" onClick={() => setPurchaseStatus(r.request_id, 'done')}>Закрыть</button>
                </span>
              ) : '—',
            ])}
          />
        </>
      )}
    </section>
  )
}

function VisitorsPage({ visitors, visitorForm, setVisitorForm, apiFetch, onSaved, notify }) {
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [periodRows, setPeriodRows] = useState(null)

  const displayRows = periodRows !== null ? periodRows : visitors

  const periodSummary = useMemo(() => {
    let morning = 0
    let evening = 0
    let total = 0
    displayRows.forEach((row) => {
      morning += Number(row.morning_shift) || 0
      evening += Number(row.evening_shift) || 0
      total += Number(row.total) || 0
    })
    return { days: displayRows.length, morning, evening, total }
  }, [displayRows])

  const saveVisitors = async (event) => {
    event.preventDefault()
    await apiFetch('/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitorForm),
    })
    await onSaved()
    if (periodRows !== null && periodFrom && periodTo) {
      const r = await apiFetch(`/visitors${buildQuery({ from: periodFrom, to: periodTo })}`)
      setPeriodRows(await r.json())
    }
    notify('Посещаемость сохранена')
  }

  const deleteVisitors = async (id) => {
    await apiFetch(`/visitors/${id}`, { method: 'DELETE' })
    await onSaved()
    if (periodRows !== null && periodFrom && periodTo) {
      const r = await apiFetch(`/visitors${buildQuery({ from: periodFrom, to: periodTo })}`)
      setPeriodRows(await r.json())
    }
    notify('Запись удалена')
  }

  const applyPeriod = async () => {
    if (!periodFrom || !periodTo) {
      notify('Укажите дату начала и конца периода')
      return
    }
    const r = await apiFetch(`/visitors${buildQuery({ from: periodFrom, to: periodTo })}`)
    setPeriodRows(await r.json())
    notify('Данные за период загружены')
  }

  const resetPeriod = () => {
    setPeriodFrom('')
    setPeriodTo('')
    setPeriodRows(null)
  }

  return (
    <section className="page-section">
      <div className="panel">
        <h3>Отчёт по периоду</h3>
        <p className="small muted">Выберите интервал и нажмите «Показать» — таблица и график отфильтруются. «Все записи» возвращает последние данные из общего списка.</p>
        <div className="inline-form toolbar">
          <label className="inline-label">
            <span>С</span>
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </label>
          <label className="inline-label">
            <span>По</span>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </label>
          <button type="button" onClick={applyPeriod}>Показать</button>
          <button type="button" className="btn-secondary" onClick={resetPeriod}>Все записи</button>
        </div>
        <ul className="summary-list period-summary">
          <li>Дней в выборке: <strong>{periodSummary.days}</strong></li>
          <li>Утро, чел.: <strong>{periodSummary.morning}</strong></li>
          <li>Вечер, чел.: <strong>{periodSummary.evening}</strong></li>
          <li>Итого по строкам: <strong>{periodSummary.total}</strong></li>
        </ul>
      </div>
      {displayRows.length > 0 && <VisitorBarChart data={displayRows} title="Посещаемость по дням (утро / вечер)" />}
      <form className="inline-form" onSubmit={saveVisitors}>
        <input type="date" value={visitorForm.date} onChange={(e) => setVisitorForm({ ...visitorForm, date: e.target.value })} required />
        <input type="number" placeholder="Утро" value={visitorForm.morning_shift} onChange={(e) => setVisitorForm({ ...visitorForm, morning_shift: Number(e.target.value) })} required />
        <input type="number" placeholder="Вечер" value={visitorForm.evening_shift} onChange={(e) => setVisitorForm({ ...visitorForm, evening_shift: Number(e.target.value) })} required />
        <button type="submit">Сохранить день</button>
      </form>
      <Table
        headers={['Дата', 'Утро', 'Вечер', 'Итого', '']}
        rows={displayRows.map((item) => [
          new Date(item.date).toLocaleDateString('ru-RU'),
          item.morning_shift,
          item.evening_shift,
          item.total,
          <button key={`vd-${item.visitors_id}`} type="button" className="btn-secondary" onClick={() => deleteVisitors(item.visitors_id)}>Удалить</button>,
        ])}
      />
    </section>
  )
}

function ReportsPage({ apiFetch, notify, users, visitors, animals, feed, procedures }) {
  const [reportType, setReportType] = useState('visitors')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [auditUserId, setAuditUserId] = useState('')
  const [exporting, setExporting] = useState(false)

  const speciesStats = useMemo(() => {
    const m = {}
    animals.forEach((a) => {
      m[a.species] = (m[a.species] || 0) + 1
    })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [animals])

  const download = async (format) => {
    const params = { type: reportType, from, to }
    if (reportType === 'audit' && auditUserId) {
      params.userId = auditUserId
    }
    const qs = buildQuery(params)
    setExporting(true)
    try {
      const response = await apiFetch(`/reports/export/${format}${qs}`)
      const ct = (response.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json')) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.message || 'Сервер вернул ошибку вместо файла')
      }
      const blob = await response.blob()
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `zoo-${reportType}.${ext}`
      link.click()
      URL.revokeObjectURL(link.href)
      notify('Файл сформирован')
    } catch (e) {
      notify(e.message || 'Ошибка экспорта')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="page-section">
      <p className="report-note">Экспорт в PDF и Excel с учётом периода (где применимо). Для журнала аудита можно указать пользователя.</p>
      <div className="report-actions">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
          <option value="visitors">Посещаемость</option>
          <option value="feed">Склад кормов</option>
          <option value="procedures">Процедуры</option>
          <option value="animals">Реестр животных</option>
          <option value="audit">Журнал аудита</option>
        </select>
        <label className="inline-label">
          <span>С</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-label">
          <span>По</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {reportType === 'audit' && (
          <select value={auditUserId} onChange={(e) => setAuditUserId(e.target.value)}>
            <option value="">Все пользователи</option>
            {(users || []).map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.login}</option>
            ))}
          </select>
        )}
        <button type="button" disabled={exporting} onClick={() => download('pdf')}>{exporting ? '…' : 'PDF'}</button>
        <button type="button" disabled={exporting} onClick={() => download('excel')}>{exporting ? '…' : 'Excel'}</button>
        <button type="button" className="btn-secondary" onClick={() => globalThis.print()}>Печать экрана</button>
      </div>
      <div className="charts-grid">
        {visitors.length > 0 ? <VisitorBarChart data={visitors} title="Динамика посещаемости" /> : <div className="chart-card muted">Нет данных посещаемости</div>}
        {speciesStats.length > 0 ? (
          <div className="chart-card">
            <h3>Состав коллекции по видам</h3>
            <div className="chart-body">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={speciesStats} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#4caf50" name="Кол-во" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>
      <div className="panel">
        <h3>Сводка</h3>
        <ul className="summary-list">
          <li>Животных в учёте: <strong>{animals.length}</strong></li>
          <li>Активных процедур в списке: <strong>{procedures.length}</strong></li>
          <li>Позиций на складе: <strong>{feed.length}</strong></li>
        </ul>
      </div>
    </section>
  )
}

function AuditPage({ apiFetch, users }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userId, setUserId] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const q = buildQuery({ from, to, userId })
        const r = await apiFetch(`/audit${q}`)
        const data = await r.json()
        if (!cancelled) setLogs(data)
      } catch {
        if (!cancelled) setLogs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [from, to, userId])

  return (
    <section className="page-section">
      <div className="panel">
        <p className="small muted">До 1000 записей с учётом фильтров. Событие «Смена пароля» отображается здесь — форма смены пароля вынесена в раздел «Профиль».</p>
        <div className="inline-form toolbar">
          <label className="inline-label">
            <span>С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="inline-label">
            <span>По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Все пользователи</option>
            {(users || []).map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.login}</option>
            ))}
          </select>
        </div>
      </div>
      {loading && <p className="text-muted">Загрузка…</p>}
      {!loading && (
        <Table
          headers={['ID', 'Пользователь', 'Событие', 'Дата', 'IP']}
          rows={logs.map((item) => [item.log_id, item.login || '—', item.action, new Date(item.timestamp).toLocaleString('ru-RU'), item.ip_address || '—'])}
        />
      )}
    </section>
  )
}

function ProfilePage({ passwordForm, setPasswordForm, apiFetch, notify }) {
  return (
    <section className="page-section">
      <div className="profile-card panel">
        <h2>Смена пароля</h2>
        <p className="small muted">Минимум 8 символов, заглавная и строчная буква, цифра и спецсимвол (!@#$ и т.д.). После смены в журнале аудита появится соответствующая запись.</p>
        <PasswordSection passwordForm={passwordForm} setPasswordForm={setPasswordForm} apiFetch={apiFetch} notify={notify} />
      </div>
    </section>
  )
}

function PasswordSection({ passwordForm, setPasswordForm, apiFetch, notify, compact = false }) {
  const changePassword = async (event) => {
    event.preventDefault()
    await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwordForm),
    })
    setPasswordForm({ oldPassword: '', newPassword: '' })
    notify('Пароль успешно изменен')
  }

  return (
    <form className={compact ? 'password-compact' : 'inline-form'} onSubmit={changePassword}>
      <input type="password" autoComplete="current-password" placeholder="Старый пароль" value={passwordForm.oldPassword} onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })} required />
      <input type="password" autoComplete="new-password" placeholder="Новый пароль" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required />
      <button type="submit">Сменить пароль</button>
    </form>
  )
}

function Table({ headers, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${String(rowIndex)}`}>
              {row.map((cell, cellIndex) => (
                <td key={`c-${String(rowIndex)}-${String(cellIndex)}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

Table.propTypes = {
  headers: PropTypes.arrayOf(PropTypes.string).isRequired,
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.node,
  ]))).isRequired,
}

Dashboard.propTypes = {
  dashboard: PropTypes.shape({
    cards: PropTypes.object,
    lastActions: PropTypes.array,
    visitorTrend: PropTypes.array,
    activeTechnicians: PropTypes.array,
    animalHealth: PropTypes.array,
  }).isRequired,
}
AnimalsPage.propTypes = {
  animals: PropTypes.array.isRequired,
  animalForm: PropTypes.object.isRequired,
  setAnimalForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
StaffPage.propTypes = {
  users: PropTypes.array.isRequired,
  animals: PropTypes.array.isRequired,
  assignments: PropTypes.array.isRequired,
  procedures: PropTypes.array.isRequired,
  staffForm: PropTypes.object.isRequired,
  setStaffForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
ProceduresPage.propTypes = {
  procedures: PropTypes.array.isRequired,
  animals: PropTypes.array.isRequired,
  users: PropTypes.array.isRequired,
  procedureTypes: PropTypes.array.isRequired,
  procedureForm: PropTypes.object.isRequired,
  setProcedureForm: PropTypes.func.isRequired,
  bulkForm: PropTypes.object.isRequired,
  setBulkForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
FeedPage.propTypes = {
  feed: PropTypes.array.isRequired,
  feedForm: PropTypes.object.isRequired,
  setFeedForm: PropTypes.func.isRequired,
  purchaseRequests: PropTypes.array,
  notifications: PropTypes.object,
  apiFetch: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
VisitorsPage.propTypes = {
  visitors: PropTypes.array.isRequired,
  visitorForm: PropTypes.object.isRequired,
  setVisitorForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
ReportsPage.propTypes = {
  apiFetch: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
  users: PropTypes.array.isRequired,
  visitors: PropTypes.array.isRequired,
  animals: PropTypes.array.isRequired,
  feed: PropTypes.array.isRequired,
  procedures: PropTypes.array.isRequired,
}
AuditPage.propTypes = {
  apiFetch: PropTypes.func.isRequired,
  users: PropTypes.array.isRequired,
}
ProfilePage.propTypes = {
  passwordForm: PropTypes.object.isRequired,
  setPasswordForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
}
PasswordSection.propTypes = {
  passwordForm: PropTypes.object.isRequired,
  setPasswordForm: PropTypes.func.isRequired,
  apiFetch: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
  compact: PropTypes.bool,
}

export default App
