/**
 * Defense page — Contested Shots, DFG% Allowed, Disruption.
 * See claude/advanced-stats-plan.md for the full spec.
 *
 * Pulls data from TWO league files and merges them by player id:
 *   - league_defense_tracking (DFG% / normal_fg_pct / d_fga / d_fgm)
 *   - league_leaderboards     (hustle: contested_shots, deflections,
 *                              loose_balls_recovered, charges_drawn)
 * The merge gives each league player a `defense` block AND a `hustle` block,
 * matching the Hawks shape used by the extract adapter below.
 */

import { useEffect, useState } from 'react'
import AdvancedPage from './AdvancedPage'

// Shape adapter: Hawks data nests under player.defense_tracking.<field>.value
// and player.hustle.<field>.value. League (merged) data has player.defense.<field>
// and player.hustle.<field> directly. This handles both.
function extract(player, block, field) {
  // Hawks "defense tracking" lives under defense_tracking, but on the league
  // merged shape it lives under `defense` — translate on lookup.
  const blockObj =
    block === 'defense'
      ? (player.defense_tracking ?? player.defense)
      : player[block] // hustle
  const raw = blockObj?.[field]
  if (raw == null) return null
  return typeof raw === 'object' ? raw.value : raw
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num = (v) => (v == null ? '—' : Number(v).toFixed(1))

// ─── Scatter plot configs (3) ─────────────────────────────────
const SCATTER_CONFIGS = [
  {
    title: 'Contested Shots × DFG% +/- vs Norm',
    description:
      'Upper-right = contests many shots AND holds opponents below their season norm. ' +
      'X-axis is inverted because negative DFG+/- is good (opponent shoots worse than usual).',
    xLabel: 'DFG% +/- vs Norm', yLabel: 'Contested Shots',
    xInvert: true,
    extractX: (p) => extract(p, 'defense', 'pct_plusminus'),
    extractY: (p) => extract(p, 'hustle', 'contested_shots'),
    xFormat: (v) => (v == null ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%'),
    yFormat: num,
    minMinutes: 100,
  },
  {
    title: 'Contested Shots × Defensive FG% Allowed',
    description:
      'Upper-right = contests a lot of shots AND holds shooters below their norm. ' +
      'X-axis is inverted so "best" is still upper-right.',
    xLabel: 'DFG% Allowed', yLabel: 'Contested Shots',
    xInvert: true,
    extractX: (p) => extract(p, 'defense', 'd_fg_pct'),
    extractY: (p) => extract(p, 'hustle', 'contested_shots'),
    xFormat: pct,
    yFormat: num,
    minMinutes: 100,
  },
  {
    title: 'Deflections × Loose Balls Recovered',
    description: 'Upper-right = high-disruption, high-effort defender.',
    xLabel: 'Deflections', yLabel: 'Loose Balls Recovered',
    extractX: (p) => extract(p, 'hustle', 'deflections'),
    extractY: (p) => extract(p, 'hustle', 'loose_balls_recovered'),
    xFormat: num,
    yFormat: num,
    minMinutes: 100,
  },
]

// ─── Toggle configs (3) ───────────────────────────────────────
const TOGGLE_CONFIGS = [
  {
    key: 'contested',
    label: 'Contested Shots',
    hawksStats: [
      { key: 'contested_shots',     label: 'Contested',   extract: (p) => extract(p, 'hustle', 'contested_shots'),      format: num },
      { key: 'contested_shots_2pt', label: 'Contested 2P', extract: (p) => extract(p, 'hustle', 'contested_shots_2pt'),  format: num },
      { key: 'contested_shots_3pt', label: 'Contested 3P', extract: (p) => extract(p, 'hustle', 'contested_shots_3pt'),  format: num },
    ],
  },
  {
    key: 'dfg',
    label: 'DFG% Allowed',
    hawksStats: [
      { key: 'd_fg_pct',       label: 'DFG%',          extract: (p) => extract(p, 'defense', 'd_fg_pct'),       format: pct, lowerIsBetter: true },
      { key: 'normal_fg_pct',  label: 'Normal FG%',    extract: (p) => extract(p, 'defense', 'normal_fg_pct'),  format: pct },
      { key: 'pct_plusminus',  label: 'DFG± vs Norm',  extract: (p) => extract(p, 'defense', 'pct_plusminus'),  format: pct, lowerIsBetter: true },
      { key: 'd_fga',          label: 'DFGA',          extract: (p) => extract(p, 'defense', 'd_fga'),          format: num },
      { key: 'd_fgm',          label: 'DFGM',          extract: (p) => extract(p, 'defense', 'd_fgm'),          format: num },
    ],
  },
  {
    key: 'disruption',
    label: 'Disruption',
    hawksStats: [
      { key: 'deflections',           label: 'Deflections',    extract: (p) => extract(p, 'hustle', 'deflections'),           format: num },
      { key: 'loose_balls_recovered', label: 'Loose Balls',    extract: (p) => extract(p, 'hustle', 'loose_balls_recovered'), format: num },
      { key: 'charges_drawn',         label: 'Charges Drawn',  extract: (p) => extract(p, 'hustle', 'charges_drawn'),         format: num },
    ],
  },
]

export default function DefensePage({ playerData, season }) {
  const [defenseFile, setDefenseFile] = useState(null)
  const [leaderboardsFile, setLeaderboardsFile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!season) return
    setDefenseFile(null)
    setLeaderboardsFile(null)
    setError(null)

    // Fetch both files in parallel.
    Promise.all([
      fetch(`/league_defense_tracking-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`defense: HTTP ${r.status}`)
        return r.json()
      }),
      fetch(`/league_leaderboards-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`leaderboards: HTTP ${r.status}`)
        return r.json()
      }),
    ])
      .then(([def, lb]) => {
        setDefenseFile(def)
        setLeaderboardsFile(lb)
      })
      .catch((e) => setError(e.message))
  }, [season])

  if (error) return <div className="advanced-placeholder"><p>Error loading defense data: {error}</p></div>
  if (!defenseFile || !leaderboardsFile || !playerData) {
    return <div className="advanced-placeholder"><p>Loading…</p></div>
  }

  // Merge: for each defense-tracking player, attach the hustle block from
  // leaderboards. The defense-tracking file is the base because it has the
  // minutes floor we filter against — leaderboards' hustle fields are joined
  // on by player id.
  const hustleById = new Map(
    leaderboardsFile.players.map((p) => [p.id, p.hustle || {}])
  )
  const mergedPlayers = defenseFile.players.map((p) => ({
    ...p,
    hustle: hustleById.get(p.id) || {},
  }))
  const leagueData = { ...defenseFile, players: mergedPlayers }

  return (
    <AdvancedPage
      title="Defense"
      subtitle="Contested shots, defensive FG% allowed, disruption"
      hawksPlayers={playerData.players}
      leagueData={leagueData}
      scatterConfigs={SCATTER_CONFIGS}
      toggleConfigs={TOGGLE_CONFIGS}
      leagueMinMinutes={100}
    />
  )
}
