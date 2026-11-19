"""
Fetch + parse the NBA official injury report PDF, extract Hawks players'
current status, and write app/public/injuries-<SEASON>.json.

Why the PDF:
    nba_api has no game-time injury endpoint. `playerindex`'s ROSTER_STATUS
    is always 1.0 for any player on a roster regardless of injury. The
    real source is the twice-daily (plus 15-minute incremental updates
    during the day) PDF the league office publishes at ak-static.cms.nba.
    com. It's public, league-published, and has no redistribution
    restriction — fits the project's data licensing stance.

PDF URL format:
    https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMAM_PM.pdf
    e.g.  .../Injury-Report_2026-11-18_11_00AM.pdf

Report cadence: new PDF every ~15 minutes across the active NBA window.
We fetch the most recent one we can find by walking back from "now" through
15-minute slots.

Output shape (app/public/injuries-<SEASON>.json):
    {
      "season": "2026-27",
      "generated_at": "<iso timestamp of this pipeline run>",
      "report_time":  "<iso timestamp parsed from the PDF filename>",
      "report_url":   "<full URL we fetched>",
      "players": {
        "<player_id>": { "status": "Out", "reason": "Left Calf Strain" },
        ...
      }
    }

Only Hawks players are written today. Expanding to the full league is a
one-line change (drop the hawks_by_slug filter in match_players) once
Option B (player projections) needs opposing-team injury context.
"""

import datetime, io, json, re, ssl, sys, urllib.error, urllib.request
from collections import defaultdict
from pathlib import Path

import pdfplumber

from pipeline.config import SEASON

OUT_PATH = Path(f'app/public/injuries-{SEASON}.json')
HAWKS_DATA_PATH = Path(f'app/public/hawksData-{SEASON}.json')

# Column x-bounds in the published PDF. Learned by sampling the extract_words
# output on a known-good report; should be stable so long as the league
# doesn't re-layout the report. Values are the LEFT edge of each column.
COL_BOUNDS = [
    ('matchup', 195, 255),
    ('team',    260, 420),
    ('player',  420, 580),
    ('status',  580, 665),
    ('reason',  665, 820),
]
Y_ROW_TOL = 2         # px — words within this of each other are same y-group
REASON_MERGE_TOL = 15 # px — reason continuations within this y of a player
                      # row belong to that row (NBA layout centers the player
                      # name vertically against a multi-line reason cell)

# User-Agent: generic desktop browser. S3 returns 403 for `python-urllib`
# default UA even on public objects.
UA = 'Mozilla/5.0'


def find_latest_report(max_hours_back=48):
    """Walk backward from `now` through 15-minute slots and return
    (url, pdf_bytes) for the newest report we can fetch, or (None, None).

    Published slots follow the 15-minute grid. We check 4 slots per hour
    up to `max_hours_back` ago. Bailouts early on first 200 OK.
    """
    ctx = ssl.create_default_context()
    now = datetime.datetime.now()
    for hours_ago in range(max_hours_back):
        t = now - datetime.timedelta(hours=hours_ago)
        d = t.date()
        hr12 = t.hour % 12 or 12
        ampm = 'AM' if t.hour < 12 else 'PM'
        # Try 15-min slots in current hour, newest first
        for mm in ['45', '30', '15', '00']:
            # Skip any slot still in the future for the "this hour" row
            if hours_ago == 0 and int(mm) > t.minute:
                continue
            url = (
                'https://ak-static.cms.nba.com/referee/injury/'
                f'Injury-Report_{d.isoformat()}_{hr12:02d}_{mm}{ampm}.pdf'
            )
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
                    if r.getcode() == 200:
                        return url, r.read()
            except urllib.error.HTTPError:
                continue
            except Exception as e:
                # Network hiccup — don't bail the whole walk, just keep going
                print(f'  [warn] fetch {url}: {type(e).__name__}', file=sys.stderr)
    return None, None


def _col_for(x0):
    for name, lo, hi in COL_BOUNDS:
        if lo <= x0 < hi:
            return name
    return None


def parse_pdf(pdf_bytes):
    """Return a list of {matchup, team, player, status, reason} dicts, one
    per player across all pages. Team is forward-filled across rows where
    the league publishes an empty team cell for continuation players."""
    all_rows = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pi, page in enumerate(pdf.pages):
            # Skip the page header "Injury Report: ..." at top (top < ~60).
            words = [w for w in page.extract_words(keep_blank_chars=False)
                     if w['top'] > 60]
            # Cluster words by y-position
            y_groups = defaultdict(list)
            for w in words:
                matched = None
                for k in list(y_groups):
                    if abs(w['top'] - k) <= Y_ROW_TOL:
                        matched = k
                        break
                y_groups[matched if matched is not None else round(w['top'], 1)].append(w)
            # Assemble each y-group into column cells
            for y in sorted(y_groups):
                r = {c: '' for c, _, _ in COL_BOUNDS}
                for w in sorted(y_groups[y], key=lambda w: w['x0']):
                    c = _col_for(w['x0'])
                    if not c:
                        continue
                    r[c] = (r[c] + ' ' + w['text']).strip() if r[c] else w['text']
                r['_y'] = y
                r['_page'] = pi
                if r.get('player') == 'PlayerName':
                    continue
                if not any(r[c] for c in ['matchup', 'team', 'player', 'status', 'reason']):
                    continue
                all_rows.append(r)

    # Separate player-anchor rows from reason-only continuation lines
    player_rows = [r for r in all_rows if r['player'] or r['status']]
    cont_rows = [r for r in all_rows
                 if not r['player'] and not r['status'] and r['reason']]

    # Attach each continuation to the NEAREST player row (same page) within
    # the merge tolerance. Handles reasons that flank the player name both
    # above and below it (multi-line cells are centered vertically).
    for cr in cont_rows:
        best, best_dy = None, Y_ROW_TOL + REASON_MERGE_TOL + 1
        for pr in player_rows:
            if pr['_page'] != cr['_page']:
                continue
            dy = abs(pr['_y'] - cr['_y'])
            if dy < best_dy and dy <= REASON_MERGE_TOL:
                best, best_dy = pr, dy
        if best:
            best['reason'] = (best['reason'] + ' ' + cr['reason']).strip()

    # Forward-fill team across continuation players
    current_team = ''
    for pr in player_rows:
        if pr['team']:
            current_team = pr['team']
        else:
            pr['team'] = current_team

    return player_rows


def normalize_player_name(raw):
    """'Castro,Rafael' -> 'Rafael Castro'; 'Alexander-Walker,Nickeil' ->
    'Nickeil Alexander-Walker'. PDF uses concatenated no-space format; we
    reverse last-first and normalize case for matching."""
    parts = [p.strip() for p in raw.split(',', 1)]
    if len(parts) == 2:
        last, first = parts
        full = f'{first} {last}'
    else:
        full = raw
    return full


def normalize_reason(raw):
    """'Injury/Illness-LeftCalfStrain' -> 'Injury/Illness - Left Calf Strain'
    PDF strips inter-word spaces; we re-split on CamelCase and tidy spacing
    around separators."""
    if not raw:
        return raw
    s = raw
    # Space before each capital letter that follows a lower-case letter
    # (handles "LeftCalfStrain" -> "Left Calf Strain")
    s = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', s)
    # Separator spacing: " - " and " / " around their chars when touching words
    s = re.sub(r'(?<=\w)/(?=\w)', ' / ', s)
    s = re.sub(r'(?<=\w)-(?=[A-Z])', ' - ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def match_players(player_rows, hawks_by_normalized):
    """Return {player_id: {status, reason}} for Hawks players found in
    the parsed rows. Rows whose team isn't Atlanta are ignored; rows
    whose player name doesn't match a Hawks roster entry are logged."""
    out = {}
    unmatched = []
    for r in player_rows:
        if 'AtlantaHawks' not in r['team']:
            continue
        full_name = normalize_player_name(r['player'])
        key = full_name.lower()
        pid = hawks_by_normalized.get(key)
        if not pid:
            unmatched.append(full_name)
            continue
        out[str(pid)] = {
            'status': r['status'] or 'Unknown',
            'reason': normalize_reason(r['reason']),
        }
    if unmatched:
        # These are deep-bench / two-way / IL players who haven't logged
        # game minutes and so aren't in hawksData. They have no player
        # profile page in the dashboard, so there's nowhere to surface
        # their injury status anyway. Log as info, not warning.
        print(f'  [info] {len(unmatched)} ATL names in PDF not in hawksData '
              f'(deep bench / IL, no profile page): {unmatched}')
    return out


def parse_report_time_from_url(url):
    """Pull the datetime stamp out of the PDF filename.
    .../Injury-Report_2026-11-18_11_00AM.pdf -> 2026-11-18T11:00:00"""
    m = re.search(r'Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf', url)
    if not m:
        return None
    date_str, hr, mn, ampm = m.groups()
    hr = int(hr)
    if ampm == 'PM' and hr != 12:
        hr += 12
    elif ampm == 'AM' and hr == 12:
        hr = 0
    return f'{date_str}T{hr:02d}:{mn}:00'


def run():
    print('[injuries] searching for latest NBA injury report PDF...')
    url, pdf_bytes = find_latest_report()
    if not url:
        print('[injuries] no injury report PDF reachable in the last 48h — '
              'writing empty file', file=sys.stderr)
        payload = {
            'season': SEASON,
            'generated_at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
            'report_time': None,
            'report_url': None,
            'players': {},
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(payload, indent=2))
        return

    print(f'[injuries] found {len(pdf_bytes)} bytes: {url}')
    player_rows = parse_pdf(pdf_bytes)
    print(f'[injuries] parsed {len(player_rows)} player rows across all teams')

    hawks_data = json.loads(HAWKS_DATA_PATH.read_text())
    hawks_by_normalized = {p['name'].lower(): p['id'] for p in hawks_data['players']}

    hawks_injuries = match_players(player_rows, hawks_by_normalized)
    print(f'[injuries] matched {len(hawks_injuries)} Hawks players')

    payload = {
        'season': SEASON,
        'generated_at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'report_time': parse_report_time_from_url(url),
        'report_url': url,
        'players': hawks_injuries,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f'[injuries] wrote {OUT_PATH}')

    # Dated snapshot — starts the historical collection the player-
    # projection backtest needs to measure Phase 3 (teammate-out usage
    # redistribution) against real injury state per game. Same pattern
    # as league_team_stats_history/. One file per daily cron run.
    today_iso = datetime.date.today().isoformat()
    snap_path = Path(f'app/public/injuries_history/{SEASON}/{today_iso}.json')
    snap_path.parent.mkdir(parents=True, exist_ok=True)
    snap_path.write_text(json.dumps(payload, indent=2))
    print(f'[injuries] wrote snapshot {snap_path}')


if __name__ == '__main__':
    run()
