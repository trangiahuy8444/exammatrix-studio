from pathlib import Path
import subprocess,json,time,os
out=Path(__file__).resolve().parent
snap=Path((out/'snapshot-path.txt').read_text().strip())
env=os.environ.copy();env.pop('DATABASE_URL',None);env['APP_ENV']='development'
results=[]
for name,cmd in [('engine',['/Users/huytran/.venvs/ngan-hang-de-web/bin/python','-m','unittest','discover','-s','tests','-v']),('frontend',['node','tests/frontend.test.cjs']),('matrices_frontend',['node','tests/matrices_frontend.test.cjs'])]:
 start=time.time()
 with (out/(name+'-baseline.log')).open('w') as log:
  result=subprocess.run(cmd,cwd=snap,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(suite=name,returncode=result.returncode,seconds=round(time.time()-start,2)))
 (out/'engine-baseline-results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(name,result.returncode,flush=True)
