/* Public Weather Lab status cards — read-only curated snapshot, never a warning feed. */
(()=>{
'use strict';
const ENDPOINT='https://atlas.pythology.co.nz/public-research/weather.json';
const within=(ms,threshold)=>Number.isFinite(ms)&&ms>=-60000&&ms<=threshold;
const niceTime=(s)=>{
 const date=new Date(s||'');if(!Number.isFinite(date.getTime()))return 'Unverified';
 return new Intl.DateTimeFormat('en-NZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Pacific/Auckland'}).format(date)+' NZ time';
};
function activate(root){
 const slots=name=>root.querySelectorAll('[data-wx-'+name+']');
 const put=(name,value)=>slots(name).forEach(el=>{el.textContent=String(value)});
 const number=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('en-NZ'):'—';
 const label=(a)=>a?.enabled===false?'DISABLED':a?.source_fresh===true?'CURRENT':a?.health==='degraded'?'DEGRADED':'NOT VERIFIED';
 function failure(msg){
  root.dataset.wxState='unavailable';
  put('badge','CURRENT STATUS UNVERIFIED');
  put('updated',msg);
  put('radar','—');put('findings','—');put('nws','—');put('nhc','—');
  put('adapters','Live source health unavailable. Historical replay results below remain valid.');
  put('scope','The local Weather Lab may continue running independently of the public research feed.');
 }
 function render(v){
  if(!v||v.schema!=='pythology.weather-lab.public-research/v1'||v.research_only!==true)throw Error('Unexpected research summary');
  const age=Date.now()-Date.parse(v.generated_at||'');
  const fresh=within(age,30*60000);
  const adapters=v.adapters||{},radar=adapters.nexrad,nws=adapters.nws_alerts,nhc=adapters.nhc_storms;
  const valid=fresh&&v.status!=='unavailable';
  const adapterOk=valid&&radar?.source_fresh===true&&nws?.source_fresh===true&&nhc?.source_fresh===true;
  root.dataset.wxState=adapterOk?'ok':valid?'partial':'unavailable';
  put('badge',adapterOk?'LIVE SOURCES VERIFIED':valid?'PARTIAL / DEGRADED COVERAGE':'SNAPSHOT STALE / UNVERIFIED');
  put('updated','Public research snapshot: '+niceTime(v.generated_at)+(fresh?'':' · STALE'));
  if(!valid){put('radar','—');put('findings','—');put('nws','—');put('nhc','—');}
  else{
   const sites=Array.isArray(v.radar_sites)?v.radar_sites:[];
   const analyzed=sites.reduce((acc,x)=>acc+(typeof x.volumes_analysed==='number'?x.volumes_analysed:0),0);
   const findings=sites.reduce((acc,x)=>acc+(typeof x.current_findings==='number'?x.current_findings:0),0);
   put('radar',radar?.source_fresh===true?number(analyzed):'—');
   put('findings',radar?.source_fresh===true?number(findings):'—');
   put('nws',nws?.source_fresh===true?number(v.nws_alerts_in_force):'—');
   put('nhc',nhc?.source_fresh===true?number(v.nhc_active_storms):'—');
  }
  put('adapters','NEXRAD: '+label(radar)+' · NWS: '+label(nws)+' · NHC: '+label(nhc));
  const siteText=(Array.isArray(v.radar_sites)?v.radar_sites:[]).map(x=>x.site).filter(Boolean).join(', ');
  put('scope',(siteText?'Configured radars: '+siteText+'. ':'No radar site confirmed. ')+
    'Radar totals are since backend restart; alerts and cyclone fixes are official-source context.');
 }
 async function refresh(){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const res=await fetch(ENDPOINT,{signal:ctrl.signal,cache:'no-store',credentials:'omit'});
   if(!res.ok)throw Error('HTTP '+res.status);
   const data=await res.json();
   render(data);
  }catch(e){failure('Public weather research feed not available or cannot be verified.')}
  finally{clearTimeout(timer)}
 }
 void refresh();
 setInterval(()=>{if(!document.hidden)void refresh()},5*60*1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
}
document.querySelectorAll('[data-weather-live]').forEach(activate);
})();