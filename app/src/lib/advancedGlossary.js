// Shared glossary data for the Advanced-stats bar sections shown in two
// places:
//   1. app/src/components/PlayerStatsTable.jsx — Player Stats > Advanced
//      toggle's collapsed glossary below the table
//   2. app/src/pages/PlayerProfilePage.jsx — the Advanced tab on each
//      player profile's collapsed glossary below the bars
//
// Both views show the same 15 stats, so the glossary is the same. Kept as
// data (not a renderer) so each component can wrap it in its own layout —
// but the entries themselves are defined here once, and future edits
// (adding a new stat, refining a description) propagate to both places
// automatically. If we later split one view's glossary (e.g. add a
// hustle-specific section on the profile), we'd fork this.
export const ADVANCED_GLOSSARY = [
  { label: 'REB% (Rebound Percentage)',
    def: 'Estimate of the percentage of available rebounds a player grabbed while on the floor.',
    formula: '100 × (REB × (Tm MP ÷ 5)) ÷ (MP × (Tm REB + Opp REB))' },
  { label: 'AST% (Assist Percentage)',
    def: 'Estimate of the percentage of teammate field goals a player assisted while on the floor.',
    formula: '100 × AST ÷ (((MP ÷ (Tm MP ÷ 5)) × Tm FGM) − FGM)' },
  { label: 'STL% (Steal Percentage)',
    def: 'Estimate of the percentage of opponent possessions that end with a steal by this player while on the floor.',
    formula: '100 × (STL × (Tm MP ÷ 5)) ÷ (MP × Opp Poss)' },
  { label: 'BLK% (Block Percentage)',
    def: 'Estimate of the percentage of opponent two-point field goal attempts blocked by this player while on the floor.',
    formula: '100 × (BLK × (Tm MP ÷ 5)) ÷ (MP × (Opp FGA − Opp 3PA))' },
  { label: 'TOV% (Turnover Percentage)',
    def: 'Estimate of turnovers committed per 100 plays. Lower is better.',
    formula: '100 × TOV ÷ (FGA + 0.44 × FTA + TOV)' },
  { label: 'eFG% (Effective Field Goal Percentage)',
    def: 'Field goal percentage adjusted for the fact that a made 3-pointer is worth more than a made 2-pointer.',
    formula: '(FGM + 0.5 × 3PM) ÷ FGA' },
  { label: 'TS% (True Shooting Percentage)',
    def: 'Shooting efficiency that accounts for 2-point, 3-point, and free throws in one number.',
    formula: 'PTS ÷ (2 × (FGA + 0.44 × FTA))' },
  { label: 'FTr (Free Throw Rate)',
    def: 'How often a player gets to the free throw line relative to their field goal attempts.',
    formula: 'FTA ÷ FGA' },
  { label: 'C&S 3P% (Catch & Shoot 3P%)',
    def: '3-point percentage on catch-and-shoot attempts — jumpers with no dribble before the shot.' },
  { label: 'Pull-Up 3P%',
    def: '3-point percentage on pull-up attempts — jumpers taken off the dribble (one or more dribbles before the shot).' },
  { label: 'DFG% Allowed (Defensive Field Goal %)',
    def: 'Field goal percentage opponents shot while being defended by this player. Lower is better.',
    formula: 'Matchup FGM ÷ Matchup FGA' },
  { label: 'DFG+/- vs Norm',
    def: 'Difference between the FG% opponents shot against this defender and their season-average FG%. Negative means the defender held opponents below their norm (good defense); positive means opponents shot better than usual (bad defense).',
    formula: 'DFG% − Opponent\'s Season FG%' },
  { label: 'PER (Player Efficiency Rating)',
    def: 'John Hollinger\'s per-minute rating of a player\'s overall statistical production. Pace-adjusted and normalized so the league average is 15.00 every season. A rough guide: 25+ = All-NBA, 20+ = All-Star, 15 = league average, 10 = rotation player, below 10 = replacement-level. Percentile shown here ranks the player league-wide among those with 500+ minutes.',
    formula: '[uPER formula pace-adjusted to league pace, then normalized so league avg = 15.00]' },
  { label: 'FFOS (Four Factors Offensive Score) — hawkstracker original',
    def: 'Reweighted Dean Oliver\'s Four Factors framework for the modern game, with an added defensive possession-creation factor. Each factor is converted to a league-wide percentile; the weighted sum × 100 is the FFOS score. League average = 50 by construction. Higher is better. Reads as a player-level composite of what makes teams win.',
    formula: '100 × (0.30 × eFG%ile + 0.25 × OReb%ile + 0.20 × (1 − TOV%ile) + 0.15 × ForcedTOV%ile + 0.10 × FTr%ile), where ForcedTOV combines steals + deflections + charges per 36 min' },
  { label: 'PIS (Possession Impact Score) — hawkstracker original',
    def: 'Net possession value created per 36 minutes. Sums every action that extends your own possession or ends an opponent possession, minus actions that give possession away. Rewards the possession-creator archetype — the Dyson Daniels type of player whose value shows up in deflections, steals, and loose balls rather than box-score shooting. League average ≈ 8; higher is better.',
    formula: '(+1.0 × OReb + 1.0 × DReb + 1.0 × STL + 1.0 × Charges + 0.5 × LooseBalls + 0.3 × Deflections + 0.44 × FTA − 1.0 × TOV) per 36 min' },
  { label: 'TWI+ (Two-Way Impact Plus) — hawkstracker original',
    def: 'A synergy metric that rewards players who are strong on BOTH shooting efficiency (TS%) AND possession creation (PIS) at the same time. Unlike the other three one-number metrics which measure a single axis of value, TWI+ captures the compound value of two-way impact — a pure scorer or a pure possession-creator scores near league average; players who combine both score high. Named after sabermetrics convention (wRC+): 100 = league average, 150 = 50% above average, 50 = 50% below. Elite two-way players (Wemby, Giannis) land 200+.',
    formula: '(player TS% ÷ league avg TS%) × (player PIS ÷ league avg PIS) × 100' },
]
