import {ageYears,bmiValue,bmiCategory,meanLastSevenDays} from "./health.js";
const $=id=>document.getElementById(id);
const compare=(a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt));
const fmtWeight=w=>Number(w).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" kg";
const fmtDate=d=>{const [y,m,day]=String(d).split("-").map(Number);return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(y,m-1,day))};
export function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
export function textNode(tag,value,cls=""){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el}
let toastTimer;
export function toast(message){const el=$("toast");el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},3300)}
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
function chart(weights, goal){
  const host=$("weight-chart");host.replaceChildren();
  if(!weights.length){
    host.append(textNode("p","El gráfico aparecerá cuando registres un pesaje.","empty-state"));
    return;
  }
  const W=700,H=235,left=48,right=18,top=28,bottom=31;
  const ns="http://www.w3.org/2000/svg";
  const target=Number.isFinite(goal)&&goal>0?goal:null;
  const all=weights.map(w=>w.value);
  if(target!==null)all.push(target);
  const low0=Math.min(...all),high0=Math.max(...all);
  const range=Math.max(2,high0-low0);
  const low=low0-Math.max(.7,(range-(high0-low0))/2);
  const high=high0+Math.max(.7,(range-(high0-low0))/2);
  const span=high-low;
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label",target===null?
    "Evolución del peso registrado":
    "Evolución del peso, con línea horizontal del objetivo en "+fmtWeight(target));
  function add(tag,attrs,value){
    const node=document.createElementNS(ns,tag);
    for(const [key,v] of Object.entries(attrs))node.setAttribute(key,String(v));
    if(value!==undefined)node.textContent=value;
    svg.append(node);
    return node;
  }
  const y=v=>H-bottom-(v-low)*(H-top-bottom)/span;
  const x=i=>weights.length===1?(left+(W-right))/2:left+(W-left-right)*i/(weights.length-1);
  for(let i=0;i<3;i++){
    const gy=top+i*((H-bottom-top)/2);
    add("line",{x1:left,y1:gy,x2:W-right,y2:gy,stroke:"#e4eae5","stroke-width":1});
    add("text",{x:4,y:gy+4,fill:"#78887e","font-size":11},
      (high-i*span/2).toLocaleString("es-ES",{maximumFractionDigits:1}));
  }
  if(target!==null){
    const gy=y(target);
    add("line",{x1:left,y1:gy,x2:W-right,y2:gy,stroke:"#b28b5a",
      "stroke-width":1.8,"stroke-dasharray":"7 5"});
    // Etiqueta colocada encima de la línea y dentro de la zona del SVG.
    add("text",{x:W-right-2,y:Math.max(14,gy-9),fill:"#886b44",
      "font-size":11,"font-weight":670,"text-anchor":"end"},
      "Objetivo · "+fmtWeight(target));
  }
  const points=weights.map((row,i)=>[x(i),y(row.value)]);
  if(points.length>1)add("polyline",{points:points.map(p=>p.join(",")).join(" "),
    fill:"none",stroke:"#245946","stroke-width":3,"stroke-linecap":"round","stroke-linejoin":"round"});
  for(const [cx,cy] of points)add("circle",{cx,cy,r:4,fill:"#245946",stroke:"#fff","stroke-width":1.5});
  add("text",{x:left,y:H-5,fill:"#78887e","font-size":11},fmtDate(weights[0].date));
  if(weights.length>1)add("text",{x:W-right,y:H-5,fill:"#78887e",
    "font-size":11,"text-anchor":"end"},fmtDate(weights.at(-1).date));
  host.append(svg);
}
function list(container,records,kind,onEdit,onDelete){
  const el=$(container);el.replaceChildren();
  if(!records.length){el.append(textNode("p",kind==="weight"?"Todavía no has registrado ningún peso.":"Todavía no has registrado ninguna comida.","empty-state"));return}
  for(const record of records){
    const row=textNode("div","","record"),body=textNode("div","");
    if(kind==="weight")body.append(textNode("strong",fmtWeight(record.value)));
    else{
      body.append(textNode("strong",record.description));
      body.append(textNode("span",record.type,"secondary-line"));
      if(record.notes)body.append(textNode("span",record.notes,"notes"));
    }
    body.append(textNode("time",fmtDate(record.date)));
    const actions=textNode("div","","record-actions");
    const edit=textNode("button","Editar"),del=textNode("button","Borrar");
    edit.type=del.type="button";
    edit.addEventListener("click",()=>onEdit(record));
    del.addEventListener("click",()=>onDelete(record));
    actions.append(edit,del);row.append(body,actions);el.append(row);
  }
}
export function render(ctx,onEdit,onDelete){
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
  chart(weights,ctx.goal);
  list("weight-list",weights.slice().reverse(),"weight",onEdit,onDelete);
  list("meal-list",filtered,"meal",onEdit,onDelete);
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
    route("peso");$("weight-value").focus();
  }else{
    $("meal-date").value=record.date;
    $("meal-type").value=record.type;
    $("meal-description").value=record.description;
    $("meal-notes").value=record.notes||"";
    $("meal-form-title").textContent="Editar comida";
    $("meal-submit").textContent="Guardar cambios";
    $("meal-cancel").hidden=false;
    route("comidas");$("meal-description").focus();
  }
}
