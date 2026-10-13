import DotPlot from './DotPlot'

const pctFmt = (v) => (v * 100).toFixed(1) + '%'
const signedFmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(1)

const SECTIONS = [
  {
    name: 'ADJUSTED EFFICIENCY',
    stats: [
      {
        label: 'Net Rtg',
        offField: 'net_rating',
        offRankField: 'net_rating_rank',
        defField: null,
        format: signedFmt,
      },
    ],
  },
  {
    name: 'FOUR FACTORS',
    stats: [
      {
        label: 'eFG%',
        offField: 'efg_pct',
        offRankField: 'efg_pct_rank',
        defField: 'opp_efg_pct',
        defRankField: 'opp_efg_pct_rank',
        format: pctFmt,
      },
      {
        label: 'TOV%',
        offField: 'tov_pct',
        offRankField: 'tov_pct_rank',
        defField: 'opp_tov_pct',
        defRankField: 'opp_tov_pct_rank',
        format: pctFmt,
      },
      {
        label: 'OReb%',
        offField: 'oreb_pct',
        offRankField: 'oreb_pct_rank',
        defField: 'opp_oreb_pct',
        defRankField: 'opp_oreb_pct_rank',
        format: pctFmt,
      },
      {
        label: 'FTr',
        offField: 'fta_rate',
        offRankField: 'fta_rate_rank',
        defField: 'opp_fta_rate',
        defRankField: 'opp_fta_rate_rank',
        format: pctFmt,
      },
    ],
  },
  {
    name: 'SHOOTING EFFICIENCY',
    stats: [
      {
        label: 'Rim%',
        offField: 'rim_fg_pct',
        offRankField: 'rim_fg_pct_rank',
        defField: 'opp_rim_fg_pct',
        defRankField: 'opp_rim_fg_pct_rank',
        format: pctFmt,
      },
      {
        label: 'Mid%',
        offField: 'mid_fg_pct',
        offRankField: 'mid_fg_pct_rank',
        defField: 'opp_mid_fg_pct',
        defRankField: 'opp_mid_fg_pct_rank',
        format: pctFmt,
      },
      {
        label: '3P%',
        offField: 'fg3_pct',
        offRankField: 'fg3_pct_rank',
        defField: 'opp_fg3_pct',
        defRankField: 'opp_fg3_pct_rank',
        format: pctFmt,
      },
      {
        label: 'FT%',
        offField: 'ft_pct',
        offRankField: 'ft_pct_rank',
        defField: 'opp_ft_pct',
        defRankField: 'opp_ft_pct_rank',
        format: pctFmt,
      },
    ],
  },
  {
    name: 'MISC',
    stats: [
      {
        label: 'AST%',
        offField: 'ast_pct_off',
        offRankField: 'ast_pct_off_rank',
        defField: 'ast_pct_def',
        defRankField: 'ast_pct_def_rank',
        format: pctFmt,
      },
      {
        label: 'STL%',
        offField: 'stl_pct_off',
        offRankField: 'stl_pct_off_rank',
        defField: 'stl_pct_def',
        defRankField: 'stl_pct_def_rank',
        format: pctFmt,
      },
      {
        label: 'BLK%',
        offField: 'blk_pct_off',
        offRankField: 'blk_pct_off_rank',
        defField: 'blk_pct_def',
        defRankField: 'blk_pct_def_rank',
        format: pctFmt,
      },
    ],
  },
]

const buildValues = (allTeams, field) =>
  allTeams
    .filter((t) => t[field] != null)
    .map((t) => ({ id: t.id, name: t.name, value: t[field] }))

export default function TeamStats({ team, allTeams }) {
  if (!team || !allTeams) return null

  return (
    <section className="team-stats">
      {SECTIONS.map((section) => (
        <div className="ts-section" key={section.name}>
          <div className="ts-section-name">{section.name}</div>
          <div className="ts-off-def-head">
            <span>Offense</span>
            <span>Defense</span>
          </div>
          {section.stats.map((stat) => (
            <StatRow
              key={stat.label}
              stat={stat}
              team={team}
              allTeams={allTeams}
            />
          ))}
        </div>
      ))}
    </section>
  )
}

function StatRow({ stat, team, allTeams }) {
  const offValue = team[stat.offField]
  const offRank = team[stat.offRankField]
  const offValues = buildValues(allTeams, stat.offField)

  const hasDef = stat.defField != null
  const defValue = hasDef ? team[stat.defField] : null
  const defRank = hasDef ? team[stat.defRankField] : null
  const defValues = hasDef ? buildValues(allTeams, stat.defField) : []

  return (
    <div className="ts-row">
      <div className="ts-plot">
        <DotPlot
          values={offValues}
          hawksId={team.id}
          hawksRank={offRank}
          format={stat.format}
        />
      </div>
      <div className="ts-value">
        {offValue != null ? stat.format(offValue) : '—'}
      </div>
      <div className="ts-label">{stat.label}</div>
      <div className="ts-value">
        {hasDef && defValue != null ? stat.format(defValue) : ''}
      </div>
      <div className="ts-plot">
        {hasDef && (
          <DotPlot
            values={defValues}
            hawksId={team.id}
            hawksRank={defRank}
            format={stat.format}
          />
        )}
      </div>
    </div>
  )
}
