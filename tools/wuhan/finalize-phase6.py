"""Refresh runtime structure metadata and the final LF pack manifest."""
import subprocess
from phase2_common import ROOT, OUT, read, write, register, finish

subprocess.run(['node','tools/wuhan/export-dynamic-obstacles.mjs'],cwd=ROOT,check=True)
m=read(OUT/'manifest.json');data=read(OUT/'vessel-routes.json')
data['obstacles']=read(ROOT/'.tools/phase4/bridge-obstacles.json')
write(OUT/'vessel-routes.json',data)
register(m,'vessel-routes.json','vessel-routes-v1','Phase 6 canonical bridge structures',role='vessels')
finish(m)
