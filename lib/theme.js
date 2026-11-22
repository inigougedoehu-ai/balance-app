// Preferencia de apariencia por cuenta y dispositivo, sin datos personales.
export const COLORS = Object.freeze([
  {id:"verde",name:"Verde",main:"#244D3E",hover:"#173D30",soft:"#E8F2EA",border:"#BFD7C6"},
  {id:"azul",name:"Azul",main:"#284D82",hover:"#183961",soft:"#EAF1FA",border:"#BED0E9"},
  {id:"rojo",name:"Rojo",main:"#8D3947",hover:"#6F2A37",soft:"#F9EBED",border:"#E8C6CD"},
  {id:"rosa",name:"Rosa",main:"#983C70",hover:"#762A56",soft:"#FAECF4",border:"#EBC8DB"},
  {id:"morado",name:"Morado",main:"#68468D",hover:"#4F3271",soft:"#F1EBF8",border:"#D8C9E8"},
  {id:"turquesa",name:"Turquesa",main:"#1D6268",hover:"#14484D",soft:"#E7F5F3",border:"#B9DCDD"},
  {id:"naranja",name:"Naranja",main:"#965125",hover:"#743B18",soft:"#FFF1E6",border:"#EAC9AE"},
  {id:"mostaza",name:"Mostaza",main:"#80601E",hover:"#604816",soft:"#FFF6DE",border:"#E6D5A4"},
  {id:"grafito",name:"Grafito",main:"#414C5B",hover:"#2D3948",soft:"#EFF1F5",border:"#CCD2DE"}
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
