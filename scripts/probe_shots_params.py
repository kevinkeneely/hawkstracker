"""
Peek at what parameters LeagueDashPlayerPtShot takes, so we know how to
request Catch & Shoot vs Pull Up vs Contested vs Uncontested.
"""
import inspect
from nba_api.stats.endpoints import leaguedashplayerptshot

cls = leaguedashplayerptshot.LeagueDashPlayerPtShot
sig = inspect.signature(cls.__init__)
print("ALL PARAMETERS for LeagueDashPlayerPtShot:")
for name, param in sig.parameters.items():
    if name == 'self': continue
    default = param.default if param.default is not inspect.Parameter.empty else '(no default)'
    print(f"  {name} = {default}")
