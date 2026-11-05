import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  HUSTLE_GLOSSARY,
  DEFENSE_GLOSSARY,
  SHOOTING_GLOSSARY,
  PLAYMAKING_GLOSSARY,
} from '../data/boxScoreGlossary'

// Context: Set<number> of Hawks player ids. Any PlayerRow inside this
// provider can read it with useContext(HawksIdsContext) to decide whether
// to render the name as a Link to /players/:id. This spares us from
// plumbing the Set through four TeamBox wrappers for the advanced tabs.
const HawksIdsContext = createContext(new Set())

// Small helper used by every PlayerRow variant: renders the player's name
// as a <Link> when their id is in hawksIds, otherwise plain text. Keeps
// the hover treatment consistent across Traditional/Hustle/Defense/etc.
function PlayerNameCell({ id, name, pos, suffix }) {
  const hawksIds = useContext(HawksIdsContext)
  const content = (
    <>
      {name}
      {pos && <span className="boxscore-pos"> {pos}</span>}
      {suffix}
    </>
  )
  return (
    <td className="col-player">
      {id != null && hawksIds.has(Number(id))
        ? <Link to={`/players/${id}`} className="boxscore-player-link">{content}</Link>
        : content}
    </td>
  )
}

/** Collapsible glossary rendered at the bottom of each advanced-stats tab.
 *  entries: array of { label, def, formula? }. Uses a native <details>
 *  element so it's accessible and works on mobile without JS wiring. */
function BoxScoreGlossary({ entries }) {
  return (
    <details className="boxscore-glossary">
      <summary className="boxscore-glossary-summary">
        Glossary — what do these stats mean?
      </summary>
      <dl className="boxscore-glossary-list">
        {entries.map((e) => (
          <div key={e.label} className="boxscore-glossary-item">
            <dt className="boxscore-glossary-term">{e.label}</dt>
            <dd className="boxscore-glossary-def">{e.def}</dd>
            {e.formula && (
              <dd className="boxscore-glossary-formula">
                <span className="boxscore-glossary-formula-label">Formula:</span>{' '}
                {e.formula}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </details>
  )
}

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

export default function BoxScorePage({ season, playerData }) {
  const { id } = useParams()

  // Build the Hawks id Set once per playerData change — shared with every
  // PlayerRow below via <HawksIdsContext.Provider>.
  const hawksIds = useMemo(
    () => new Set((playerData?.players || []).map((p) => Number(p.id))),
    [playerData]
  )
  const [box, setBox] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Phase 4 — category tabs. Only Traditional + Hustle have data wired up
  // right now; Defense / Shooting / Playmaking are placeholder stubs for the
  // next session.
  const [category, setCategory] = useState('traditional')
  // Each category lazy-loads its own JSON (or two in Shooting's case) when
  // first selected. Loaded data persists across tab switches so the fetch
  // only runs once per category per visit.
  const [hustle, setHustle] = useState(null)
  const [hustleError, setHustleError] = useState(null)
  const [defense, setDefense] = useState(null)
  const [defenseError, setDefenseError] = useState(null)
  const [playerTrack, setPlayerTrack] = useState(null)
  const [playerTrackError, setPlayerTrackError] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [scoringError, setScoringError] = useState(null)

  useEffect(() => {
    if (category === 'hustle' && !hustle && !hustleError) {
      fetch(`/boxscores/${id}-hustle.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not available'))))
        .then((d) => setHustle(d?.boxScoreHustle || null))
        .catch((e) => setHustleError(e.message))
    }
    if (category === 'defense' && !defense && !defenseError) {
      fetch(`/boxscores/${id}-defensive.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not available'))))
        .then((d) => setDefense(d?.boxScoreDefensive || null))
        .catch((e) => setDefenseError(e.message))
    }
    // Playmaking and Shooting both need the player-track file. Shooting also
    // needs the scoring file. Fire whichever requests are missing.
    const needsPlayerTrack = category === 'playmaking' || category === 'shooting'
    if (needsPlayerTrack && !playerTrack && !playerTrackError) {
      fetch(`/boxscores/${id}-player-track.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not available'))))
        .then((d) => setPlayerTrack(d?.boxScorePlayerTrack || null))
        .catch((e) => setPlayerTrackError(e.message))
    }
    if (category === 'shooting' && !scoring && !scoringError) {
      fetch(`/boxscores/${id}-scoring.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not available'))))
        .then((d) => setScoring(d?.boxScoreScoring || null))
        .catch((e) => setScoringError(e.message))
    }
  }, [category, id, hustle, hustleError, defense, defenseError, playerTrack, playerTrackError, scoring, scoringError])

  useEffect(() => {
    setLoaded(false)
    Promise.all([
      fetch(`/boxscores/${id}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      season
        ? fetch(`/schedule-${season}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([b, s]) => {
      setBox(b)
      setSchedule(s)
      setLoaded(true)
    })
  }, [id, season])

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
    id: r[idx.PLAYER_ID],
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
    <HawksIdsContext.Provider value={hawksIds}>
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

      <CategoryTabs active={category} onChange={setCategory} />

      {category === 'traditional' && teams.map((team) => (
        <TeamBox key={team} team={team} players={byTeam[team]} />
      ))}

      {category === 'hustle' && (
        <HustleView
          hustle={hustle}
          error={hustleError}
          teamsOrder={teams}
        />
      )}

      {category === 'defense' && (
        <DefenseView
          defense={defense}
          error={defenseError}
          teamsOrder={teams}
        />
      )}

      {category === 'shooting' && (
        <ShootingView
          playerTrack={playerTrack}
          scoring={scoring}
          error={playerTrackError || scoringError}
          teamsOrder={teams}
        />
      )}

      {category === 'playmaking' && (
        <PlaymakingView
          playerTrack={playerTrack}
          error={playerTrackError}
          teamsOrder={teams}
        />
      )}
    </div>
    </HawksIdsContext.Provider>
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

  const teamClass = team === 'ATL' ? 'is-hawks' : 'is-opponent'
  return (
    <section className={`boxscore-team ${teamClass}`}>
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
      <PlayerNameCell id={p.id} name={p.name} pos={p.pos} />
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


const CATEGORY_LABEL = {
  traditional: 'Traditional',
  hustle: 'Hustle',
  defense: 'Defense',
  shooting: 'Shooting',
  playmaking: 'Playmaking',
}

const CATEGORY_ORDER = ['traditional', 'hustle', 'defense', 'shooting', 'playmaking']

function CategoryTabs({ active, onChange }) {
  return (
    <div className="boxscore-category-tabs">
      {CATEGORY_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className={`boxscore-category-tab ${active === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
        >
          {CATEGORY_LABEL[key]}
        </button>
      ))}
    </div>
  )
}

function HustleView({ hustle, error, teamsOrder }) {
  if (error) {
    return (
      <div className="boxscore-category-placeholder">
        <p>Hustle stats not published by NBA.com yet.</p>
        <p className="boxscore-category-placeholder-sub">
          These usually appear a few hours after the game ends — check back later today.
        </p>
      </div>
    )
  }
  if (!hustle) {
    return <p className="boxscore-category-loading">Loading hustle stats…</p>
  }
  // Also treat "file exists but nothing in it" as not-yet-published. NBA.com
  // sometimes publishes a stub (1 DNP sentinel per team) immediately after a
  // game, then backfills the real rows a few hours later. If neither team
  // has any rotation players with minutes, show the same placeholder as the
  // hard-fail error path above.
  const hasRotation = (team) =>
    (team?.players || []).some((p) => {
      const mins = p?.statistics?.minutes
      return mins && mins !== '0:00' && mins !== '00:00'
    })
  if (!hasRotation(hustle.homeTeam) && !hasRotation(hustle.awayTeam)) {
    return (
      <div className="boxscore-category-placeholder">
        <p>Hustle stats not published by NBA.com yet.</p>
        <p className="boxscore-category-placeholder-sub">
          These usually appear a few hours after the game ends — check back later today.
        </p>
      </div>
    )
  }
  // NBA.com v2 shape — group into home/away, then order teams Hawks-first.
  const teams = [
    { ...hustle.homeTeam, _side: 'home' },
    { ...hustle.awayTeam, _side: 'away' },
  ].filter((t) => t && t.teamTricode)
  // Match the Traditional view's team ordering (Hawks first). teamsOrder has
  // tricodes in display order.
  const ordered = [...teams].sort((a, b) => {
    const ai = teamsOrder.indexOf(a.teamTricode)
    const bi = teamsOrder.indexOf(b.teamTricode)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  return (
    <>
      {ordered.map((team) => (
        <HustleTeamBox key={team.teamTricode} team={team} />
      ))}
      <BoxScoreGlossary entries={HUSTLE_GLOSSARY} />
    </>
  )
}

function HustleTeamBox({ team }) {
  const players = (team.players || []).filter((p) => {
    // Skip DNPs — their statistics block is empty/zero. Keep anyone with any
    // minutes.
    const mins = p.statistics?.minutes
    return mins && mins !== '0:00' && mins !== '00:00'
  })
  const teamClass = team.teamTricode === 'ATL' ? 'is-hawks' : 'is-opponent'
  return (
    <section className={`boxscore-team ${teamClass}`}>
      <h2>{team.teamTricode}</h2>
      <div className="boxscore-table-wrap">
        <table className="boxscore-table">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th>MIN</th>
              <th>Contested</th>
              <th>2PT</th>
              <th>3PT</th>
              <th>Defl</th>
              <th>Charges</th>
              <th>SA</th>
              <th>SA PTS</th>
              <th>Loose</th>
              <th>Box Outs</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => <HustlePlayerRow key={p.personId} p={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HustlePlayerRow({ p }) {
  const s = p.statistics || {}
  return (
    <tr>
      <PlayerNameCell id={p.personId} name={p.nameI || p.familyName} />
      <td>{fmtMinutes(s.minutes)}</td>
      <td>{fmtInt(s.contestedShots)}</td>
      <td>{fmtInt(s.contestedShots2pt)}</td>
      <td>{fmtInt(s.contestedShots3pt)}</td>
      <td>{fmtInt(s.deflections)}</td>
      <td>{fmtInt(s.chargesDrawn)}</td>
      <td>{fmtInt(s.screenAssists)}</td>
      <td>{fmtInt(s.screenAssistPoints)}</td>
      <td>{fmtInt(s.looseBallsRecoveredTotal)}</td>
      <td>{fmtInt(s.boxOuts)}</td>
    </tr>
  )
}


// ─── Shared helper: order the two teams Hawks-first based on the Traditional
// view's team ordering so the per-category tabs match the top layout. ───
function orderTeams(home, away, teamsOrder) {
  const teams = [home, away].filter((t) => t && t.teamTricode)
  return [...teams].sort((a, b) => {
    const ai = teamsOrder.indexOf(a.teamTricode)
    const bi = teamsOrder.indexOf(b.teamTricode)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

function fmtPct1(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${(Number(v) * 100).toFixed(1)}%`
}

function fmtFloat1(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toFixed(1)
}

// Shared predicate: skip DNPs (statistics.minutes empty / zero).
function playedMinutes(p) {
  const m = p.statistics?.minutes
  return m && m !== '0:00' && m !== '00:00'
}

// ─── Defense tab (BoxScoreDefensiveV2) ────────────────────────
function DefenseView({ defense, error, teamsOrder }) {
  if (error) return (
    <div className="boxscore-category-placeholder">
      <p>Defense stats not published by NBA.com yet.</p>
      <p className="boxscore-category-placeholder-sub">
        These usually appear a few hours after the game ends — check back later today.
      </p>
    </div>
  )
  if (!defense) return <p className="boxscore-category-loading">Loading defense stats…</p>
  const ordered = orderTeams(defense.homeTeam, defense.awayTeam, teamsOrder)
  return (
    <>
      {ordered.map((team) => <DefenseTeamBox key={team.teamTricode} team={team} />)}
      <BoxScoreGlossary entries={DEFENSE_GLOSSARY} />
    </>
  )
}

function DefenseTeamBox({ team }) {
  const players = (team.players || []).filter((p) => {
    const m = p.statistics?.matchupMinutes
    return m && m !== '0:00' && m !== '00:00'
  })
  const teamClass = team.teamTricode === 'ATL' ? 'is-hawks' : 'is-opponent'
  return (
    <section className={`boxscore-team ${teamClass}`}>
      <h2>{team.teamTricode}</h2>
      <div className="boxscore-table-wrap">
        <table className="boxscore-table">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th>Matchup MIN</th>
              <th>Part. Poss.</th>
              <th>Opp FG</th>
              <th>Opp FG%</th>
              <th>Opp 3PT</th>
              <th>Opp 3PT%</th>
              <th>PTS Allowed</th>
              <th>DREB</th>
              <th>Matchup AST</th>
              <th>Matchup TOV</th>
              <th>STL</th>
              <th>BLK</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => <DefensePlayerRow key={p.personId} p={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DefensePlayerRow({ p }) {
  const s = p.statistics || {}
  return (
    <tr>
      <PlayerNameCell id={p.personId} name={p.nameI || p.familyName} />
      <td>{fmtMinutes(s.matchupMinutes)}</td>
      <td>{fmtFloat1(s.partialPossessions)}</td>
      <td>{fmtMA(s.matchupFieldGoalsMade, s.matchupFieldGoalsAttempted)}</td>
      <td>{fmtPct1(s.matchupFieldGoalPercentage)}</td>
      <td>{fmtMA(s.matchupThreePointersMade, s.matchupThreePointersAttempted)}</td>
      <td>{fmtPct1(s.matchupThreePointerPercentage)}</td>
      <td>{fmtInt(s.playerPoints)}</td>
      <td>{fmtInt(s.defensiveRebounds)}</td>
      <td>{fmtInt(s.matchupAssists)}</td>
      <td>{fmtInt(s.matchupTurnovers)}</td>
      <td>{fmtInt(s.steals)}</td>
      <td>{fmtInt(s.blocks)}</td>
    </tr>
  )
}

// ─── Shooting tab (BoxScorePlayerTrackV3 + BoxScoreScoringV3) ─
function ShootingView({ playerTrack, scoring, error, teamsOrder }) {
  if (error) return (
    <div className="boxscore-category-placeholder">
      <p>Shooting stats not published by NBA.com yet.</p>
      <p className="boxscore-category-placeholder-sub">
        These usually appear a few hours after the game ends — check back later today.
      </p>
    </div>
  )
  if (!playerTrack || !scoring) return <p className="boxscore-category-loading">Loading shooting stats…</p>

  // Merge the two by personId per team. PlayerTrack supplies the contested /
  // uncontested / rim-defense splits; Scoring supplies the shot-type %
  // breakdowns.
  const scoringByPid = (team) => {
    const map = new Map()
    for (const p of (team?.players || [])) map.set(p.personId, p.statistics || {})
    return map
  }
  const buildTeam = (ptTeam, scTeam) => {
    const scMap = scoringByPid(scTeam)
    const merged = (ptTeam?.players || []).map((p) => ({
      ...p,
      scoringStats: scMap.get(p.personId) || {},
    }))
    return { ...ptTeam, players: merged }
  }

  const home = buildTeam(playerTrack.homeTeam, scoring.homeTeam)
  const away = buildTeam(playerTrack.awayTeam, scoring.awayTeam)
  const ordered = orderTeams(home, away, teamsOrder)
  return (
    <>
      {ordered.map((team) => <ShootingTeamBox key={team.teamTricode} team={team} />)}
      <BoxScoreGlossary entries={SHOOTING_GLOSSARY} />
    </>
  )
}

function ShootingTeamBox({ team }) {
  const players = (team.players || []).filter(playedMinutes)
  const teamClass = team.teamTricode === 'ATL' ? 'is-hawks' : 'is-opponent'
  return (
    <section className={`boxscore-team ${teamClass}`}>
      <h2>{team.teamTricode}</h2>
      <div className="boxscore-table-wrap">
        <table className="boxscore-table">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th>MIN</th>
              <th>Contested FG</th>
              <th>Contested FG%</th>
              <th>Uncontested FG</th>
              <th>Uncontested FG%</th>
              <th>Rim FG</th>
              <th>Rim FG%</th>
              <th>% Pts Paint</th>
              <th>% Pts Mid</th>
              <th>% Pts 3PT</th>
              <th>% Asst FGM</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => <ShootingPlayerRow key={p.personId} p={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ShootingPlayerRow({ p }) {
  const s = p.statistics || {}
  const sc = p.scoringStats || {}
  return (
    <tr>
      <PlayerNameCell id={p.personId} name={p.nameI || p.familyName} />
      <td>{fmtMinutes(s.minutes)}</td>
      <td>{fmtMA(s.contestedFieldGoalsMade, s.contestedFieldGoalsAttempted)}</td>
      <td>{fmtPct1(s.contestedFieldGoalPercentage)}</td>
      <td>{fmtMA(s.uncontestedFieldGoalsMade, s.uncontestedFieldGoalsAttempted)}</td>
      <td>{fmtPct1(s.uncontestedFieldGoalsPercentage)}</td>
      <td>{fmtMA(s.defendedAtRimFieldGoalsMade, s.defendedAtRimFieldGoalsAttempted)}</td>
      <td>{fmtPct1(s.defendedAtRimFieldGoalPercentage)}</td>
      <td>{fmtPct1(sc.percentagePointsPaint)}</td>
      <td>{fmtPct1(sc.percentagePointsMidrange2pt)}</td>
      <td>{fmtPct1(sc.percentagePoints3pt)}</td>
      <td>{fmtPct1(sc.percentageAssistedFGM)}</td>
    </tr>
  )
}

// ─── Playmaking tab (BoxScorePlayerTrackV3) ───────────────────
function PlaymakingView({ playerTrack, error, teamsOrder }) {
  if (error) return (
    <div className="boxscore-category-placeholder">
      <p>Playmaking stats not published by NBA.com yet.</p>
      <p className="boxscore-category-placeholder-sub">
        These usually appear a few hours after the game ends — check back later today.
      </p>
    </div>
  )
  if (!playerTrack) return <p className="boxscore-category-loading">Loading playmaking stats…</p>
  const ordered = orderTeams(playerTrack.homeTeam, playerTrack.awayTeam, teamsOrder)
  return (
    <>
      {ordered.map((team) => <PlaymakingTeamBox key={team.teamTricode} team={team} />)}
      <BoxScoreGlossary entries={PLAYMAKING_GLOSSARY} />
    </>
  )
}

function PlaymakingTeamBox({ team }) {
  const players = (team.players || []).filter(playedMinutes)
  const teamClass = team.teamTricode === 'ATL' ? 'is-hawks' : 'is-opponent'
  return (
    <section className={`boxscore-team ${teamClass}`}>
      <h2>{team.teamTricode}</h2>
      <div className="boxscore-table-wrap">
        <table className="boxscore-table">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th>MIN</th>
              <th>Touches</th>
              <th>Passes</th>
              <th>AST</th>
              <th>2nd AST</th>
              <th>FT AST</th>
              <th>Speed</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => <PlaymakingPlayerRow key={p.personId} p={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PlaymakingPlayerRow({ p }) {
  const s = p.statistics || {}
  return (
    <tr>
      <PlayerNameCell id={p.personId} name={p.nameI || p.familyName} />
      <td>{fmtMinutes(s.minutes)}</td>
      <td>{fmtInt(s.touches)}</td>
      <td>{fmtInt(s.passes)}</td>
      <td>{fmtInt(s.assists)}</td>
      <td>{fmtInt(s.secondaryAssists)}</td>
      <td>{fmtInt(s.freeThrowAssists)}</td>
      <td>{fmtFloat1(s.speed)}</td>
      <td>{fmtFloat1(s.distance)}</td>
    </tr>
  )
}
