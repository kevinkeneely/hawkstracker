import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function formatGameDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtInt(v) {
  return v == null ? '—' : String(v)
}

function fmtMinutes(min) {
  if (min == null || min === '') return '—'
  // NBA returns MIN as either "MM:SS" string or a plain number
  if (typeof min === 'string' && min.includes(':')) return min
  return `${Math.round(Number(min))}`
}

function fmtMA(made, attempted) {
  if (made == null || attempted == null) return '—'
  return `${made}-${attempted}`
}

function fmtPlusMinus(v) {
  if (v == null) return '—'
  const n = Number(v)
  return n > 0 ? `+${n}` : `${n}`
}

export default function BoxScorePage() {
  const { id } = useParams()
  const [box, setBox] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    Promise.all([
      fetch(`/boxscores/${id}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/schedule.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([b, s]) => {
      setBox(b)
      setSchedule(s)
      setLoaded(true)
    })
  }, [id])

  if (!loaded) return <p>Loading…</p>

  const game = schedule?.games?.find((g) => g.game_id === id)

  // Upcoming game — no box score yet
  if (!box && game && game.status_code !== 3) {
    const vsAt = game.home_away === 'home' ? 'vs' : '@'
    return (
      <div className="boxscore">
        <Link to="/standings" className="boxscore-back">
          ← Back to Standings
        </Link>
        <header className="boxscore-header">
          <div className="boxscore-date">{formatGameDate(game.date)}</div>
          <h1>
            <span className="boxscore-team-name">ATL</span>{' '}
            <span className="boxscore-vs">{vsAt}</span>{' '}
            <span className="boxscore-team-name">{game.opp_tricode}</span>
          </h1>
          <p className="boxscore-upcoming-note">Scheduled: {game.status || 'TBD'}</p>
          <p className="boxscore-upcoming-sub">
            Box score will appear here after the game is played.
          </p>
        </header>
      </div>
    )
  }

  if (!box) {
    return (
      <div className="boxscore-missing">
        <Link to="/standings">← Back to Standings</Link>
        <p>Box score unavailable.</p>
      </div>
    )
  }

  const playerRs = box.resultSets.find((rs) => rs.name === 'PlayerStats')
  const idx = {}
  playerRs.headers.forEach((h, i) => (idx[h] = i))
  const rows = playerRs.rowSet.map((r) => ({
    team: r[idx.TEAM_ABBREVIATION],
    name: r[idx.PLAYER_NAME],
    pos: r[idx.START_POSITION],
    min: r[idx.MIN],
    pts: r[idx.PTS],
    reb: r[idx.REB],
    ast: r[idx.AST],
    stl: r[idx.STL],
    blk: r[idx.BLK],
    tov: r[idx.TO],
    fgm: r[idx.FGM],
    fga: r[idx.FGA],
    fg3m: r[idx.FG3M],
    fg3a: r[idx.FG3A],
    ftm: r[idx.FTM],
    fta: r[idx.FTA],
    plusMinus: r[idx.PLUS_MINUS],
  }))

  // Group by team, Hawks first
  const byTeam = {}
  for (const r of rows) {
    if (!byTeam[r.team]) byTeam[r.team] = []
    byTeam[r.team].push(r)
  }
  const teams = Object.keys(byTeam).sort((a, b) =>
    a === 'ATL' ? -1 : b === 'ATL' ? 1 : 0
  )

  // Team totals
  const teamRs = box.resultSets.find((rs) => rs.name === 'TeamStats')
  const teamIdx = {}
  teamRs.headers.forEach((h, i) => (teamIdx[h] = i))
  const teamScores = {}
  for (const r of teamRs.rowSet) {
    teamScores[r[teamIdx.TEAM_ABBREVIATION]] = r[teamIdx.PTS]
  }

  return (
    <div className="boxscore">
      <Link to="/standings" className="boxscore-back">
        ← Back to Standings
      </Link>

      <header className="boxscore-header">
        {game && <div className="boxscore-date">{formatGameDate(game.date)}</div>}
        <h1>
          {teams.map((t, i) => (
            <span key={t}>
              {i > 0 && <span className="boxscore-vs"> vs </span>}
              <span className="boxscore-team-name">{t}</span>{' '}
              <span className="boxscore-team-score">{teamScores[t] ?? '—'}</span>
            </span>
          ))}
        </h1>
      </header>

      {teams.map((team) => (
        <TeamBox key={team} team={team} players={byTeam[team]} />
      ))}
    </div>
  )
}

function TeamBox({ team, players }) {
  const starters = players
    .filter((p) => p.pos)
    .sort((a, b) => (b.min ?? 0) - (a.min ?? 0))
  const bench = players
    .filter((p) => !p.pos && p.min)
    .sort((a, b) => (b.min ?? 0) - (a.min ?? 0))
  const dnp = players.filter((p) => !p.pos && !p.min)

  return (
    <section className="boxscore-team">
      <h2>{team}</h2>
      <div className="boxscore-table-wrap">
        <table className="boxscore-table">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TO</th>
              <th>FG</th>
              <th>3PT</th>
              <th>FT</th>
              <th>+/−</th>
            </tr>
          </thead>
          <tbody>
            {starters.map((p) => <PlayerRow key={p.name} p={p} />)}
            {bench.length > 0 && (
              <tr className="boxscore-divider">
                <td colSpan={12}>Bench</td>
              </tr>
            )}
            {bench.map((p) => <PlayerRow key={p.name} p={p} />)}
          </tbody>
        </table>
      </div>
      {dnp.length > 0 && (
        <p className="boxscore-dnp">
          DNP: {dnp.map((p) => p.name).join(', ')}
        </p>
      )}
    </section>
  )
}

function PlayerRow({ p }) {
  return (
    <tr>
      <td className="col-player">
        {p.name}
        {p.pos && <span className="boxscore-pos"> {p.pos}</span>}
      </td>
      <td>{fmtMinutes(p.min)}</td>
      <td>{fmtInt(p.pts)}</td>
      <td>{fmtInt(p.reb)}</td>
      <td>{fmtInt(p.ast)}</td>
      <td>{fmtInt(p.stl)}</td>
      <td>{fmtInt(p.blk)}</td>
      <td>{fmtInt(p.tov)}</td>
      <td>{fmtMA(p.fgm, p.fga)}</td>
      <td>{fmtMA(p.fg3m, p.fg3a)}</td>
      <td>{fmtMA(p.ftm, p.fta)}</td>
      <td>{fmtPlusMinus(p.plusMinus)}</td>
    </tr>
  )
}