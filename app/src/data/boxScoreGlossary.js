/**
 * Stat definitions rendered at the bottom of each advanced-stats tab on the
 * per-game box score page. Each entry has:
 *   - label:   display name as shown in the table column header
 *   - def:     plain-English definition (1 sentence)
 *   - formula: optional formula string (shown on its own line under the def)
 *
 * Definitions are drawn from the official NBA.com stats glossary where
 * available (hustle stats, Touches, Passes, etc.). For stats not in NBA.com's
 * published glossary (Matchup MIN, Partial Possessions, Uncontested FG, Rim
 * FG, PTS Allowed) the wording follows NBA.com's own stat-page descriptions.
 */

export const HUSTLE_GLOSSARY = [
  { label: 'Contested Shots',
    def: 'The number of times a defensive player closes out and raises a hand to contest a shot prior to its release.' },
  { label: 'Contested 2PT',
    def: 'Contested shots on 2-point attempts only.' },
  { label: 'Contested 3PT',
    def: 'Contested shots on 3-point attempts only.' },
  { label: 'Deflections',
    def: 'The number of times a defensive player gets their hand on the ball on a non-shot attempt.' },
  { label: 'Charges Drawn',
    def: 'The number of times a defensive player draws an offensive charging foul.' },
  { label: 'Screen Assists (SA)',
    def: 'The number of times an offensive player sets a screen for a teammate that directly leads to a made field goal by that teammate.' },
  { label: 'Screen Assist Points (SA PTS)',
    def: 'The total points scored by teammates off a player’s screen assists.' },
  { label: 'Loose Balls Recovered',
    def: 'The number of times a player gains sole possession of a live ball that is not in the control of either team.' },
  { label: 'Box Outs',
    def: 'The number of times a player made physical contact with an opponent who was actively pursuing a rebound, with visible effort to prevent them from getting it.' },
]

export const DEFENSE_GLOSSARY = [
  { label: 'Matchup MIN',
    def: 'Total time the player spent defending their assigned matchup. Different from total minutes played because a player can be on the floor without being matched up with a specific offensive player.' },
  { label: 'Partial Possessions (Part. Poss.)',
    def: 'The number of possessions a player is credited with defending their matchup for part of the possession. A player can be credited with less than one possession depending on how long they defended.' },
  { label: 'Opp FG (Matchup FGM–FGA)',
    def: 'Field goals made and attempted by the opponent while being defended by this player.' },
  { label: 'Opp FG% (Matchup FG%)',
    def: 'Opponent field-goal percentage while being defended by this player.',
    formula: 'Matchup FGM ÷ Matchup FGA' },
  { label: 'Opp 3PT (Matchup 3PM–3PA)',
    def: 'Three-point field goals made and attempted by the opponent while being defended by this player.' },
  { label: 'Opp 3PT% (Matchup 3P%)',
    def: 'Opponent three-point percentage while being defended by this player.',
    formula: 'Matchup 3PM ÷ Matchup 3PA' },
  { label: 'PTS Allowed (Player Points)',
    def: 'Points scored by the opponent while being defended by this player.' },
  { label: 'DREB',
    def: 'Defensive rebounds collected by the player.' },
  { label: 'Matchup AST',
    def: 'Assists credited to the player the defender was matched up with, while that matchup was active.' },
  { label: 'Matchup TOV',
    def: 'Turnovers committed by the offensive player the defender was matched up with, while that matchup was active.' },
  { label: 'STL',
    def: 'Steals.' },
  { label: 'BLK',
    def: 'Blocked shots.' },
]

export const SHOOTING_GLOSSARY = [
  { label: 'Contested FG (CFGM–CFGA)',
    def: 'Field goals made and attempted while a defender was contesting the shot.' },
  { label: 'Contested FG% (CFG%)',
    def: 'Field goal percentage on contested shots.',
    formula: 'Contested FGM ÷ Contested FGA' },
  { label: 'Uncontested FG (UFGM–UFGA)',
    def: 'Field goals made and attempted with no defender contesting the shot.' },
  { label: 'Uncontested FG% (UFG%)',
    def: 'Field goal percentage on uncontested shots.',
    formula: 'Uncontested FGM ÷ Uncontested FGA' },
  { label: 'Rim FG (Restricted Area)',
    def: 'Field goals made and attempted from the restricted area (within ~4 feet of the basket).' },
  { label: 'Rim FG%',
    def: 'Field goal percentage in the restricted area.',
    formula: 'Restricted-Area FGM ÷ Restricted-Area FGA' },
  { label: '% Pts Paint (%PTS PITP)',
    def: 'Share of the player’s total points scored inside the paint.',
    formula: 'Points in the Paint ÷ Total Points' },
  { label: '% Pts Mid (%PTS 2PT MR)',
    def: 'Share of the player’s total points scored on mid-range 2-point field goals.',
    formula: 'Mid-Range Points ÷ Total Points' },
  { label: '% Pts 3PT (%PTS 3PT)',
    def: 'Share of the player’s total points scored on 3-point field goals.',
    formula: '3PT Points ÷ Total Points' },
  { label: '% Asst FGM (FGM %AST)',
    def: 'Share of the player’s made field goals that were assisted by a teammate.',
    formula: 'Assisted FGM ÷ Total FGM' },
]

export const PLAYMAKING_GLOSSARY = [
  { label: 'Touches',
    def: 'The number of times a player touches and possesses the ball during the game.' },
  { label: 'Passes',
    def: 'The number of total passes the player made in the game.' },
  { label: 'AST',
    def: 'Assists — passes that directly lead to a teammate’s made field goal.' },
  { label: '2nd AST (Secondary Assist)',
    def: 'Credited when a player passes to a teammate who then records an assist, provided it happens within one dribble/two seconds.' },
  { label: 'FT AST (Free Throw Assist)',
    def: 'Credited when a player passes to a teammate who draws a shooting foul, with no more than one dribble between the pass and the foul.' },
  { label: 'Speed (Avg Speed)',
    def: 'Average speed in miles per hour across all movement (standing, walking, jogging, sprinting) while on the court.' },
  { label: 'Distance',
    def: 'Total distance the player ran during the game, measured in miles.',
    formula: 'Distance (feet) ÷ 5,280' },
]
