import DotPlot from './DotPlot'

const pctFmt = (v) => (v * 100).toFixed(1) + '%'
const signedFmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(1)

// Standalone top block — single stat, no pairing.
const OVERALL = {
  name: 'OVERALL',
  stat: {
    label: 'Net Rtg',
    field: 'net_rating',
    rankField: 'net_rating_rank',
    format: signedFmt,
  },
}

// Paired table — Hawks on left, Opponents on right for every stat.
const PAIRED_SECTIONS = [
  {
    name: 'SCORING',
    stats: [
      { label: 'eFG%', hawks: 'efg_pct',       hawksRank: 'efg_pct_rank',       opp: 'opp_efg_pct',       oppRank: 'opp_efg_pct_rank',       format: pctFmt },
      { label: 'TS%',  hawks: 'ts_pct',        hawksRank: 'ts_pct_rank',        opp: 'opp_ts_pct',        oppRank: 'opp_ts_pct_rank',        format: pctFmt },
      { label: 'Rim%', hawks: 'rim_fg_pct',    hawksRank: 'rim_fg_pct_rank',    opp: 'opp_rim_fg_pct',    oppRank: 'opp_rim_fg_pct_rank',    format: pctFmt },
      { label: 'Mid%', hawks: 'mid_fg_pct',    hawksRank: 'mid_fg_pct_rank',    opp: 'opp_mid_fg_pct',    oppRank: 'opp_mid_fg_pct_rank',    format: pctFmt },
      { label: '3P%',  hawks: 'fg3_pct',       hawksRank: 'fg3_pct_rank',       opp: 'opp_fg3_pct',       oppRank: 'opp_fg3_pct_rank',       format: pctFmt },
      { label: 'FT%',  hawks: 'ft_pct',        hawksRank: 'ft_pct_rank',        opp: 'opp_ft_pct',        oppRank: 'opp_ft_pct_rank',        format: pctFmt },
    ],
  },
  {
    name: 'MISC',
    stats: [
      { label: 'AST%', hawks: 'ast_pct_off',   hawksRank: 'ast_pct_off_rank',   opp: 'ast_pct_def',       oppRank: 'ast_pct_def_rank',       format: pctFmt },
      { label: 'TOV%', hawks: 'tov_pct',       hawksRank: 'tov_pct_rank',       opp: 'opp_tov_pct',       oppRank: 'opp_tov_pct_rank',       format: pctFmt },
      { label: 'STL%', hawks: 'stl_pct_def',   hawksRank: 'stl_pct_def_rank',   opp: 'stl_pct_off',       oppRank: 'stl_pct_off_rank',       format: pctFmt },
      { label: 'BLK%', hawks: 'blk_pct_def',   hawksRank: 'blk_pct_def_rank',   opp: 'blk_pct_off',       oppRank: 'blk_pct_off_rank',       format: pctFmt },
    ],
  },
  {
    name: 'REBOUNDING',
    stats: [
      { label: 'OReb%', hawks: 'oreb_pct',    hawksRank: 'oreb_pct_rank',    opp: 'opp_oreb_pct',    oppRank: 'opp_oreb_pct_rank',    format: pctFmt },
      { label: 'DReb%', hawks: 'dreb_pct',    hawksRank: 'dreb_pct_rank',    opp: 'opp_dreb_pct',    oppRank: 'opp_dreb_pct_rank',    format: pctFmt },
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
    <>
      <section className="ts-legend">
        <span className="ts-legend-swatch" aria-hidden="true">●</span>
        <span>Each dot shows where a team ranks across the league. The number inside the red dot is the Hawks' rank.</span>
      </section>

      {/* Standalone OVERALL block */}
      <section className="team-stats">
        <div className="ts-section">
          <div className="ts-section-name">{OVERALL.name}</div>
          <StatLine
            stat={OVERALL.stat}
            field={OVERALL.stat.field}
            rankField={OVERALL.stat.rankField}
            team={team}
            allTeams={allTeams}
          />
        </div>
      </section>

      {/* Paired table — Hawks column | Opponents column */}
      <section className="team-stats">
        <div className="ts-pair-header">
          <span>Hawks</span>
          <span>Opponents</span>
        </div>
        {PAIRED_SECTIONS.map((section) => (
          <div className="ts-paired-section" key={section.name}>
            <div className="ts-section-name">{section.name}</div>
            <div className="ts-two-cols">
              <div className="ts-col ts-col-hawks">
                {section.stats.map((stat) => (
                  <StatLine
                    key={stat.label}
                    stat={stat}
                    field={stat.hawks}
                    rankField={stat.hawksRank}
                    team={team}
                    allTeams={allTeams}
                  />
                ))}
              </div>
              <div className="ts-col ts-col-opp">
                {section.stats.map((stat) => (
                  <StatLine
                    key={stat.label}
                    stat={stat}
                    field={stat.opp}
                    rankField={stat.oppRank}
                    team={team}
                    allTeams={allTeams}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>
    </>
  )
}

function StatLine({ stat, field, rankField, team, allTeams }) {
  const value = team[field]
  const rank = team[rankField]
  const values = buildValues(allTeams, field)

  return (
    <div className="ts-row">
      <div className="ts-label">{stat.label}</div>
      <div className="ts-plot">
        <DotPlot
          values={values}
          hawksId={team.id}
          hawksRank={rank}
          format={stat.format}
        />
      </div>
      <div className="ts-value">
        {value != null ? stat.format(value) : '—'}
      </div>
    </div>
  )
}
