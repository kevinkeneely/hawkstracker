/**
 * Shooting page — Catch & Shoot / Pull-Up / Contested / Uncontested splits.
 * See claude/advanced-stats-plan.md for the full spec.
 */

import { useEffect, useState } from 'react'
import AdvancedPage from './AdvancedPage'

// Shape adapter: Hawks data nests under player.shooting_tracking.<sub>.<field>.value;
// League data has player.<sub>.<field> directly. This handles both.
function extract(player, subBlock, field) {
  const block = player.shooting_tracking?.[subBlock] ?? player[subBlock]
  const raw = block?.[field]
  if (raw == null) return null
  return typeof raw === 'object' ? raw.value : raw
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num = (v) => (v == null ? '—' : Number(v).toFixed(1))

// ─── Scatter plot configs (3) ─────────────────────────────────
// Each config's extractX/extractY picks the right field from either shape.
const SCATTER_CONFIGS = [
  // PPG × TS% leads: it's the headline overall-scoring view people reach
  // for first. The shot-type splits (C&S, pull-up, contested, uncontested)
  // follow, then the top-level efficiency pair (Rim × 3P%).
  {
    title: 'PPG × TS%',
    description: 'Upper-right = heavy, efficient scorer (volume + true shooting).',
    xLabel: 'PPG', yLabel: 'TS%',
    extractX: (p) => p.ppg ?? null,
    extractY: (p) => p.ts_pct ?? null,
    xFormat: num,
    yFormat: pct,
    minMinutes: 100,
  },
  {
    title: 'Catch & Shoot 3P% × Catch & Shoot 3PA',
    description: 'Upper-right = high-volume efficient C&S shooter.',
    xLabel: 'C&S 3PA', yLabel: 'C&S 3P%',
    extractX: (p) => extract(p, 'cs', 'fg3a'),
    extractY: (p) => extract(p, 'cs', 'fg3_pct'),
    xFormat: num,
    yFormat: pct,
    minVolume: 25,
  },
  {
    title: 'Pull-Up 3P% × Pull-Up 3PA',
    description: 'Upper-right = high-volume efficient pull-up shooter.',
    xLabel: 'Pull-Up 3PA', yLabel: 'Pull-Up 3P%',
    extractX: (p) => extract(p, 'pullup', 'fg3a'),
    extractY: (p) => extract(p, 'pullup', 'fg3_pct'),
    xFormat: num,
    yFormat: pct,
    minVolume: 10,
  },
  {
    title: 'Contested FG% × Contested FGA',
    description: 'Upper-right = high-volume efficient contested shooter.',
    xLabel: 'Contested FGA', yLabel: 'Contested FG%',
    extractX: (p) => extract(p, 'contested', 'fga'),
    extractY: (p) => extract(p, 'contested', 'fg_pct'),
    xFormat: num,
    yFormat: pct,
    minVolume: 25,
  },
  {
    title: 'Uncontested FG% × Uncontested FGA',
    description: 'Upper-right = high-volume efficient uncontested shooter.',
    xLabel: 'Uncontested FGA', yLabel: 'Uncontested FG%',
    extractX: (p) => extract(p, 'uncontested', 'fga'),
    extractY: (p) => extract(p, 'uncontested', 'fg_pct'),
    xFormat: num,
    yFormat: pct,
    minVolume: 25,
  },
  // ─── Migrated from the former standalone Scatter Plots tab ───────
  // These use top-level season stats (ppg, ts_pct, fg3_pct, rim_pct)
  // added to league_leaderboards by the Nov 3 pipeline amendment,
  // not the shooting-tracking splits used by the four scatters above.
  {
    title: 'Rim FG% × 3P%',
    description: 'Upper-right = efficient at the rim AND from three.',
    xLabel: '3P%', yLabel: 'Rim FG%',
    extractX: (p) => p.fg3_pct ?? null,
    extractY: (p) => p.zones?.at_rim?.pct ?? null,
    xFormat: pct,
    yFormat: pct,
    minMinutes: 100,
  },
]

// ─── Toggle configs (4) ───────────────────────────────────────
// Each toggle has leaderboards for the 7 shooting fields in that sub-block.
function buildStats(subBlock) {
  return [
    { key: `${subBlock}_fga`,     label: 'FGA',        extract: (p) => extract(p, subBlock, 'fga'),     format: num },
    { key: `${subBlock}_fgm`,     label: 'FGM',        extract: (p) => extract(p, subBlock, 'fgm'),     format: num },
    { key: `${subBlock}_fg_pct`,  label: 'FG%',        extract: (p) => extract(p, subBlock, 'fg_pct'),  format: pct },
    { key: `${subBlock}_efg_pct`, label: 'eFG%',       extract: (p) => extract(p, subBlock, 'efg_pct'), format: pct },
    { key: `${subBlock}_fg3a`,    label: '3PA',        extract: (p) => extract(p, subBlock, 'fg3a'),    format: num },
    { key: `${subBlock}_fg3m`,    label: '3PM',        extract: (p) => extract(p, subBlock, 'fg3m'),    format: num },
    { key: `${subBlock}_fg3_pct`, label: '3P%',        extract: (p) => extract(p, subBlock, 'fg3_pct'), format: pct },
  ]
}

const TOGGLE_CONFIGS = [
  { key: 'cs',           label: 'Catch & Shoot', hawksStats: buildStats('cs') },
  { key: 'pullup',       label: 'Pull-Up',       hawksStats: buildStats('pullup') },
  { key: 'contested',    label: 'Contested',     hawksStats: buildStats('contested') },
  { key: 'uncontested',  label: 'Uncontested',   hawksStats: buildStats('uncontested') },
]

export default function ShootingPage({ playerData, season }) {
  const [leagueData, setLeagueData] = useState(null)
  const [error, setError] = useState(null)

  const [leaderboardsFile, setLeaderboardsFile] = useState(null)

  useEffect(() => {
    if (!season) return
    setLeagueData(null)
    setLeaderboardsFile(null)
    // Fetch both files in parallel. The tracking file has the sport-specific
    // splits; the leaderboards file carries the top-level season stats
    // (ppg, ts_pct, fg3_pct, ast_pct, tov_pct, zones) used by scatters
    // migrated from the former Scatter Plots tab.
    Promise.all([
      fetch(`/league_shooting_tracking-${season}.json`).then((r) => {
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

  if (error) return <div className="advanced-placeholder"><p>Error loading shooting data: {error}</p></div>
  if (!leagueData || !leaderboardsFile || !playerData) return <div className="advanced-placeholder"><p>Loading…</p></div>

  // Merge: attach top-level stats + zones from leaderboards onto each
  // player in the tracking file by id, for scatters migrated from the
  // former Scatter Plots tab. Also carry min_total through so the
  // minMinutes floor passes for migrated scatters.
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
      title="Shooting"
      subtitle="Catch & Shoot, Pull-Up, Contested, Uncontested splits"
      hawksPlayers={playerData.players}
      leagueData={mergedLeagueData}
      scatterConfigs={SCATTER_CONFIGS}
      toggleConfigs={TOGGLE_CONFIGS}
    />
  )
}
