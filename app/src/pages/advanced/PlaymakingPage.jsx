/**
 * Playmaking page — Drives, Passing, Touches (possessions).
 * See claude/advanced-stats-plan.md for the full spec.
 *
 * Data source: league_playmaking_tracking-<SEASON>.json (one merged file
 * with drives, passing, and possessions sub-blocks per player) + Hawks
 * players' player.playmaking_tracking blocks from hawksData.
 */

import { useEffect, useState } from 'react'
import AdvancedPage from './AdvancedPage'

// Shape adapter: Hawks data nests under player.playmaking_tracking.<sub>.<field>.value;
// League data has player.<sub>.<field> directly. This handles both.
function extract(player, subBlock, field) {
  const block = player.playmaking_tracking?.[subBlock] ?? player[subBlock]
  const raw = block?.[field]
  if (raw == null) return null
  return typeof raw === 'object' ? raw.value : raw
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num = (v) => (v == null ? '—' : Number(v).toFixed(1))

// ─── Scatter plot configs (6) ─────────────────────────────────
const SCATTER_CONFIGS = [
  {
    title: 'Drive PTS × Drive AST',
    description: 'Upper-right = elite driver who also passes off the drive.',
    xLabel: 'Drive PTS', yLabel: 'Drive AST',
    extractX: (p) => extract(p, 'drives', 'drive_pts'),
    extractY: (p) => extract(p, 'drives', 'drive_ast'),
    xFormat: num,
    yFormat: num,
    extractRate: (p) => extract(p, 'drives', 'drives'),
    minRate: 2.5,
    minMinutes: 100,
  },
  {
    title: 'Drive PTS × Drive FG%',
    description: 'Upper-right = efficient high-volume driving scorer.',
    xLabel: 'Drive PTS', yLabel: 'Drive FG%',
    extractX: (p) => extract(p, 'drives', 'drive_pts'),
    extractY: (p) => extract(p, 'drives', 'drive_fg_pct'),
    xFormat: num,
    yFormat: pct,
    extractRate: (p) => extract(p, 'drives', 'drives'),
    minRate: 2.5,
    minMinutes: 100,
  },
  {
    title: 'Drive TOV × Drive AST',
    description: 'Upper-right = high-AST, low-TOV driver. X-axis inverted so fewer turnovers show on the right.',
    xLabel: 'Drive TOV', yLabel: 'Drive AST',
    xInvert: true,
    extractX: (p) => extract(p, 'drives', 'drive_tov'),
    extractY: (p) => extract(p, 'drives', 'drive_ast'),
    xFormat: num,
    yFormat: num,
    extractRate: (p) => extract(p, 'drives', 'drives'),
    minRate: 2.5,
    minMinutes: 100,
  },
  {
    title: 'Touches × Points per Touch',
    description: 'Upper-right = tons of touches AND efficient scoring per touch.',
    xLabel: 'Touches', yLabel: 'Pts per Touch',
    extractX: (p) => extract(p, 'possessions', 'touches'),
    extractY: (p) => extract(p, 'possessions', 'pts_per_touch'),
    xFormat: num,
    yFormat: num,
    minMinutes: 100,
  },
  // ─── Migrated from the former standalone Scatter Plots tab ───────
  // Uses top-level ast_pct / tov_pct added to league_leaderboards by the
  // Nov 3 pipeline amendment. X-axis is inverted so lower-TOV stays on the
  // right (upper-right = clean creator: low TOV, high AST).
  {
    title: 'AST% × TOV%',
    description: 'Upper-right = clean creator (low TOV, high AST). X-axis inverted so lower TOV is to the right.',
    xLabel: 'TOV%', yLabel: 'AST%',
    xInvert: true,
    extractX: (p) => p.tov_pct ?? null,
    extractY: (p) => p.ast_pct ?? null,
    xFormat: pct,
    yFormat: pct,
    minMinutes: 100,
  },
]

// ─── Toggle configs (3) ───────────────────────────────────────
const TOGGLE_CONFIGS = [
  {
    key: 'drives',
    label: 'Drives',
    hawksStats: [
      { key: 'drives',        label: 'Drives',       extract: (p) => extract(p, 'drives', 'drives'),        format: num },
      { key: 'drive_pts',     label: 'Drive PTS',    extract: (p) => extract(p, 'drives', 'drive_pts'),     format: num },
      { key: 'drive_ast',     label: 'Drive AST',    extract: (p) => extract(p, 'drives', 'drive_ast'),     format: num },
      { key: 'drive_fg_pct',  label: 'Drive FG%',    extract: (p) => extract(p, 'drives', 'drive_fg_pct'),  format: pct },
      { key: 'drive_tov',     label: 'Drive TOV',    extract: (p) => extract(p, 'drives', 'drive_tov'),     format: num, lowerIsBetter: true },
    ],
  },
  {
    key: 'passing',
    label: 'Passing',
    hawksStats: [
      { key: 'passes_made',         label: 'Passes Made',       extract: (p) => extract(p, 'passing', 'passes_made'),         format: num },
      { key: 'passes_received',     label: 'Passes Received',   extract: (p) => extract(p, 'passing', 'passes_received'),     format: num },
      { key: 'potential_ast',       label: 'Potential AST',     extract: (p) => extract(p, 'passing', 'potential_ast'),       format: num },
      { key: 'ast_points_created',  label: 'AST Points Created', extract: (p) => extract(p, 'passing', 'ast_points_created'), format: num },
    ],
  },
  {
    key: 'touches',
    label: 'Touches',
    hawksStats: [
      { key: 'touches',         label: 'Touches',         extract: (p) => extract(p, 'possessions', 'touches'),         format: num },
      { key: 'pts_per_touch',   label: 'Pts per Touch',   extract: (p) => extract(p, 'possessions', 'pts_per_touch'),   format: num },
      { key: 'elbow_touches',   label: 'Elbow Touches',   extract: (p) => extract(p, 'possessions', 'elbow_touches'),   format: num },
      { key: 'post_touches',    label: 'Post Touches',    extract: (p) => extract(p, 'possessions', 'post_touches'),    format: num },
      { key: 'paint_touches',   label: 'Paint Touches',   extract: (p) => extract(p, 'possessions', 'paint_touches'),   format: num },
    ],
  },
]

export default function PlaymakingPage({ playerData, season }) {
  const [leagueData, setLeagueData] = useState(null)
  const [error, setError] = useState(null)

  const [leaderboardsFile, setLeaderboardsFile] = useState(null)

  useEffect(() => {
    if (!season) return
    setLeagueData(null)
    setLeaderboardsFile(null)
    setError(null)
    Promise.all([
      fetch(`/league_playmaking_tracking-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`tracking: HTTP ${r.status}`)
        return r.json()
      }),
      fetch(`/league_leaderboards-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`leaderboards: HTTP ${r.status}`)
        return r.json()
      }),
    ])
      .then(([track, lb]) => {
        setLeagueData(track)
        setLeaderboardsFile(lb)
      })
      .catch((e) => setError(e.message))
  }, [season])

  if (error) return <div className="advanced-placeholder"><p>Error loading playmaking data: {error}</p></div>
  if (!leagueData || !leaderboardsFile || !playerData) return <div className="advanced-placeholder"><p>Loading…</p></div>

  // Merge leaderboards top-level fields onto playmaking tracking players
  // for the migrated AST% × TOV% scatter.
  const extraById = new Map(
    leaderboardsFile.players.map((p) => [p.id, p])
  )
  const mergedPlayers = leagueData.players.map((p) => {
    const extra = extraById.get(p.id)
    if (!extra) return p
    return {
      ...p,
      ppg:       extra.ppg       ?? p.ppg,
      ts_pct:    extra.ts_pct    ?? p.ts_pct,
      fg3_pct:   extra.fg3_pct   ?? p.fg3_pct,
      ast_pct:   extra.ast_pct   ?? p.ast_pct,
      tov_pct:   extra.tov_pct   ?? p.tov_pct,
      zones:     extra.zones     ?? p.zones,
      min_total: extra.min_total ?? p.min_total,
    }
  })
  const mergedLeagueData = { ...leagueData, players: mergedPlayers }

  return (
    <AdvancedPage
      title="Playmaking"
      subtitle="Drives, passing, touches and possessions"
      hawksPlayers={playerData.players}
      leagueData={mergedLeagueData}
      scatterConfigs={SCATTER_CONFIGS}
      toggleConfigs={TOGGLE_CONFIGS}
      leagueMinMinutes={100}
    />
  )
}
