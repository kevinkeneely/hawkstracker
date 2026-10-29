import { useMemo, useState } from 'react'

// ─── Section config ─────────────────────────────────────────
// Each section becomes one column with a dropdown. `stats` is the dropdown
// list in order; `default` is which stat shows first.

const SECTION_CONFIG = {
  overall: {
    title: 'Overall Shooting',
    stats: [
      { key: 'ts_pct',  label: 'TS%',  attempts: 'fga', attemptsLabel: 'FGA' },
      { key: 'fg_pct',  label: 'FG%',  attempts: 'fga', attemptsLabel: 'FGA' },
      { key: 'efg_pct', label: 'eFG%', attempts: 'fga', attemptsLabel: 'FGA' },
      { key: 'ft_pct',  label: 'FT%',  attempts: 'fta', attemptsLabel: 'FTA' },
    ],
    default: 'ts_pct',
  },
  zones: {
    title: 'By Shot Zone',
    stats: [
      { key: 'at_rim',        label: 'At the Rim' },
      { key: 'paint',         label: 'In the Paint' },
      { key: 'mid',           label: 'Mid-Range' },
      { key: 'corner_3',      label: 'Corner 3' },
      { key: 'above_break_3', label: 'Above the Break 3' },
    ],
    default: 'at_rim',
  },
  defense: {
    title: 'Defense',
    stats: [
      { key: 'spg', label: 'Steals Per Game' },
      { key: 'bpg', label: 'Blocks Per Game' },
      { key: 'rpg', label: 'Rebounds Per Game' },
    ],
    default: 'spg',
  },
  hustle: {
    title: 'Hustle',
    stats: [
      { key: 'deflections',           label: 'Deflections Per Game' },
      { key: 'contested_shots',       label: 'Contested Shots Per Game' },
      { key: 'box_outs',              label: 'Box Outs Per Game' },
      { key: 'loose_balls_recovered', label: 'Loose Balls Recovered Per Game' },
      { key: 'charges_drawn',         label: 'Charges Drawn Per Game' },
      { key: 'screen_assists',        label: 'Screen Assists Per Game' },
    ],
    default: 'deflections',
  },
}

const TOP_N = 10

// ─── Shape adapters ─────────────────────────────────────────
// Each player object has two possible shapes depending on which tab is
// active:
//   - Hawks tab (hawksData): fields are flat on the player (fg_pct, spg)
//     or nested under player.hustle.<field>.value for hustle metrics.
//   - League tab (league_leaderboards): nested under player.overall,
//     player.defense, player.hustle. Hustle values are stored directly
//     (not wrapped in {value, pctile} like the Hawks file).
// These helpers hide the difference from the Leaderboard component.

function getValue(player, section, statKey) {
  if (section === 'zones') return player.zones?.[statKey]?.pct ?? null
  if (section === 'overall') {
    const d = player.overall ?? player
    return d[statKey] ?? null
  }
  if (section === 'defense') {
    const d = player.defense ?? player
    return d[statKey] ?? null
  }
  if (section === 'hustle') {
    const raw = player.hustle?.[statKey]
    if (raw == null) return null
    return typeof raw === 'object' ? raw.value : raw
  }
  return null
}

function getAttempts(player, section, stat) {
  if (section === 'zones') return player.zones?.[stat.key]?.fga ?? null
  if (section === 'overall') {
    const d = player.overall ?? player
    // Prefer the pre-computed season total; fall back to per-game only
    // (older cached data between daily refreshes).
    return d[`${stat.attempts}_total`] ?? d[stat.attempts] ?? null
  }
  return null
}

function getVolumeCell(player, section, stat) {
  if (section === 'zones') {
    const z = player.zones?.[stat.key]
    return z ? `${z.fgm}/${z.fga}` : ''
  }
  if (section === 'overall') {
    const d = player.overall ?? player
    const a = d[`${stat.attempts}_total`] ?? d[stat.attempts] ?? 0
    return Math.round(a)
  }
  return null
}

function formatValue(v, section) {
  if (v == null) return '—'
  if (section === 'zones' || section === 'overall') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}

function getFloor(section, stat, leaderboards) {
  if (section === 'zones') return leaderboards?.min_fga_per_zone?.[stat.key] ?? null
  if (section === 'overall') return leaderboards?.min_overall?.[stat.key]?.min ?? 50
  return null
}

function floorLabel(section, stat, floor) {
  if (floor == null) return null
  if (section === 'zones') return `min ${floor} FGA`
  if (section === 'overall') return `min ${floor} ${stat.attemptsLabel}`
  return null
}

function valueHeader(section, stat) {
  if (section === 'zones') return 'FG%'
  if (section === 'overall') return stat.label
  // Short header so the column fits in the narrow mobile width without
  // wrapping. Dropdown above (e.g. "Steals Per Game") still names the metric
  // in full.
  return '/G'
}

function volumeHeader(section, stat) {
  if (section === 'zones') return 'M/A'
  if (section === 'overall') return stat.attemptsLabel
  return null
}

// ─── Main page ──────────────────────────────────────────────

export default function LeadersPage({ leaderboards, playerData }) {
  const [source, setSource] = useState('hawks')

  // One selected-stat key per section. useState with an object means a
  // single setter call updates one column without rerendering the others
  // unnecessarily (React.memo could further optimize if needed).
  const [selected, setSelected] = useState({
    overall: SECTION_CONFIG.overall.default,
    zones:   SECTION_CONFIG.zones.default,
    defense: SECTION_CONFIG.defense.default,
    hustle:  SECTION_CONFIG.hustle.default,
  })

  if (!leaderboards) {
    return (
      <div className="leaders-empty">
        <p>Leaderboards are being generated. Check back after the next data refresh.</p>
      </div>
    )
  }

  const players =
    source === 'league'
      ? leaderboards.players
      : (playerData?.players || [])

  const title = source === 'league' ? 'League Leaders' : 'Hawks Leaders'
  const sub =
    source === 'league'
      ? `Top ${TOP_N} · minimum ${leaderboards.min_gp} GP`
      : `Top ${TOP_N} Hawks`

  return (
    <div className="leaders-page">
      <div className="leaders-toggle">
        <button
          type="button"
          className={`leaders-toggle-btn ${source === 'hawks' ? 'active' : ''}`}
          onClick={() => setSource('hawks')}
        >
          Hawks
        </button>
        <button
          type="button"
          className={`leaders-toggle-btn ${source === 'league' ? 'active' : ''}`}
          onClick={() => setSource('league')}
        >
          League
        </button>
      </div>

      <header className="leaders-header">
        <h2>{title}</h2>
        <p className="leaders-sub">{sub}</p>
        <p className="leaders-note">
          Leaderboards update daily. Early-season samples may be noisy.
        </p>
      </header>

      <div className="leaders-grid">
        {Object.keys(SECTION_CONFIG).map((sectionKey) => (
          <LeaderColumn
            key={sectionKey}
            sectionKey={sectionKey}
            config={SECTION_CONFIG[sectionKey]}
            selectedKey={selected[sectionKey]}
            onSelect={(k) => setSelected((s) => ({ ...s, [sectionKey]: k }))}
            players={players}
            leaderboards={leaderboards}
          />
        ))}
      </div>
    </div>
  )
}

// ─── One column: title, dropdown, active card ───────────────

function LeaderColumn({ sectionKey, config, selectedKey, onSelect, players, leaderboards }) {
  const stat = config.stats.find((s) => s.key === selectedKey) || config.stats[0]
  return (
    <div className="leader-column">
      <h3 className="leader-column-title">{config.title}</h3>
      <select
        className="leader-select"
        value={selectedKey}
        onChange={(e) => onSelect(e.target.value)}
      >
        {config.stats.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
      <Leaderboard
        section={sectionKey}
        stat={stat}
        players={players}
        leaderboards={leaderboards}
      />
    </div>
  )
}

// ─── Single leaderboard card ────────────────────────────────

function Leaderboard({ section, stat, players, leaderboards }) {
  const floor = getFloor(section, stat, leaderboards)
  const vHeader = valueHeader(section, stat)
  const volHeader = volumeHeader(section, stat)

  const topPlayers = useMemo(() => {
    return players
      .map((p) => ({
        p,
        value: getValue(p, section, stat.key),
        attempts: getAttempts(p, section, stat),
      }))
      .filter((row) => {
        if (row.value == null) return false
        if (floor != null && (row.attempts == null || row.attempts < floor)) return false
        return true
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
  }, [players, section, stat.key, stat.attempts, floor])

  const subLabel = floorLabel(section, stat, floor)
  const colSpan = volHeader ? 5 : 4

  return (
    <section className="leader-card">
      {subLabel && <p className="leader-card-sub">{subLabel}</p>}
      <table className="leader-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-player">Player</th>
            <th className="col-team">Team</th>
            <th className="col-pct">{vHeader}</th>
            {volHeader && <th className="col-vol">{volHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {topPlayers.map((row, i) => (
            <tr key={row.p.id}>
              <td className="col-rank">{i + 1}</td>
              <td className="col-player">{row.p.name}</td>
              <td className="col-team">{row.p.team || 'ATL'}</td>
              <td className="col-pct">{formatValue(row.value, section)}</td>
              {volHeader && (
                <td className="col-vol">{getVolumeCell(row.p, section, stat)}</td>
              )}
            </tr>
          ))}
          {topPlayers.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="leader-empty">
                No qualifying players.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}