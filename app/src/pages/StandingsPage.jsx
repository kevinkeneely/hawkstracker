import ScheduleStrip from '../components/ScheduleStrip'

const HAWKS_TEAM_ID = 1610612737

export default function StandingsPage({ standingsData, season }) {
  if (!standingsData) return null

  return (
    <div className="standings">
      <ScheduleStrip season={season} />
      <ConferenceTable name="Eastern Conference" teams={standingsData.east} />
      <ConferenceTable name="Western Conference" teams={standingsData.west} />
    </div>
  )
}

function ConferenceTable({ name, teams }) {
  return (
    <div className="conference">
      <h2 className="conference-name">{name}</h2>
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>W-L</th>
            <th>PCT</th>
            <th>GB</th>
            <th>L10</th>
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr
              key={t.team_id}
              className={t.team_id === HAWKS_TEAM_ID ? 'hawks-row' : ''}
            >
              <td>{t.conf_rank}</td>
              <td>
                <span className="team-name-full">{t.name}</span>
                <span className="team-name-abbr">{t.abbr}</span>
              </td>
              <td>{t.w}-{t.l}</td>
              <td>{formatPct(t.pct)}</td>
              <td>{formatGb(t.gb)}</td>
              <td>{t.last_10}</td>
              <td>{t.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ".500" style — no leading zero.
function formatPct(pct) {
  if (pct == null) return '—'
  return pct.toFixed(3).replace(/^0/, '')
}

// Show "—" for 0 games back; otherwise show the number.
function formatGb(gb) {
  if (gb == null || gb === 0) return '—'
  return gb.toString()
}