
/* Accessible preview navigation; no external dependencies. */
document.addEventListener('DOMContentLoaded',()=>{
 for(const header of document.querySelectorAll('.px-header')){
  const button=header.querySelector('[data-px-menu-toggle]');
  const panel=header.querySelector('[data-px-menu]');
  if(!button||!panel)continue;
  const close=()=>{button.setAttribute('aria-expanded','false');panel.hidden=true;};
  button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));panel.hidden=!open;});
  header.addEventListener('keydown',e=>{if(e.key==='Escape'){close();button.focus();}});
  panel.addEventListener('click',e=>{if(e.target.closest('a'))close();});
  document.addEventListener('click',e=>{if(!header.contains(e.target))close();});
  window.addEventListener('resize',()=>{if(window.innerWidth>980)close();});
 }
});
