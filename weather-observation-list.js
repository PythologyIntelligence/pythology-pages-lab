/* Weather observation cards: named NHC fixes, official NWS alerts, NEXRAD stations.
   Display-only. The upstream publisher curates fields and age; independently recheck freshness here. */
(()=>{
'use strict';
const ENDPOINT='https://atlas.pythology.co.nz/public-research/weather.json';
const fresh=(v,max)=>Number.isFinite(Date.parse(v||''))&&Date.now()-Date.parse(v)>=-60000&&Date.now()-Date.parse(v)<=max;
const stamp=v=>{const d=new Date(v||'');return Number.isFinite(d.getTime())?
 new Intl.DateTimeFormat('en-NZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Pacific/Auckland'}).format(d)+' NZ time':'time unavailable';};
const fmt=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-NZ'):'—';
const text=x=>typeof x==='string'&&x.trim()?x.trim():'Unavailable';
function panel(el,msg){if(!el)return;el.replaceChildren();const p=document.createElement('p');p.className='wx-observation-empty';p.textContent=msg;el.append(p)}
function node(title,badge,lines){
 const item=document.createElement('article');item.className='wx-observation';
 const row=document.createElement('div');row.className='wx-observation-title';
 const name=document.createElement('strong');name.textContent=title;row.appendChild(name);
 const marker=document.createElement('span');marker.textContent=badge;row.appendChild(marker);
 item.appendChild(row);
 for(const line of lines.filter(Boolean)){const p=document.createElement('p');p.textContent=line;item.appendChild(p)}
 return item;
}
function render(root,data){
 const storm=root.querySelector('[data-wx-storm-list]');
 const alert=root.querySelector('[data-wx-alert-list]');
 const site=root.querySelector('[data-wx-site-list]');
 if(data?.schema!=='pythology.weather-lab.public-research/v1'||data.research_only!==true||
    !fresh(data.generated_at,30*60000)||data.status==='unavailable'){
   for(const e of [storm,alert,site])panel(e,'Public research feed is stale or unavailable; no live state is implied.');
   return;
 }
 const a=data.adapters||{};
 if(a.nhc_storms?.source_fresh!==true||data.storm_list_verified!==true){
   panel(storm,'NHC active storm-system list cannot be verified. This does not mean there are no storms.');
 }else{
   const items=Array.isArray(data.storms)?data.storms.filter(x=>fresh(x.advisory_time_utc,48*3600000)).slice(0,8):[];
   if(!items.length)panel(storm,'No current NHC storm systems in this verified advisory feed.');
   else{storm?.replaceChildren();for(const x of items){
     const coords=Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon))?
       Number(x.lat).toFixed(1)+'°, '+Number(x.lon).toFixed(1)+'°':'coordinates unavailable';
     storm?.append(node(text(x.name),'NHC',[
       text(x.classification)+' · '+text(x.basin),
       'Advisory: '+stamp(x.advisory_time_utc)+' · position '+coords,
       typeof x.sustained_wind_kt==='number'?'Wind: '+fmt(x.sustained_wind_kt)+' kt':'',
       typeof x.motion_deg==='number'&&typeof x.motion_kt==='number'?
       'Movement: '+fmt(x.motion_deg)+'° at '+fmt(x.motion_kt)+' kt (last issued, not a forecast)':''
     ]));}}
 }
 if(a.nws_alerts?.source_fresh!==true||data.alert_list_verified!==true){
   panel(alert,'Current official severe-alert list cannot be verified.');
 }else{
   const items=Array.isArray(data.severe_alerts)?data.severe_alerts.filter(x=>fresh(x.issued_utc,72*3600000)).slice(0,6):[];
   if(!items.length)panel(alert,'No selected severe NWS alert types in the verified feed; other hazards may exist.');
   else{alert?.replaceChildren();for(const x of items)alert?.append(node(text(x.type),'NWS',[
     text(x.area), 'Issued: '+stamp(x.issued_utc)
   ]))}
 }
 const sites=Array.isArray(data.radar_sites)?data.radar_sites.slice(0,12):[];
 if(a.nexrad?.enabled!==true)panel(site,'No NEXRAD analysis enabled in the current research backend.');
 else if(!sites.length)panel(site,'No configured radar-site details in the latest research snapshot.');
 else{
   site?.replaceChildren();
   for(const x of sites)site?.append(node(text(x.site),
     a.nexrad?.source_fresh===true&&x.latest_volume_fresh===true?'RECENT RADAR VOLUME':'NO VERIFIED RECENT VOLUME',[
       'Last volume: '+stamp(x.last_volume_utc),
       'Analysed since restart: '+fmt(x.volumes_analysed)+' · findings: '+fmt(x.current_findings)
     ]));
 }
}
async function update(){
 const targets=[...document.querySelectorAll('[data-weather-live]')];
 if(!targets.length)return;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
   const res=await fetch(ENDPOINT,{cache:'no-store',credentials:'omit',signal:ctrl.signal});
   if(!res.ok)throw Error('Research feed not available');
   const json=await res.json();
   for(const root of targets)render(root,json);
 }catch{
   for(const root of targets)for(const x of root.querySelectorAll('[data-wx-storm-list],[data-wx-alert-list],[data-wx-site-list]'))
     panel(x,'Public observations cannot currently be verified.');
 }finally{clearTimeout(timer)}
}
void update();
setInterval(()=>{if(!document.hidden)void update()},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update()});
})();