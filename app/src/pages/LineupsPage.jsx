import { useMemo, useState } from 'react'

/**
 * Lineups tab — section toggle lets the user switch between views.
 *   - "On/Off": per-player split of team Net Rating when that player is on
 *     court vs. off court, plus the Swing (On - Off).
 *   - "5-Man": every Hawks 5-man group that's played together this season.
 *
 * Future sections (same tab, same toggle): 4-Man, 3-Man, 2-Man combos.
 *
 * Data:
 *   lineups5 — /lineups/<season>/latest-5man.json
 *   onoff    — /lineups/<season>/latest-onoff.json
 */

const SECTIONS = [
  { id: 'onoff', label: 'On/Off' },
  { id: '5man',  label: '5-Man'  },
  { id: '4man',  label: '4-Man'  },
  { id: '3man',  label: '3-Man'  },
  { id: '2man',  label: '2-Man'  },
]

const DEFAULT_SECTION = 'onoff'

export default function LineupsPage({ lineups5, lineups4, lineups3, lineups2, onoff }) {
  const [section, setSection] = useState(DEFAULT_SECTION)

  // Group-size views all share the same table shape (the NBA endpoint
  // returns the same columns regardless of group_quantity), so one
  // component handles them — we just pass different data + label.
  const groupData = {
    '5man': lineups5,
    '4man': lineups4,
    '3man': lineups3,
    '2man': lineups2,
  }
  const groupSize = { '5man': 5, '4man': 4, '3man': 3, '2man': 2 }

  return (
    <div className="lineups-page">
      <div className="lineups-section-toggle">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`lineups-section-btn ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'onoff' && <OnOffView data={onoff} />}
      {section in groupData && (
        <GroupManView data={groupData[section]} groupSize={groupSize[section]} />
      )}
    </div>
  )
}

/* ─── On/Off view ───────────────────────────────────────────────── */

const ONOFF_COLS = [
  { key: 'player_name',    label: 'Player',  align: 'left',   format: (v) => formatPlayerName(v) },
  { key: 'min_on',         label: 'Min On',  align: 'right',  format: (v) => v?.toFixed(0) ?? '—' },
  { key: 'net_rating_on',  label: 'On NET',  align: 'right',  format: (v) => fmtSigned(v) },
  { key: 'net_rating_off', label: 'Off NET', align: 'right',  format: (v) => fmtSigned(v) },
  { key: 'net_swing',      label: 'Swing',   align: 'right',  format: (v) => fmtSigned(v) },
]

const DEFAULT_ONOFF_MIN = 50   // filter out noise from tiny-sample players

function OnOffView({ data }) {
  const [minMin, setMinMin] = useState(DEFAULT_ONOFF_MIN)
  const [sortKey, setSortKey] = useState('net_swing')
  const [sortDir, setSortDir] = useState('desc')

  if (!data) {
    return <TableEmpty msg="On/Off data isn't available yet. It'll appear after the next pipeline refresh." />
  }

  const rows = useMemo(() => {
    const filtered = (data.players || []).filter((p) => (p.min_on ?? 0) >= minMin)
    const sorted = [...filtered].sort(sortCompare(sortKey, sortDir))
    return sorted
  }, [data, minMin, sortKey, sortDir])

  return (
    <>
      <div className="lineups-header">
        <h2>On/Off Splits</h2>
        <p className="lineups-sub">
          How the Hawks score and defend with each player on court vs. off.
          <strong> Swing</strong> is the player's impact — how much the team's
          Net Rating changes when they're on the floor. Big positive Swing = team
          is meaningfully better with them playing.
        </p>
        <FilterBar
          options={[0, 20, 50, 100, 200]}
          value={minMin}
          onChange={setMinMin}
          label="Minimum minutes on court:"
          count={`${rows.length} of ${data.players?.length ?? 0} players`}
        />
      </div>

      <SortableTable
        cols={ONOFF_COLS}
        rows={rows}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(k) => toggleSortHandler(k, sortKey, setSortKey, setSortDir, 'player_name')}
        rowKey={(r) => r.player_id}
        cellClass={(row, col) => {
          // Color-code the Swing column by sign
          if (col.key !== 'net_swing') return ''
          if (row.net_swing > 0) return 'net-good'
          if (row.net_swing < 0) return 'net-bad'
          return ''
        }}
      />
    </>
  )
}

/* ─── 5-Man view (unchanged logic, factored into a subcomponent) ── */

const FIVE_MAN_COLS = [
  { key: 'group_name', label: 'Lineup',  align: 'left',   format: (v) => v },
  { key: 'min',        label: 'MIN',     align: 'right',  format: (v) => v?.toFixed(0) ?? '—' },
  { key: 'off_rating', label: 'OFF',     align: 'right',  format: (v) => v?.toFixed(1) ?? '—' },
  { key: 'def_rating', label: 'DEF',     align: 'right',  format: (v) => v?.toFixed(1) ?? '—' },
  { key: 'net_rating', label: 'NET',     align: 'right',  format: (v) => fmtSigned(v) },
  { key: 'ts_pct',     label: 'TS%',     align: 'right',  format: (v) => fmtPct(v) },
  { key: 'efg_pct',    label: 'eFG%',    align: 'right',  format: (v) => fmtPct(v) },
  { key: 'fg3_pct',    label: '3P%',     align: 'right',  format: (v) => fmtPct(v) },
]

// Smaller group sizes = more total combos but each sees less floor time,
// so the default minimum minutes drops as the group gets smaller. Users can
// still override via the filter bar.
const DEFAULT_MIN_BY_GROUP = { 5: 20, 4: 30, 3: 50, 2: 100 }

function GroupManView({ data, groupSize }) {
  const defaultMin = DEFAULT_MIN_BY_GROUP[groupSize] ?? 20
  const [minMin, setMinMin] = useState(defaultMin)
  const [sortKey, setSortKey] = useState('net_rating')
  const [sortDir, setSortDir] = useState('desc')

  if (!data) {
    return <TableEmpty msg={`${groupSize}-Man lineup data isn\'t available yet. It\'ll appear after the next pipeline refresh.`} />
  }

  const rows = useMemo(() => {
    const filtered = (data.lineups || []).filter((l) => (l.min ?? 0) >= minMin)
    return [...filtered].sort(sortCompare(sortKey, sortDir))
  }, [data, minMin, sortKey, sortDir])

  return (
    <>
      <div className="lineups-header">
        <h2>{groupSize}-Man Lineups</h2>
        <p className="lineups-sub">
          Every Hawks {groupSize}-man group that's played together this season,
          sorted by Net Rating. Click any column header to re-sort. Change the
          minimum minutes to see more or fewer lineups.
        </p>
        <FilterBar
          options={filterOptionsFor(groupSize)}
          value={minMin}
          onChange={setMinMin}
          label="Minimum minutes:"
          count={`${rows.length} of ${data.lineups?.length ?? 0} lineups`}
        />
      </div>

      <SortableTable
        cols={FIVE_MAN_COLS}
        rows={rows}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(k) => toggleSortHandler(k, sortKey, setSortKey, setSortDir, 'group_name')}
        rowKey={(r) => r.group_id}
        cellClass={(row, col) => {
          if (col.key !== 'net_rating') return ''
          if (row.net_rating > 0) return 'net-good'
          if (row.net_rating < 0) return 'net-bad'
          return ''
        }}
      />
    </>
  )
}

// Filter options shift with group size. 2-man combos play more minutes
// together on average than 5-man lockdown groups, so the high end stretches.
function filterOptionsFor(groupSize) {
  if (groupSize === 2) return [0, 50, 100, 200, 500]
  if (groupSize === 3) return [0, 20, 50, 100, 200]
  if (groupSize === 4) return [0, 20, 50, 100, 200]
  return [0, 10, 20, 50, 100]
}

/* ─── Shared components ─────────────────────────────────────────── */

function FilterBar({ options, value, onChange, label, count }) {
  return (
    <div className="lineups-filter">
      <span className="lineups-filter-label">{label}</span>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          className={`lineups-min-btn ${value === n ? 'active' : ''}`}
          onClick={() => onChange(n)}
        >
          {n === 0 ? 'Show all' : `${n} min`}
        </button>
      ))}
      <span className="lineups-count">{count}</span>
    </div>
  )
}

function SortableTable({ cols, rows, sortKey, sortDir, onSort, rowKey, cellClass }) {
  return (
    <div className="lineups-table-wrap">
      <table className="lineups-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`lineups-th lineups-th-${c.align} ${sortKey === c.key ? 'sorted' : ''}`}
                onClick={() => onSort(c.key)}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="lineups-sort-arrow">
                    {sortDir === 'asc' ? ' ▲' : ' ▼'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="lineups-empty-row">
                Nothing meets the current filter.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`lineups-td lineups-td-${c.align} ${cellClass ? cellClass(row, c) : ''}`}
                  >
                    {c.format(row[c.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function TableEmpty({ msg }) {
  return (
    <div className="lineups-empty">
      <p>{msg}</p>
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function fmtPct(v) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function fmtSigned(v) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

/** NBA.com returns "Last, First" — flip to "First Last" for readability. */
function formatPlayerName(v) {
  if (!v) return '—'
  const parts = v.split(',').map((s) => s.trim())
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`
  return v
}

function sortCompare(key, dir) {
  return (a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' || typeof bv === 'string') {
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    }
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return dir === 'asc' ? av - bv : bv - av
  }
}

function toggleSortHandler(key, curKey, setKey, setDir, stringCol) {
  if (curKey === key) {
    setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  } else {
    setKey(key)
    setDir(key === stringCol ? 'asc' : 'desc')
  }
}
