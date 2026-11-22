import {today,textNode,toast} from "./ui.js";

const $=id=>document.getElementById(id);
const uuid=()=>crypto.randomUUID();
const dateISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const localDate=str=>{const [y,m,d]=str.split("-").map(Number);return new Date(y,m-1,d)};
const fmtDate=s=>new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(localDate(s));
const number=n=>Number(n).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1});
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateISO(localDate(s))===s;
const FAVORITES=["Desayuno","Media mañana","Comida","Merienda","Cena","Otro"];
export const favoriteKey=meal=>meal.type+"|"+meal.description.trim().toLocaleLowerCase("es");
export function monthSummary(entries,year,month){
  const prefix=String(year)+"-"+String(month+1).padStart(2,"0")+"-";
  const monthEntries=entries.filter(row=>row.date?.startsWith(prefix));
  const weights=monthEntries.filter(row=>row.kind==="weight")
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.updatedAt).localeCompare(String(b.updatedAt)));
  const meals=monthEntries.filter(row=>row.kind==="meal");
  return {
    weights:weights.length,
    meals:meals.length,
    mealDays:new Set(meals.map(row=>row.date)).size,
    measures:monthEntries.filter(row=>row.kind==="measure").length,
    notes:monthEntries.filter(row=>row.kind==="day_note").length,
    variation:weights.length<2?null:weights.at(-1).value-weights[0].value
  };
}
export function csvContent(ctx){
  const header=["tipo","fecha","peso_kg","tipo_comida","descripcion","cintura_cm","cadera_cm","pecho_cm","brazo_cm","observaciones"];
  function safe(value){
    let s=value===null||value===undefined?"":String(value);
    // Evita interpretar textos personales como fórmulas al abrir el CSV en hojas de cálculo.
    if(/^[=+\-@\t\r]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }
  const rows=ctx.entries.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(record=>{
    let values=[record.kind,record.date,"","","","","","","",""];
    if(record.kind==="weight")values[2]=record.value;
    else if(record.kind==="meal"||record.kind==="favorite"){
      values[3]=record.type;values[4]=record.description;values[9]=record.notes||"";
    }else if(record.kind==="measure"){
      values[5]=record.waistCm??"";values[6]=record.hipCm??"";
      values[7]=record.chestCm??"";values[8]=record.armCm??"";
      values[9]=record.notes||"";
    }else if(record.kind==="day_note")values[9]=record.text;
    return values.map(safe).join(",");
  });
  return "\uFEFF"+header.map(safe).join(",")+"\r\n"+rows.join("\r\n")+"\r\n";
}
function saveFile(data,mime,name){
  const url=URL.createObjectURL(new Blob([data],{type:mime}));
  const a=document.createElement("a");
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function createDiary(getCtx,api){
  let calendarMonth=new Date().getMonth(),calendarYear=new Date().getFullYear();
  let selectedDate=today(),calendarOpen=false,editingMeasure=null,lastRenderedDate=null;
  let previousFocus=null;
  const measureFields={
    waistCm:"measure-waist",hipCm:"measure-hip",chestCm:"measure-chest",armCm:"measure-arm"
  };
  function allowed(){
    const ctx=getCtx();
    return Boolean(ctx&&api.canExtras());
  }
  function support(){
    const yes=allowed();
    $("measure-submit").disabled=!yes;
    $("daily-note-save").disabled=!yes;
    $("daily-note-text").disabled=!yes;
    for(const id of ["extras-support-measure","extras-support-note"]){
      $(id).hidden=yes;
      if(!yes)$(id).textContent="Para guardar medidas, notas o favoritos, actualiza Apps Script a la versión 0.7.0.";
    }
  }
  function showMeasure(record=null){
    if(!getCtx())return;
    editingMeasure=record?.id||null;
    $("measure-form").reset();
    $("measure-date").value=record?.date||today();
    $("measure-form-title").textContent=record?"Editar medidas":"Registrar medidas";
    $("measure-submit").textContent=record?"Guardar cambios":"Guardar medidas";
    for(const [key,id] of Object.entries(measureFields))$(id).value=record?.[key]??"";
    $("measure-notes").value=record?.notes||"";
    support();
    api.composer.show("measure");
  }
  function measures(ctx){
    const host=$("measure-list");
    host.replaceChildren();
    const rows=ctx.entries.filter(e=>e.kind==="measure")
      .sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt)));
    if(!rows.length){
      host.append(textNode("p","Todavía no has registrado medidas corporales.","empty-state"));return;
    }
    for(const row of rows.slice(0,10)){
      const item=textNode("div","","record");
      const content=textNode("div","");
      const fields=Object.entries(measureFields).filter(([key])=>row[key]!=null);
      content.append(textNode("strong",fields.map(([key])=>({
        waistCm:"Cintura",hipCm:"Cadera",chestCm:"Pecho",armCm:"Brazo"
      })[key]+": "+number(row[key])+" cm").join(" · ")));
      if(row.notes)content.append(textNode("span",row.notes,"notes"));
      content.append(textNode("time",fmtDate(row.date)));
      const actions=textNode("div","","record-actions");
      const edit=textNode("button","Editar"),del=textNode("button","Borrar");
      edit.type=del.type="button";
      edit.addEventListener("click",()=>showMeasure(row));
      del.addEventListener("click",()=>api.deleteRecord(row));
      actions.append(edit,del);
      item.append(content,actions);host.append(item);
    }
  }
  function progress(ctx){
    const container=$("progress-card"),copy=$("progress-copy"),status=$("progress-status"),fill=$("progress-fill");
    const weights=ctx.entries.filter(row=>row.kind==="weight")
      .sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt)));
    if(ctx.goal===null||weights.length<2){
      container.hidden=true;return;
    }
    container.hidden=false;
    const first=weights[0].value,last=weights.at(-1).value,goal=ctx.goal;
    if(first===goal){
      status.textContent="Mantenimiento";
      fill.style.width="100%";
      copy.textContent="Objetivo inicial: "+number(goal)+" kg. Peso actual: "+number(last)+" kg.";
      return;
    }
    const progress=Math.min(100,Math.max(0,(last-first)/(goal-first)*100));
    fill.style.width=progress.toFixed(2)+"%";
    status.textContent=Math.round(progress)+" %";
    const remaining=Math.abs(goal-last);
    copy.textContent="Desde "+number(first)+" kg · Actual "+number(last)+" kg · "+
      (progress>=100?"Objetivo alcanzado o superado.":"Distancia al objetivo: "+number(remaining)+" kg.");
  }
  function renderCalendar(ctx){
    if(!calendarOpen)return;
    const d=new Date(calendarYear,calendarMonth,1);
    const monthName=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"}).format(d);
    $("calendar-month").textContent=monthName.charAt(0).toUpperCase()+monthName.slice(1);
    const grid=$("calendar-grid");grid.replaceChildren();
    for(const day of ["L","M","X","J","V","S","D"])
      grid.append(textNode("span",day,"calendar-weekday"));
    const offset=(d.getDay()+6)%7;
    for(let i=0;i<offset;i++)grid.append(textNode("span","","calendar-empty"));
    const lastDay=new Date(calendarYear,calendarMonth+1,0).getDate();
    const byDate=new Map();
    for(const record of ctx.entries){
      if(!record.date||record.kind==="favorite")continue;
      const list=byDate.get(record.date)||[];
      list.push(record);byDate.set(record.date,list);
    }
    for(let day=1;day<=lastDay;day++){
      const date=dateISO(new Date(calendarYear,calendarMonth,day));
      const list=byDate.get(date)||[];
      const button=textNode("button",String(day),"calendar-day");
      button.type="button";button.dataset.date=date;
      if(date===selectedDate)button.classList.add("selected");
      if(date===today())button.classList.add("is-today");
      const types=[...new Set(list.map(r=>r.kind))];
      if(types.length){
        const dots=textNode("span","","calendar-dots");
        for(const kind of ["weight","meal","measure","day_note"]){
          if(types.includes(kind))dots.append(textNode("i","",kind));
        }
        button.append(dots);
      }
      button.setAttribute("aria-pressed",String(date===selectedDate));
      button.setAttribute("aria-label",fmtDate(date)+", "+list.length+" registros");
      button.addEventListener("click",()=>{
        selectedDate=date;renderCalendar(getCtx());
      });
      grid.append(button);
    }
    const monthly=monthSummary(ctx.entries,calendarYear,calendarMonth);
    const stats=$("calendar-monthly-stats");stats.replaceChildren();
    const data=[
      ["Pesajes",monthly.weights],
      ["Comidas",monthly.meals],
      ["Días con comidas",monthly.mealDays],
      ["Medidas",monthly.measures],
      ["Notas",monthly.notes],
      ["Cambio de peso",monthly.variation===null?"—":
        (monthly.variation>0?"+":"")+number(monthly.variation)+" kg"]
    ];
    for(const [title,value] of data){
      const box=textNode("div","","calendar-stat");
      box.append(textNode("span",title),textNode("strong",String(value)));stats.append(box);
    }
    renderDay(ctx);
  }
  function renderDay(ctx){
    $("calendar-day-title").textContent=fmtDate(selectedDate);
    const details=$("calendar-day-records");details.replaceChildren();
    const records=ctx.entries.filter(row=>row.date===selectedDate&&row.kind!=="favorite")
      .sort((a,b)=>a.kind.localeCompare(b.kind));
    const note=records.find(row=>row.kind==="day_note");
    const values=records.filter(row=>row.kind!=="day_note");
    if(!values.length)details.append(textNode("p","Sin pesajes, comidas ni medidas ese día.","empty-state"));
    for(const row of values){
      const labels={
        weight:"Peso: "+number(row.value)+" kg",
        meal:row.type+" · "+row.description,
        measure:"Medidas: "+Object.entries(measureFields)
          .filter(([key])=>row[key]!=null).map(([key])=>number(row[key])+" cm").join(" / ")
      };
      details.append(textNode("div",labels[row.kind]||row.kind,"calendar-day-record"));
    }
    if(lastRenderedDate!==selectedDate||document.activeElement!==$("daily-note-text"))
      $("daily-note-text").value=note?.text||"";
    lastRenderedDate=selectedDate;
    $("daily-note-save").textContent=note?"Actualizar nota del día":"Guardar nota del día";
    support();
  }
  function openCalendar(){
    if(!getCtx())return;
    previousFocus=document.activeElement;
    calendarOpen=true;
    const date=localDate(today());
    calendarYear=date.getFullYear();calendarMonth=date.getMonth();selectedDate=today();
    $("calendar-overlay").hidden=false;
    document.body.classList.add("calendar-open");
    renderCalendar(getCtx());
    $("calendar-dialog").focus({preventScroll:true});
  }
  function closeCalendar(){
    if(!calendarOpen)return;
    calendarOpen=false;
    $("calendar-overlay").hidden=true;
    document.body.classList.remove("calendar-open");
    previousFocus?.focus?.({preventScroll:true});
  }
  async function toggleFavorite(meal){
    if(!allowed()){toast("Actualiza Apps Script para sincronizar tus favoritos.");return}
    const ctx=getCtx();
    const key=favoriteKey(meal);
    const old=ctx.entries.find(row=>row.kind==="favorite"&&favoriteKey(row)===key);
    if(old){await api.deleteRecord(old);return}
    const now=new Date().toISOString();
    const record={id:uuid(),kind:"favorite",date:today(),type:meal.type,
      description:meal.description,notes:meal.notes||"",createdAt:now,updatedAt:now};
    await api.change({kind:"favorite",action:"upsert",recordId:record.id,record},
      state=>{state.entries=state.entries.concat([record])},{message:"Comida guardada en favoritos"});
  }
  $("open-measure-form").addEventListener("click",()=>showMeasure());
  $("measure-today").addEventListener("click",()=>{$("measure-date").value=today()});
  $("measure-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!allowed()){toast("Actualiza Apps Script para guardar medidas.");return}
    const date=$("measure-date").value;
    if(!validDate(date)){toast("Comprueba la fecha");return}
    const data={};let any=false;
    for(const [name,id] of Object.entries(measureFields)){
      const raw=$(id).value.trim();
      data[name]=raw===""?null:Number(raw);
      if(data[name]!==null){
        if(!Number.isFinite(data[name])||data[name]<10||data[name]>250){
          toast("Las medidas deben estar entre 10 y 250 cm");return;
        }
        any=true;
      }
    }
    if(!any){toast("Introduce al menos una medida");return}
    const notes=$("measure-notes").value.trim();
    const ctx=getCtx(),old=ctx.entries.find(row=>row.id===editingMeasure),now=new Date().toISOString();
    const record={id:old?.id||uuid(),kind:"measure",date,...data,notes,
      createdAt:old?.createdAt||now,updatedAt:now};
    const button=$("measure-submit");button.disabled=true;
    try{
      const ok=await api.change({kind:"measure",action:"upsert",recordId:record.id,record},
        state=>{state.entries=state.entries.filter(row=>row.id!==record.id).concat([record])});
      if(ok){editingMeasure=null;api.composer.hide()}
    }finally{button.disabled=!allowed()}
  });
  $("open-calendar-weight").addEventListener("click",openCalendar);
  $("open-calendar-meal").addEventListener("click",openCalendar);
  $("calendar-close").addEventListener("click",closeCalendar);
  $("calendar-backdrop").addEventListener("click",closeCalendar);
  $("calendar-prev").addEventListener("click",()=>{
    const d=new Date(calendarYear,calendarMonth-1,1);
    calendarMonth=d.getMonth();calendarYear=d.getFullYear();
    selectedDate=dateISO(d);renderCalendar(getCtx());
  });
  $("calendar-next").addEventListener("click",()=>{
    const d=new Date(calendarYear,calendarMonth+1,1);
    calendarMonth=d.getMonth();calendarYear=d.getFullYear();
    selectedDate=dateISO(d);renderCalendar(getCtx());
  });
  $("daily-note-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!allowed()){toast("Actualiza Apps Script para guardar notas.");return}
    const ctx=getCtx(),text=$("daily-note-text").value.trim();
    const old=ctx.entries.find(r=>r.kind==="day_note"&&r.date===selectedDate);
    if(!text){
      if(old)await api.deleteRecord(old);
      else toast("Escribe una nota para guardarla");
      return;
    }
    if(text.length>1000){toast("La nota es demasiado larga");return}
    const now=new Date().toISOString();
    const record={id:old?.id||uuid(),kind:"day_note",date:selectedDate,text,
      createdAt:old?.createdAt||now,updatedAt:now};
    await api.change({kind:"day_note",action:"upsert",recordId:record.id,record},
      state=>{state.entries=state.entries.filter(row=>row.id!==record.id).concat([record])},
      {message:"Nota diaria guardada"});
  });
  $("export-csv").addEventListener("click",()=>{
    const ctx=getCtx();if(!ctx)return;
    saveFile(csvContent(ctx),"text/csv;charset=utf-8","balance-"+ctx.userId+"-"+today()+".csv");
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&calendarOpen){event.preventDefault();closeCalendar()}
  });
  function render(ctx){
    support();
    measures(ctx);progress(ctx);
    renderCalendar(ctx);
  }
  return {render,showMeasure,closeCalendar,toggleFavorite,calendarIsOpen:()=>calendarOpen};
}
