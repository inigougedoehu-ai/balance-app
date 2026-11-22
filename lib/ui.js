import {ageYears,bmiValue,bmiCategory,meanLastSevenDays} from "./health.js";
import {renderChart} from "./chart.js";
const $=id=>document.getElementById(id);
const compare=(a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt));
const fmtWeight=w=>Number(w).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" kg";
const fmtDate=d=>{const [y,m,day]=String(d).split("-").map(Number);return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(y,m-1,day))};
export function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
export function textNode(tag,value,cls=""){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el}
let toastTimer;
export function toast(message,options={}){
  const el=$("toast");
  el.replaceChildren(textNode("span",message));
  if(options.actionLabel&&typeof options.onAction==="function"){
    const button=textNode("button",options.actionLabel,"toast-action");
    button.type="button";
    button.addEventListener("click",()=>{
      el.hidden=true;clearTimeout(toastTimer);options.onAction();
    },{once:true});
    el.append(button);
  }
  el.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.hidden=true},options.actionLabel?8500:3300);
}
export function status(id,message,kind=""){const el=$(id);el.textContent=message;if(kind)el.dataset.state=kind;else el.removeAttribute("data-state")}
export function route(name){
  document.querySelectorAll("[data-view]").forEach(el=>{el.hidden=el.dataset.view!==name});
  document.querySelectorAll(".nav-item").forEach(el=>{
    const current=el.dataset.route===name;
    el.classList.toggle("active",current);
    if(current)el.setAttribute("aria-current","page");
    else el.removeAttribute("aria-current");
  });
  window.scrollTo({top:0,behavior:"smooth"});
}
function dayLabel(date){
  if(date===today())return "Hoy";
  const d=new Date();
  d.setDate(d.getDate()-1);
  const yesterday=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  return date===yesterday?"Ayer":fmtDate(date);
}
function list(container,records,kind,onEdit,onDelete,onRepeat){
  const el=$(container);el.replaceChildren();
  if(!records.length){
    el.append(textNode("p",kind==="weight"?"Todavía no hay pesajes.":"No hay comidas para mostrar.","empty-state"));
    return;
  }
  let previousDay="";
  for(const record of records){
    if(kind==="meal"&&record.date!==previousDay){
      el.append(textNode("h3",dayLabel(record.date),"day-heading"));
      previousDay=record.date;
    }
    const row=textNode("div","","record"),body=textNode("div","");
    if(kind==="weight")body.append(textNode("strong",fmtWeight(record.value)));
    else{
      body.append(textNode("strong",record.description));
      if(record.notes)body.append(textNode("span",record.notes,"notes"));
    }
    body.append(textNode("time",kind==="weight"?fmtDate(record.date):record.type));
    const actions=textNode("div","","record-actions");
    if(kind==="meal"&&onRepeat){
      const repeat=textNode("button","Repetir");
      repeat.type="button";
      repeat.addEventListener("click",()=>onRepeat(record));
      actions.append(repeat);
    }
    const edit=textNode("button","Editar");
    edit.type="button";edit.addEventListener("click",()=>onEdit(record));
    const del=textNode("button","Borrar");
    del.type="button";del.addEventListener("click",()=>onDelete(record));
    actions.append(edit,del);
    row.append(body,actions);
    el.append(row);
  }
}
export function render(ctx,onEdit,onDelete,onRepeat){
  const weights=ctx.entries.filter(e=>e.kind==="weight").slice().sort(compare);
  const meals=ctx.entries.filter(e=>e.kind==="meal").slice().sort((a,b)=>-compare(a,b));
  const last=weights.at(-1);
  $("metric-weight").textContent=last?fmtWeight(last.value):"—";
  $("metric-weight-date").textContent=last?"Registrado el "+fmtDate(last.date):"Aún no hay registros";
  $("metric-goal").textContent=ctx.goal===null?"—":fmtWeight(ctx.goal);
  $("metric-goal-info").textContent=last&&ctx.goal!==null?"Diferencia con objetivo: "+fmtWeight(Math.abs(last.value-ctx.goal)):"Puedes definirlo cuando quieras";
  const height=ctx.heightCm??null;
  const age=ageYears(ctx.birthDate);
  const bmi=last&&height!==null?bmiValue(last.value,height):null;
  const category=bmi!==null?bmiCategory(bmi,age):null;
  $("metric-bmi").textContent=bmi===null?"—":bmi.toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1});
  $("metric-height").textContent=height===null?"Configura la altura en Ajustes":"Altura: "+height.toLocaleString("es-ES",{maximumFractionDigits:1})+" cm";
  $("metric-bmi-status").textContent=bmi===null?"—":category||"Sin clasificar";
  $("metric-bmi-note").textContent=bmi!==null&&age!==null&&age<20?
    "Se usan criterios diferentes antes de los 20 años":
    bmi!==null&&age===null?"Añade tu fecha de nacimiento en Ajustes":
    "Indicador orientativo para adultos";
  if(document.activeElement!==$("profile-height"))$("profile-height").value=height??"";
  if(document.activeElement!==$("profile-birth-date"))$("profile-birth-date").value=ctx.birthDate??"";
  $("profile-age").textContent=age===null?"Edad: sin configurar":"Edad: "+age+" años";
  const diff=weights.length>1?last.value-weights.at(-2).value:null;
  $("metric-change").textContent=diff===null?"—":(diff>0?"+":diff<0?"−":"")+
    Math.abs(diff).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" kg";
  const mean=meanLastSevenDays(weights);
  $("metric-avg7").textContent=mean===null?"—":fmtWeight(mean);
  $("weight-count").textContent=weights.length+" registros";
  const filter=$("meal-filter").value;
  const filtered=filter==="all"?meals:meals.filter(row=>row.type===filter);
  $("meal-count").textContent=filter==="all"?meals.length+" registros":
    filtered.length+" de "+meals.length+" registros";
  if(document.activeElement!==$("goal-value"))$("goal-value").value=ctx.goal??"";
  $("weight-trend").textContent=weights.length>1?"Cambio desde el primer registro: "+
    (last.value-weights[0].value>0?"+":last.value-weights[0].value<0?"−":"")+
    Math.abs(last.value-weights[0].value).toLocaleString("es-ES",{maximumFractionDigits:1})+" kg":
    "Sin tendencia aún";
  renderChart(weights,ctx.goal);
  list("weight-list",weights.slice().reverse(),"weight",onEdit,onDelete);
  list("meal-list",filtered,"meal",onEdit,onDelete,onRepeat);
}
export function resetForm(kind){
  const weight=kind==="weight";
  const prefix=weight?"weight":"meal";
  $(prefix+"-form").reset();$(prefix+"-date").value=today();
  $(prefix+"-form-title").textContent=weight?"Nuevo pesaje":"Nueva comida";
  $(prefix+"-submit").textContent=weight?"Guardar peso":"Guardar comida";
  $(prefix+"-cancel").hidden=true;
}
export function fillForm(record){
  if(record.kind==="weight"){
    $("weight-date").value=record.date;
    $("weight-value").value=record.value;
    $("weight-form-title").textContent="Editar pesaje";
    $("weight-submit").textContent="Guardar cambios";
    $("weight-cancel").hidden=false;
    $("weight-value").focus();
  }else{
    $("meal-date").value=record.date;
    $("meal-type").value=record.type;
    $("meal-description").value=record.description;
    $("meal-notes").value=record.notes||"";
    $("meal-form-title").textContent="Editar comida";
    $("meal-submit").textContent="Guardar cambios";
    $("meal-cancel").hidden=false;
    $("meal-description").focus();
  }
}
