/**
 * Hustle page — Contests, Box Outs, Screens, Misc.
 * See claude/advanced-stats-plan.md for the full spec.
 *
 * Data source: `league_leaderboards-<SEASON>.json` (hustle sub-block has all
 * 11 fields after the Nov 3 transform amendment) + hawksData.player.hustle.
 */

import { useEffect, useState } from 'react'
import AdvancedPage from './AdvancedPage'

// Shape adapter: Hawks data nests under player.hustle.<field>.value;
// League data has player.hustle.<field> directly.
function extract(player, field) {
  const raw = player.hustle?.[field]
  if (raw == null) return null
  return typeof raw === 'object' ? raw.value : raw
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num = (v) => (v == null ? '—' : Number(v).toFixed(1))

// ─── Scatter plot configs (4) ─────────────────────────────────
const SCATTER_CONFIGS = [
  {
    title: 'Contested 3PT × Contested 2PT',
    description: 'Upper-right = contests a lot of both perimeter and interior shots.',
    xLabel: 'Contested 3PT', yLabel: 'Contested 2PT',
    extractX: (p) => extract(p, 'contested_shots_3pt'),
    extractY: (p) => extract(p, 'contested_shots_2pt'),
    xFormat: num,
    yFormat: num,
    minMinutes: 100,
  },
  {
    title: 'Loose Balls Recovered × Deflections',
    description: 'Upper-right = disruption engine — tips passes AND dives for the ball.',
    xLabel: 'Loose Balls Recovered', yLabel: 'Deflections',
    extractX: (p) => extract(p, 'loose_balls_recovered'),
    extractY: (p) => extract(p, 'deflections'),
    xFormat: num,
    yFormat: num,
    minMinutes: 100,
  },
  {
    title: 'Deflections × Contested Shots',
    description: 'Upper-right = defensive menace: contesting shots AND tipping passes.',
    xLabel: 'Deflections', yLabel: 'Contested Shots',
    extractX: (p) => extract(p, 'deflections'),
    extractY: (p) => extract(p, 'contested_shots'),
    xFormat: num,
    yFormat: num,
    minMinutes: 100,
  },
]

// ─── Toggle configs (4) ───────────────────────────────────────
const TOGGLE_CONFIGS = [
  {
    key: 'contests',
    label: 'Contests',
    hawksStats: [
      { key: 'contested_shots',     label: 'Contested',      extract: (p) => extract(p, 'contested_shots'),     format: num },
      { key: 'contested_shots_2pt', label: 'Contested 2PT',  extract: (p) => extract(p, 'contested_shots_2pt'), format: num },
      { key: 'contested_shots_3pt', label: 'Contested 3PT',  extract: (p) => extract(p, 'contested_shots_3pt'), format: num },
    ],
  },
  {
    key: 'box_outs',
    label: 'Box Outs',
    hawksStats: [
      { key: 'box_outs',         label: 'Box Outs',          extract: (p) => extract(p, 'box_outs'),         format: num },
      { key: 'pct_box_outs_off', label: 'Pct Box Outs Off',  extract: (p) => extract(p, 'pct_box_outs_off'), format: pct },
      { key: 'pct_box_outs_def', label: 'Pct Box Outs Def',  extract: (p) => extract(p, 'pct_box_outs_def'), format: pct },
    ],
  },
  {
    key: 'screens',
    label: 'Screens',
    hawksStats: [
      { key: 'screen_assists', label: 'Screen Assists', extract: (p) => extract(p, 'screen_assists'), format: num },
      { key: 'screen_ast_pts', label: 'Screen Ast PTS', extract: (p) => extract(p, 'screen_ast_pts'), format: num },
    ],
  },
  {
    key: 'misc',
    label: 'Misc.',
    hawksStats: [
      { key: 'deflections',            label: 'Deflections',    extract: (p) => extract(p, 'deflections'),            format: num },
      { key: 'charges_drawn',          label: 'Charges Drawn',  extract: (p) => extract(p, 'charges_drawn'),          format: num },
      { key: 'loose_balls_recovered',  label: 'Loose Balls',    extract: (p) => extract(p, 'loose_balls_recovered'),  format: num },
    ],
  },
]

export default function HustlePage({ playerData, season }) {
  const [leagueData, setLeagueData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!season) return
    setLeagueData(null)
    setError(null)
    fetch(`/league_leaderboards-${season}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setLeagueData)
      .catch((e) => setError(e.message))
  }, [season])

  if (error) return <div className="advanced-placeholder"><p>Error loading hustle data: {error}</p></div>
  if (!leagueData || !playerData) return <div className="advanced-placeholder"><p>Loading…</p></div>

  return (
    <AdvancedPage
      title="Hustle"
      subtitle="Contests, box outs, screens, and misc. effort stats"
      hawksPlayers={playerData.players}
      leagueData={leagueData}
      scatterConfigs={SCATTER_CONFIGS}
      toggleConfigs={TOGGLE_CONFIGS}
      leagueMinMinutes={100}
    />
  )
}
