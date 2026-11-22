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
function chart(weights){
  const host=$("weight-chart");host.replaceChildren();
  if(!weights.length){host.append(textNode("p","Aquí aparecerá tu gráfica cuando registres pesajes.","empty-state"));return}
  const W=700,H=225,px=46,py=28,ns="http://www.w3.org/2000/svg";
  const vals=weights.map(w=>w.value),lo0=Math.min(...vals),hi0=Math.max(...vals);
  const range=Math.max(2,hi0-lo0),lo=lo0-(range-(hi0-lo0))/2,hi=lo+range;
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Evolución del peso registrado");
  function add(tag,attrs,txt){
    const el=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    if(txt!==undefined)el.textContent=txt;
    svg.append(el);
  }
  for(let i=0;i<3;i++){
    const y=py+i*(H-2*py)/2;
    add("line",{x1:px,y1:y,x2:W-15,y2:y,stroke:"#e9eee9","stroke-width":1});
    add("text",{x:1,y:y+4,fill:"#829489","font-size":12},(hi-i*range/2).toLocaleString("es-ES",{maximumFractionDigits:1}));
  }
  const x=i=>weights.length===1?W/2:px+(W-px-25)*i/(weights.length-1);
  const y=v=>H-py-(v-lo)*(H-2*py)/range;
  const coords=weights.map((w,i)=>[x(i),y(w.value)]);
  add("polyline",{points:coords.map(p=>p.join(",")).join(" "),fill:"none",stroke:"#3a7561","stroke-width":3,"stroke-linecap":"round","stroke-linejoin":"round"});
  coords.forEach(([cx,cy])=>add("circle",{cx,cy,r:4,fill:"#3a7561",stroke:"#fff","stroke-width":1.6}));
  add("text",{x:px,y:H-5,fill:"#829489","font-size":12},fmtDate(weights[0].date));
  if(weights.length>1)add("text",{x:W-15,y:H-5,fill:"#829489","font-size":12,"text-anchor":"end"},fmtDate(weights.at(-1).date));
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
  $("metric-meals").textContent=String(meals.length);
  $("local-count").textContent=ctx.pending.length
    ?ctx.pending.length+" cambio(s) pendiente(s). Copia local cifrada."
    :"Registros cifrados en este dispositivo.";
  $("weight-count").textContent=weights.length+" registros";
  $("meal-count").textContent=meals.length+" registros";
  if(document.activeElement!==$("goal-value"))$("goal-value").value=ctx.goal??"";
  $("weight-trend").textContent=weights.length>1?"Cambio desde el primer registro: "+(last.value-weights[0].value>0?"+":"")+(last.value-weights[0].value).toLocaleString("es-ES",{maximumFractionDigits:1})+" kg":"Sin tendencia aún";
  chart(weights);list("weight-list",weights.slice().reverse(),"weight",onEdit,onDelete);
  list("meal-list",meals,"meal",onEdit,onDelete);
}
export function resetForm(kind){
  const weight=kind==="weight";
  const prefix=weight?"weight":"meal";
  $(prefix+"-form").reset();$(prefix+"-date").value=today();
  $(prefix+"-form-title").textContent=weight?"Añadir un pesaje":"Añadir una comida";
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
