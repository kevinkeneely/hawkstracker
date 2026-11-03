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

import { useMemo, useState } from 'react'
import AdvancedScatterPlot from '../../components/AdvancedScatterPlot'
import AdvancedLeaderboards from '../../components/AdvancedLeaderboards'

export default function AdvancedPage({
  title, subtitle,
  hawksPlayers, leagueData,
  scatterConfigs, toggleConfigs,
  leagueMinMinutes,
}) {
  const [activeToggle, setActiveToggle] = useState(null)

  const leaguePlayers = leagueData?.players || []

  // Pre-compute median x,y for every scatter config, used as the crosshair
  // Only computed once per page render (not per hover) so we don't re-sort
  // thousands of values on every interaction.
  const scatterData = useMemo(() => {
    return scatterConfigs.map(cfg => {
      // Player floor. Two kinds supported:
      //   - minVolume: season-total count of the X-axis stat (e.g. "10 FGA").
      //     Volume per game × games played = season total. Defaults to using
      //     extractX; a config can override with extractVolume.
      //   - minMinutes: season-total minutes played, read from p.min_total
      //     (added by the pipeline). Used on Defense where "100 minutes" is
      //     more meaningful than a per-stat shot count.
      // A config can set either (or both — all floors must pass).
      const volumeFn = cfg.extractVolume || cfg.extractX
      const passesFloor = (p) => {
        if (cfg.minVolume != null) {
          const perGame = volumeFn(p)
          const gp = p.gp ?? 0
          if (perGame == null) return false
          if (perGame * gp < cfg.minVolume) return false
        }
        if (cfg.minMinutes != null) {
          const mins = p.min_total ?? 0
          if (mins < cfg.minMinutes) return false
        }
        return true
      }
      const points = leaguePlayers
        .filter(passesFloor)
        .map(p => ({
          id: p.id,
          name: p.name,
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
  }, [scatterConfigs, leaguePlayers])

  const activeConfig = toggleConfigs.find(t => t.key === activeToggle)

  return (
    <div className="advanced-page">
      <header className="advanced-page-header">
        <h2>{title}</h2>
        {subtitle && <p className="advanced-page-sub">{subtitle}</p>}
      </header>

      {/* Toggle buttons centered at top */}
      <div className="advanced-toggle-row">
        {toggleConfigs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`advanced-toggle-btn ${activeToggle === t.key ? 'active' : ''}`}
            onClick={() => setActiveToggle(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeToggle === null ? (
        /* Default view: scatter plot stack */
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
      ) : (
        /* Toggle active: Hawks + League leaderboards */
        <div className="advanced-leaderboards-section">
          <button
            type="button"
            className="advanced-back-link"
            onClick={() => setActiveToggle(null)}
          >
            ← Back to charts
          </button>
          <AdvancedLeaderboards
            stats={activeConfig.hawksStats}
            hawksPlayers={hawksPlayers}
            leaguePlayers={leaguePlayers}
            leagueMinMinutes={leagueMinMinutes}
          />
        </div>
      )}
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
