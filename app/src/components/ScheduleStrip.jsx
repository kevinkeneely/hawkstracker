import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function formatGameDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ScheduleStrip({ season }) {
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)
  const stripRef = useRef(null)

  useEffect(() => {
    if (!season) return
    setSchedule(null)
    fetch(`/schedule-${season}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load schedule-${season}.json (${r.status})`)
        return r.json()
      })
      .then(setSchedule)
      .catch((e) => setError(e.message))
  }, [season])

  // Auto-scroll to center today's game (or next upcoming) once chips render
  useLayoutEffect(() => {
    if (!schedule || !stripRef.current) return
    const todayChip = stripRef.current.querySelector('[data-today="true"]')
    if (!todayChip) return
    const strip = stripRef.current
    strip.scrollLeft =
      todayChip.offsetLeft - strip.clientWidth / 2 + todayChip.clientWidth / 2
  }, [schedule])

  if (error) {
    return <div className="schedule-strip-error">Schedule unavailable.</div>
  }
  if (!schedule) return null

  const games = schedule.games || []
  if (games.length === 0) {
    return (
      <div className="schedule-strip-empty">
        No games scheduled yet this season.
      </div>
    )
  }

  // Find the first upcoming game (or today's). If all games are in the past,
  // the last game marks "today".
  const todayIso = new Date().toISOString().split('T')[0]
  let todayIdx = games.findIndex((g) => g.date >= todayIso)
  if (todayIdx === -1) todayIdx = games.length - 1

  return (
    <div className="schedule-strip" ref={stripRef}>
      <div className="schedule-strip-track">
        {games.map((g, i) => (
          <GameChip key={g.game_id} game={g} isToday={i === todayIdx} />
        ))}
      </div>
    </div>
  )
}

function GameChip({ game, isToday }) {
  const upcoming = game.status_code !== 3
  const won =
    !upcoming &&
    game.hawks_score != null &&
    game.opp_score != null &&
    game.hawks_score > game.opp_score
  const vsAt = game.home_away === 'home' ? 'vs' : '@'

  let cls = 'game-chip'
  if (upcoming) cls += ' upcoming'
  else cls += won ? ' won' : ' lost'
  if (isToday) cls += ' today'

  return (
    <Link
      to={`/games/${game.game_id}`}
      className={cls}
      data-today={isToday ? 'true' : undefined}
    >
      <div className="game-chip-date">{formatGameDate(game.date)}</div>
      <div className="game-chip-matchup">
        <span className="game-chip-vsat">{vsAt}</span>
        <span className="game-chip-opp">{game.opp_tricode}</span>
      </div>
      {upcoming ? (
        <div className="game-chip-score game-chip-upcoming-text">
          {game.status || '—'}
        </div>
      ) : (
        <div className="game-chip-score">
          <span className="game-chip-result">{won ? 'W' : 'L'}</span>{' '}
          {game.hawks_score}-{game.opp_score}
        </div>
      )}
    </Link>
  )
}