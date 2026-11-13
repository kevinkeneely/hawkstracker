import { LineChart, Line, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

/**
 * Tiny inline line chart for a single stat's game-by-game progression.
 * Last-N window highlighted vs full-season faded, season-average reference
 * line drawn across. Tooltip shows the game context (date vs opp + value).
 *
 * Expects `games` as an array of { date, opp_tricode, value } in chronological
 * order. `value` can be null for games the player missed; recharts skips nulls.
 *
 * Variants:
 *   `pct`  — multiply raw value by 100 for display, append '%'
 *   `rating` — pretty-print with +/- sign for net rating
 *   default — one decimal place
 */
export default function TrendSparkline({
  games,
  windowSize = 10,
  format = 'num',
  color = '#e03a3e',
  height = 48,
}) {
  const totalGames = games.length
  const windowStart = Math.max(0, totalGames - windowSize)

  // Add an index for recharts and a boolean "in rolling window"
  const data = games.map((g, i) => ({
    ...g,
    idx: i,
    inWindow: i >= windowStart,
  }))

  // Season average across non-null values (reference line)
  const validValues = data.filter((d) => d.value != null).map((d) => d.value)
  const seasonAvg = validValues.length
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length
    : null

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          {seasonAvg != null && (
            <ReferenceLine
              y={seasonAvg}
              stroke="var(--border)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, fill: color }}
            isAnimationActive={false}
            connectNulls
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="spark-tooltip">
                  <div className="spark-tt-date">
                    {d.date} · {d.home_away === 'home' ? 'vs' : '@'} {d.opp_tricode}
                  </div>
                  <div className="spark-tt-value">{formatValue(d.value, format)}</div>
                </div>
              )
            }}
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
            /* Position the tooltip above the sparkline so it doesn't cover
               the point being hovered. allowEscapeViewBox lets it render
               outside the chart's clip area. */
            position={{ y: -70 }}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ pointerEvents: 'none', zIndex: 100 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function formatValue(v, format) {
  if (v == null) return '—'
  if (format === 'pct') return `${(v * 100).toFixed(1)}%`
  if (format === 'rating') return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
  return v.toFixed(1)
}
