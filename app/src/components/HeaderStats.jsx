export default function HeaderStats({ team }) {
  const tiles = [
    { label: 'Record',  value: `${team.w}-${team.l}`,      rank: team.w_pct_rank },
    { label: 'Net Rtg', value: fmtSigned(team.net_rating), rank: team.net_rating_rank },
    { label: 'Off Rtg', value: fmt(team.off_rating),       rank: team.off_rating_rank },
    { label: 'Def Rtg', value: fmt(team.def_rating),       rank: team.def_rating_rank },
    { label: 'eFG%',    value: pct(team.efg_pct),          rank: team.efg_pct_rank },
    { label: 'TOV%',    value: pct(team.tov_pct),          rank: team.tov_pct_rank },
    { label: 'OReb%',   value: pct(team.oreb_pct),         rank: team.oreb_pct_rank },
    { label: 'FTr',     value: fmt(team.fta_rate),         rank: team.fta_rate_rank },
  ]

  return (
    <div className="header-stats">
      {tiles.map((t) => (
        <div className="stat-tile" key={t.label}>
          <div className="label">{t.label}</div>
          <div className="value-row">
            <span className="value">{t.value}</span>
            <span className={`rank ${rankClass(t.rank)}`}>{ordinal(t.rank)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return n.toFixed(1)
}

function fmtSigned(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1)
}

function pct(n) {
  if (n == null) return '—'
  return (n * 100).toFixed(1) + '%'
}

// Turn 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd", etc.
function ordinal(n) {
  if (n == null) return ''
  const v = n % 100
  const suffix = ['th', 'st', 'nd', 'rd']
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}

// Rank 1-10 → good (green), 21-30 → bad (red), 11-20 → mid (neutral).
function rankClass(rank) {
  if (rank == null) return ''
  if (rank <= 10) return 'rank-good'
  if (rank >= 21) return 'rank-bad'
  return 'rank-mid'
}
