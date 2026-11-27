import { Fragment } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import Tabs from '../components/Tabs'

/**
 * CareerPage — compares a single player's stats across every season of his
 * career, side-by-side. Entry: "Career Comparison" button on the player
 * profile. URL: /career/:playerId
 *
 * Shipped Nov 26 (#28 Traditional tab, #29 Advanced tab added same day).
 * Each season reads from `player.career.seasons` (an array produced by
 * `transform_player_career.py`). Season headers (year/team/age) are
 * rendered once at the top of each tab's table and stay aligned across
 * tabs so switching tabs feels like transposing, not reflowing.
 *
 * Hustle tab is planned as a third tab once historical hustle data is
 * backfilled — see post-launch-followups.md #29 part 2.
 */

// Traditional stats — the Nov 26 V1 ship. Context + counting + shooting.
const TRADITIONAL_STATS = [
  // Context — no pctile color (GP/MPG are role metrics, not performance)
  { key: 'gp',       label: 'GP',    format: 'int'  },
  { key: 'min',      label: 'MPG',   format: 'num1', thinDivider: true },
  // Counting
  { key: 'pts',      label: 'PTS',   format: 'num1', divider: true, pctile: true },
  { key: 'reb',      label: 'REB',   format: 'num1',                pctile: true },
  { key: 'ast',      label: 'AST',   format: 'num1',                pctile: true },
  { key: 'stl',      label: 'STL',   format: 'num1',                pctile: true },
  { key: 'blk',      label: 'BLK',   format: 'num1',                pctile: true },
  { key: 'tov',      label: 'TOV',   format: 'num1',                pctile: true },
  // Shooting splits
  { key: 'fg_pct',   label: 'FG%',   format: 'pct',  divider: true, pctile: true },
  { key: 'fg3_pct',  label: '3P%',   format: 'pct',                 pctile: true },
  { key: 'ft_pct',   label: 'FT%',   format: 'pct',                 pctile: true },
  { key: 'ts_pct',   label: 'TS%',   format: 'pct',                 pctile: true },
  { key: 'efg_pct',  label: 'eFG%',  format: 'pct',                 pctile: true },
]

// Advanced stats — Nov 26 #29. Mirrors the Player Stats > Advanced
// "Overall Efficiency" section. All 8 get pctile coloring (TOV% inverted
// upstream in transform_player_career.py, so no invert here). Order matches
// the Player Stats table left-to-right for vocabulary consistency across
// the site.
//
// Data sources (see transform_player_career.py):
//   REB%, AST%, TOV%, eFG%, TS% — from NBA.com's Advanced league pool
//   STL%, BLK%                  — computed via BBR formula from Base + team pools
//   FTr                         — computed as FTA/FGA from Base pool
const ADVANCED_STATS = [
  // Context — same two rows that lead off Traditional; useful here too
  // for reading role growth year-over-year alongside the rate stats.
  { key: 'gp',       label: 'GP',    format: 'int'  },
  { key: 'min',      label: 'MPG',   format: 'num1', thinDivider: true },
  { key: 'reb_pct',  label: 'REB%',  format: 'pct',    pctile: true },
  { key: 'ast_pct',  label: 'AST%',  format: 'pct',    pctile: true },
  { key: 'stl_pct',  label: 'STL%',  format: 'pct',    pctile: true },
  { key: 'blk_pct',  label: 'BLK%',  format: 'pct',    pctile: true },
  { key: 'tov_pct',  label: 'TOV%',  format: 'pct',    pctile: true },
  { key: 'efg_pct',  label: 'eFG%',  format: 'pct',    pctile: true },
  { key: 'ts_pct',   label: 'TS%',   format: 'pct',    pctile: true },
  { key: 'fta_rate', label: 'FTr',   format: 'num3',   pctile: true },
]

// Hustle stats — Nov 26 #29 part 2. Mirrors the player profile's Hustle
// tab. All 11 stats are more=better (no invert). Order matches the profile
// view where possible.
//
// Pre-2015-16 wrinkle: NBA.com started tracking hustle in 2015-16, so a
// player's earlier seasons have no hustle data at all. Those season entries
// carry `hustle_available: false` from the transform, and the CareerStatsTable
// renders those cells as "n/a" (styled subtly, distinct from the "—" used
// for "data exists but didn't qualify").
const HUSTLE_STATS = [
  // Context — always rendered even for pre-2015-16 seasons (ignoreNa:
  // true), since GP/MPG come from PlayerCareerStats regardless of whether
  // NBA.com tracked hustle that year.
  { key: 'gp',       label: 'GP',    format: 'int',             ignoreNa: true },
  { key: 'min',      label: 'MPG',   format: 'num1', thinDivider: true, ignoreNa: true },
  { key: 'contested_shots',      label: 'Contested Shots',  format: 'num1', pctile: true },
  { key: 'contested_shots_2pt',  label: 'Contested 2PT',    format: 'num1', pctile: true },
  { key: 'contested_shots_3pt',  label: 'Contested 3PT',    format: 'num1', pctile: true },
  { key: 'box_outs',             label: 'Box Outs',         format: 'num1', pctile: true },
  { key: 'pct_box_outs_off',     label: 'Off. Box Out %',   format: 'pct',  pctile: true },
  { key: 'pct_box_outs_def',     label: 'Def. Box Out %',   format: 'pct',  pctile: true },
  { key: 'screen_assists',       label: 'Screen Assists',   format: 'num1', pctile: true },
  { key: 'screen_ast_pts',       label: 'Screen Ast PTS',   format: 'num1', pctile: true },
  { key: 'charges_drawn',        label: 'Charges Drawn',    format: 'num1', pctile: true },
  { key: 'deflections',          label: 'Deflections',      format: 'num1', pctile: true },
  { key: 'loose_balls_recovered', label: 'Loose Balls Rec.', format: 'num1', pctile: true },
]

// Mirror of colorForPctile() in PlayerStatsTable.jsx — keep in sync. The pctile
// value is already upstream-inverted for stats where lower = better (TOV), so we
// don't invert here. Returns a CSS rgb() string, or 'transparent' for missing.
// Blue = 0th percentile, mid-grey = 50th, Hawks red = 100th.
function colorForPctile(pctile) {
  if (pctile == null) return 'transparent'
  const BLUE = [63, 81, 181]
  const MID  = [138, 130, 144]
  const RED  = [200, 16, 46]
  const [r1, g1, b1] = pctile <= 0.5 ? BLUE : MID
  const [r2, g2, b2] = pctile <= 0.5 ? MID  : RED
  const t = pctile <= 0.5 ? pctile * 2 : (pctile - 0.5) * 2
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function fmt(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  if (format === 'pct')  return `${(value * 100).toFixed(1)}%`
  if (format === 'num3') return Number(value).toFixed(3)
  if (format === 'int')  return `${Math.round(value)}`
  return Number(value).toFixed(1)
}

/**
 * Renders the stat table for one tab — season header row + one row per
 * stat. Both Traditional and Advanced tabs use this component so the
 * season header always looks identical and tab switching feels like
 * transposition rather than reflowing.
 */
function CareerStatsTable({ seasons, stats, gridCols, naChecker }) {
  return (
    <div className="career-table">
      {/* Season header row — year / team / age */}
      <div
        className="career-row career-row-header"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="career-label-cell" />
        {seasons.map((s) => (
          <div key={s.season} className="career-season-cell">
            <div className="career-season-year">{s.season}</div>
            <div className="career-season-team">{s.team}</div>
            {s.age != null && (
              <div className="career-season-age">Age {s.age}</div>
            )}
          </div>
        ))}
      </div>

      {/* Stat rows */}
      {stats.map((stat) => (
        <Fragment key={stat.key}>
          {stat.divider && (
            <div
              className="career-divider"
              style={{ gridColumn: `1 / span ${seasons.length + 1}` }}
            />
          )}
          {stat.thinDivider && (
            <div
              className="career-divider-thin"
              style={{ gridColumn: `1 / span ${seasons.length + 1}` }}
            />
          )}
          <div
            className="career-row"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="career-label-cell">{stat.label}</div>
            {seasons.map((s) => {
              // Hustle-tab-specific: pre-2015-16 seasons get an 'n/a' cell
              // instead of '—', since the stat genuinely didn't exist.
              // Context stats (GP, MPG) carry ignoreNa:true because they
              // come from PlayerCareerStats, not the hustle endpoint — they
              // exist regardless of what NBA.com tracked that year.
              const isNa = naChecker && !stat.ignoreNa ? naChecker(s) : false
              if (isNa) {
                return (
                  <div key={s.season} className="career-value-cell career-value-cell-na">
                    <div className="career-value-num">n/a</div>
                  </div>
                )
              }
              const pctile = stat.pctile ? s[`${stat.key}_pctile`] : null
              const bg = stat.pctile ? colorForPctile(pctile) : undefined
              return (
                <div
                  key={s.season}
                  className="career-value-cell"
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  <div className="career-value-num">{fmt(s[stat.key], stat.format)}</div>
                  {stat.pctile && pctile != null && (
                    <div className="career-value-pctile">{Math.round(pctile * 100)}</div>
                  )}
                </div>
              )
            })}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export default function CareerPage({ playerData }) {
  const { playerId } = useParams()
  const player = playerData?.players?.find(
    (p) => String(p.id) === String(playerId)
  )

  // Unknown player id → bounce to the players list
  if (!player) return <Navigate to="/players" replace />

  const seasons = player.career?.seasons || []

  if (seasons.length === 0) {
    return (
      <div className="career-page">
        <div className="career-header">
          <Link to={`/players/${player.id}`} className="career-back">
            ← Back to {player.name}'s profile
          </Link>
          <h1>{player.name} — Career</h1>
          <p className="career-empty">
            No career-season data available for this player yet. (The daily
            pipeline populates it; if it's missing after tomorrow's refresh,
            something's off.)
          </p>
        </div>
      </div>
    )
  }

  // Grid: a fixed-width label column + one column per season.
  // Set inline so the grid responds to how many seasons the player has
  // (anywhere from 1 to a 20+-year career). Hustle gets a wider label
  // column because its stat names are longer ("Contested Shots", "Loose
  // Balls Rec.", "Off. Box Out %") and wrap to two lines at the narrower
  // Traditional/Advanced width.
  const makeGridCols = (labelWidth) =>
    `${labelWidth}px repeat(${seasons.length}, minmax(72px, 1fr))`
  const gridCols       = makeGridCols(100)
  const hustleGridCols = makeGridCols(160)

  return (
    <div className="career-page">
      <div className="career-header">
        <Link to={`/players/${player.id}`} className="career-back">
          ← Back to {player.name}'s profile
        </Link>
        <h1>{player.name} — Career</h1>
        <p className="career-subtitle">
          {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'} ·
          per-game averages ·
          regular season
        </p>
      </div>

      <Tabs
        tabs={[
          {
            key: 'traditional',
            label: 'Traditional',
            content: (
              <CareerStatsTable
                seasons={seasons}
                stats={TRADITIONAL_STATS}
                gridCols={gridCols}
              />
            ),
          },
          {
            key: 'advanced',
            label: 'Advanced',
            content: (
              <CareerStatsTable
                seasons={seasons}
                stats={ADVANCED_STATS}
                gridCols={gridCols}
              />
            ),
          },
          {
            key: 'hustle',
            label: 'Hustle',
            content: (
              <CareerStatsTable
                seasons={seasons}
                stats={HUSTLE_STATS}
                gridCols={hustleGridCols}
                naChecker={(s) => s.hustle_available === false}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
