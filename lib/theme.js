// Preferencia de apariencia por cuenta y dispositivo, sin datos personales.
export const COLORS = Object.freeze([
  {id:"verde",name:"Verde",main:"#087D4F",hover:"#075F3D",soft:"#E6F7EE",border:"#B4E4CC"},
  {id:"azul",name:"Azul",main:"#175FCC",hover:"#124B9F",soft:"#EAF1FF",border:"#BDD4FB"},
  {id:"rojo",name:"Rojo",main:"#C2344A",hover:"#96283A",soft:"#FDEDF0",border:"#F5C5D0"},
  {id:"rosa",name:"Rosa",main:"#BA2D78",hover:"#92225E",soft:"#FDEAF5",border:"#F4C2DE"},
  {id:"morado",name:"Morado",main:"#7941C8",hover:"#5C2E9F",soft:"#F3ECFF",border:"#DEC9FB"},
  {id:"turquesa",name:"Turquesa",main:"#087D88",hover:"#05616A",soft:"#E5F7F8",border:"#B6E3E6"},
  {id:"naranja",name:"Naranja",main:"#AA4E13",hover:"#863B0B",soft:"#FFF0E5",border:"#F3CDAE"},
  {id:"mostaza",name:"Mostaza",main:"#866300",hover:"#694F00",soft:"#FFF6D8",border:"#F0DEA1"},
  {id:"grafito",name:"Grafito",main:"#445477",hover:"#303D5C",soft:"#EDF0F8",border:"#CFD6E7"}
]);
const PREFIX="balance-color-v1:";
let selected="verde";
function choice(id){return COLORS.find(color=>color.id===id)||COLORS[0]}
function updateControls(){
  const color=choice(selected);
  const status=document.getElementById("theme-choice-status");
  if(status)status.textContent=color.name+" seleccionado";
  document.querySelectorAll(".theme-choice").forEach(button=>{
    const active=button.dataset.theme===selected;
    button.setAttribute("aria-pressed",String(active));
    button.setAttribute("aria-label",button.dataset.themeLabel+(active?", seleccionado":""));
  });
}
export function applyTheme(id="verde"){
  const color=choice(id);
  selected=color.id;
  const root=document.documentElement;
  root.style.setProperty("--balance-accent",color.main);
  root.style.setProperty("--balance-accent-hover",color.hover);
  root.style.setProperty("--balance-accent-soft",color.soft);
  root.style.setProperty("--balance-accent-border",color.border);
  updateControls();
  return color.id;
}
export function loadTheme(userId){
  let saved="verde";
  if(userId==="inigo"||userId==="clara"){
    try{saved=localStorage.getItem(PREFIX+userId)||"verde"}catch(_error){}
  }
  return applyTheme(saved);
}
export function saveTheme(userId,id){
  if(!["inigo","clara"].includes(userId))return false;
  applyTheme(id);
  try{
    localStorage.setItem(PREFIX+userId,selected);
    return true;
  }catch(_error){return false}
}
export function initThemeSelector(getAccount,onSelect){
  const host=document.getElementById("theme-options");
  if(!host)return;
  host.replaceChildren();
  COLORS.forEach(color=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="theme-choice";
    button.dataset.theme=color.id;
    button.dataset.themeLabel=color.name;
    button.style.setProperty("--theme-swatch",color.main);
    const swatch=document.createElement("span");
    swatch.className="theme-choice-swatch";
    swatch.setAttribute("aria-hidden","true");
    const check=document.createElement("span");
    check.className="theme-choice-check";
    check.textContent="✓";
    swatch.append(check);
    const label=document.createElement("span");
    label.className="theme-choice-label";
    label.textContent=color.name;
    button.append(swatch,label);
    button.addEventListener("click",()=>{
      const account=getAccount();
      if(!account)return;
      const stored=saveTheme(account,color.id);
      if(onSelect)onSelect(color.id,stored);
    });
    host.append(button);
  });
  updateControls();
}
