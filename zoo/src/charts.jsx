import PropTypes from 'prop-types'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const GREEN = '#4caf50'
const LIGHT = '#90cf7c'
const ORANGE = '#ffb300'
const RED = '#e53935'

export function VisitorTrendChart({ data }) {
  const chartData = data.map((d) => ({
    day: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    total: d.total,
  }))
  return (
    <div className="chart-card">
      <h3>Посещаемость за неделю</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [`${v} чел.`, 'Итого']} />
            <Line type="monotone" dataKey="total" stroke={GREEN} strokeWidth={2} dot={{ fill: LIGHT, r: 4 }} name="Посетители" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

VisitorTrendChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({ date: PropTypes.string, total: PropTypes.number })).isRequired,
}

export function HealthPieChart({ data }) {
  const chartData = data.map((d) => ({ name: d.health_status, value: d.count }))
  const colors = [GREEN, LIGHT, ORANGE, RED, '#43a047', '#8bc34a']
  return (
    <div className="chart-card">
      <h3>Состояние животных</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {chartData.map((entry, index) => (
                <Cell key={entry.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => [`${v} шт.`, 'Количество']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

HealthPieChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({ health_status: PropTypes.string, count: PropTypes.number })).isRequired,
}

export function VisitorBarChart({ data, title }) {
  const chartData = [...data]
    .reverse()
    .slice(-14)
    .map((d) => ({
      day: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      утро: d.morning_shift,
      вечер: d.evening_shift,
    }))
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="утро" fill={LIGHT} radius={[4, 4, 0, 0]} />
            <Bar dataKey="вечер" fill={GREEN} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

VisitorBarChart.propTypes = {
  data: PropTypes.array.isRequired,
  title: PropTypes.string.isRequired,
}
