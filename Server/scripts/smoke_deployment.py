"""Check an explicitly selected HTTPS deployment without calling model providers."""
import argparse
import json
import os
from pathlib import Path
import time
from urllib.parse import urlparse
from uuid import uuid4
import httpx


def check(url,state_path,resume=False,insecure_localhost=False):
    parsed=urlparse(url)
    if parsed.scheme!='https':raise ValueError('HTTPS is required.')
    if insecure_localhost and parsed.hostname not in ('localhost','127.0.0.1'):
        raise ValueError('Certificate bypass is only permitted on loopback.')
    api=url.rstrip('/')+'/api'
    with httpx.Client(verify=not insecure_localhost,timeout=5,follow_redirects=False) as client:
        for attempt in range(60):
            try:
                response=client.get(api+'/health/db')
                if response.status_code==200:break
            except httpx.HTTPError:pass
            time.sleep(1)
        else:raise RuntimeError('Deployment did not become ready.')
        assert response.json()['database']=='postgresql'
        if resume:
            state=json.loads(state_path.read_text())
            client.cookies.set('moneylife_guest',state['token'])
            assert client.get(api+'/plans/'+state['planId']).status_code==200
            assert client.get(api+'/simulations/'+state['runId']).status_code==200
        else:
            assert client.get(url).status_code==200
            assert 'javascript' in client.get(url+'/snapshot.js').headers['content-type']
            assert client.get(url+'/life-events.json').json()['unit']=='KRW'
            payload={'requestId':str(uuid4()),'plan':{'state':{
                'initial':{'name':'Deployment smoke','age':25,'avatar':'test','cash':10000000,'saved':0,'income':2500000,'expense':1600000,'target':20000000},
                'goal':{'name':'Smoke goal','months':24},'monthlySaving':700000,'annualRate':0,'month':0}}}
            saved=client.post(api+'/plan-saves',json=payload,headers={'Origin':url})
            assert saved.status_code==201,saved.text
            cookie=saved.headers['set-cookie']
            assert all(flag in cookie for flag in ['Secure','HttpOnly','SameSite=lax'])
            assert client.post(api+'/plan-saves',json=payload).json()['id']==saved.json()['id']
            run=client.post(api+'/simulations',json={'planId':saved.json()['id'],'requestId':str(uuid4()),'months':120})
            assert run.status_code==200,run.text
            assert run.json()['summary']['goalMonth']==12
            assert client.post(api+'/plan-saves',json=payload,headers={'Origin':'https://other.invalid'}).status_code==403
            with httpx.Client(verify=not insecure_localhost,timeout=5) as other:
                assert other.get(api+'/plans/'+saved.json()['id']).status_code==404
            state={'planId':saved.json()['id'],'runId':run.json()['id'],'token':client.cookies.get('moneylife_guest')}
            state_path.parent.mkdir(parents=True,exist_ok=True)
            fd=os.open(state_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
            os.fchmod(fd,0o600)
            with os.fdopen(fd,'w') as file:json.dump(state,file)
    return {'phase':'resume' if resume else 'initial','database':'postgresql','checks':'passed'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',required=True)
    parser.add_argument('--state',type=Path,default=Path('.data/deployment-smoke.json'))
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--insecure-localhost',action='store_true')
    args=parser.parse_args()
    if not __debug__:raise RuntimeError('Checks require assertions enabled.')
    print(json.dumps(check(args.url,args.state,args.resume,args.insecure_localhost)))
