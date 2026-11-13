/**
 * Shared wrapper for all four Advanced pages (Shooting, Defense, Playmaking,
 * Hustle). Follows the design in claude/advanced-stats-plan.md:
 *
 *   - Toggle button row at top center. No toggle active on first load.
 *   - Scatter plot stack shown by default (when no toggle active).
 *   - When a toggle is clicked, scatter plots hide and Hawks + League
 *     leaderboards for that category show, along with a "Back to charts"
 *     link to return to the default view.
 *
 * Props:
 *   title           - page heading (e.g. "Shooting")
 *   subtitle        - short tagline shown under the title
 *   hawksPlayers    - Hawks players array (from hawksData.players)
 *   leagueData      - loaded league JSON { players: [...] }
 *   scatterConfigs  - array of ScatterConfig objects (see shape below)
 *   toggleConfigs   - array of { key, label, hawksStats, leagueStats } objects
 *
 * ScatterConfig shape:
 *   {
 *     title: "Catch & Shoot 3P% × Pull-Up 3P%",
 *     description: "Upper-right = elite at both",
 *     xLabel: "Pull-Up 3P%", yLabel: "C&S 3P%",
 *     xInvert: false, yInvert: false,  // optional
 *     extractX(player) → number|null,
 *     extractY(player) → number|null,
 *     format(v) → string,
 *   }
 *
 * ToggleConfig shape:
 *   {
 *     key: "cs",
 *     label: "Catch & Shoot",
 *     hawksStats:   [{ key, label, extract, format }, ...],  // used on Hawks tab
 *     leagueStats:  [{ key, label, extract, format }, ...],  // used on League tab
 *   }
 */

import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import AdvancedScatterPlot from '../../components/AdvancedScatterPlot'

// Section nav — lets the user move between the 4 Advanced sub-pages
// without going back to the main nav. Shown at the top of every Advanced
// page. Routes stay the same; only the visual tab is new.
const ADVANCED_SECTIONS = [
  { to: '/shooting',   label: 'Shooting'   },
  { to: '/defense',    label: 'Defense'    },
  { to: '/playmaking', label: 'Playmaking' },
  { to: '/hustle',     label: 'Hustle'     },
]

export default function AdvancedPage({
  title, subtitle,
  hawksPlayers, leagueData,
  scatterConfigs,
}) {
  const leaguePlayers = leagueData?.players || []

  // Team games played — derived from the max `gp` across every player on a
  // team. Used by the minGpPct floor below so the scatter filters scale
  // with the season: in November a player must have played ~5 games, in
  // April ~40. Memoized by leaguePlayers so we only walk the array once
  // per data load.
  const teamGpById = useMemo(() => {
    const m = new Map()
    for (const p of leaguePlayers) {
      if (!p.team) continue
      const prev = m.get(p.team) ?? 0
      if ((p.gp ?? 0) > prev) m.set(p.team, p.gp ?? 0)
    }
    return m
  }, [leaguePlayers])

  // Global league-player floors applied to every scatter on every Advanced
  // page. Individual scatter configs can override by setting these keys to
  // null (disable) or to their own values. This is how NBA.com's own
  // leaderboards qualify rotation players — mpg + % of team games.
  const DEFAULT_MIN_MPG = 15
  const DEFAULT_MIN_GP_PCT = 0.5

  // Pre-compute median x,y for every scatter config, used as the crosshair
  // Only computed once per page render (not per hover) so we don't re-sort
  // thousands of values on every interaction.
  const scatterData = useMemo(() => {
    return scatterConfigs.map(cfg => {
      // Player floor. Three kinds supported, all additive (all must pass):
      //   - minVolume: season-total count of a stat (e.g. "10 FGA all season").
      //     Volume per game × games played = season total. Uses extractVolume
      //     if set, else extractX.
      //   - minMinutes: season-total minutes played, read from p.min_total
      //     (added by the pipeline). Used on Defense where "100 minutes" is
      //     more meaningful than a per-stat shot count.
      //   - minRate: per-game rate floor (e.g. "2.5 drives/game"). Doesn't
      //     scale with games played — stays meaningful whether we're in
      //     game 10 or game 60. Uses extractRate if set, else extractX.
      const volumeFn = cfg.extractVolume || cfg.extractX
      const rateFn   = cfg.extractRate   || cfg.extractX
      // Resolve the effective mpg / gp% floors: scatter config wins over
      // the page-level default, and a scatter that explicitly sets either
      // to null opts out.
      const minMpg = cfg.minMpg === null
        ? null
        : (cfg.minMpg ?? DEFAULT_MIN_MPG)
      const minGpPct = cfg.minGpPct === null
        ? null
        : (cfg.minGpPct ?? DEFAULT_MIN_GP_PCT)

      const passesFloor = (p) => {
        if (cfg.minVolume != null) {
          const perGame = volumeFn(p)
          const gp = p.gp ?? 0
          if (perGame == null) return false
          if (perGame * gp < cfg.minVolume) return false
        }
        // minVolumes: array of {extract, floor} for scatters that need
        // more than one volume floor (e.g. Rim × 3P%: 20 Rim FGA AND 20
        // 3PA). Each extractor returns a SEASON TOTAL directly — not a
        // per-game value like extractVolume. Keeps the two systems
        // distinct so Rim FGA (already a total from shot zones) and
        // fga_total-style fields don't need to be re-divided.
        if (Array.isArray(cfg.minVolumes)) {
          for (const v of cfg.minVolumes) {
            const total = v.extract(p)
            if (total == null || total < v.floor) return false
          }
        }
        if (cfg.minMinutes != null) {
          const mins = p.min_total ?? 0
          if (mins < cfg.minMinutes) return false
        }
        if (cfg.minRate != null) {
          const perGame = rateFn(p)
          if (perGame == null) return false
          if (perGame < cfg.minRate) return false
        }
        // Rotation-player floor (NBA.com-style qualifier): must average at
        // least minMpg minutes per game AND have played at least minGpPct
        // (default 50%) of their team's games. Keeps the scatter free of
        // garbage-time contributors and tiny-sample players all season.
        if (minMpg != null) {
          const mpg = p.mpg ?? (p.gp ? (p.min_total ?? 0) / p.gp : 0)
          if (mpg < minMpg) return false
        }
        if (minGpPct != null) {
          const teamGp = teamGpById.get(p.team) ?? 0
          if (teamGp === 0) return false
          if ((p.gp ?? 0) / teamGp < minGpPct) return false
        }
        return true
      }
      const points = leaguePlayers
        .filter(passesFloor)
        .map(p => ({
          id: p.id,
          name: p.name,
          team: p.team,
          qualified: (p.gp ?? 0) >= 5,
          x: cfg.extractX(p),
          y: cfg.extractY(p),
        }))
      const xs = points.map(p => p.x).filter(v => v != null)
      const ys = points.map(p => p.y).filter(v => v != null)
      return {
        config: cfg,
        points,
        leagueMedians: {
          x: median(xs),
          y: median(ys),
        },
      }
    })
  }, [scatterConfigs, leaguePlayers, teamGpById])

  return (
    <div className="advanced-page">
      {/* Section nav — Shooting / Defense / Playmaking / Hustle. Replaces
          the per-page shot-type toggles and lets the user walk the 4
          Advanced sub-pages without going back to the main nav. */}
      <nav className="advanced-section-nav" aria-label="Advanced sections">
        {ADVANCED_SECTIONS.map((sec) => (
          <NavLink
            key={sec.to}
            to={sec.to}
            className={({ isActive }) =>
              `advanced-section-btn ${isActive ? 'active' : ''}`
            }
          >
            {sec.label}
          </NavLink>
        ))}
      </nav>

      <header className="advanced-page-header">
        <h2>{title}</h2>
        {subtitle && <p className="advanced-page-sub">{subtitle}</p>}
      </header>

      <div className="advanced-scatter-stack">
        {scatterData.map((item, i) => (
          <AdvancedScatterPlot
            key={i}
            title={item.config.title}
            description={item.config.description}
            players={item.points}
            leagueMedians={item.leagueMedians}
            xLabel={item.config.xLabel}
            yLabel={item.config.yLabel}
            xInvert={item.config.xInvert}
            yInvert={item.config.yInvert}
            xFormat={item.config.xFormat}
            yFormat={item.config.yFormat}
          />
        ))}
      </div>
    </div>
  )
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return null
  if (n % 2 === 1) return sorted[(n - 1) / 2]
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}
