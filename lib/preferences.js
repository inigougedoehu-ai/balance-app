// Preferencias visuales y recordatorios que se comprueban al abrir Balance.
// Nunca se comparten entre cuentas ni requieren permisos de notificaciones.
const FLAGS=[
  ["show-bmi","health-bmi"],["show-classification","health-classification"],
  ["show-change","health-change"],["show-average","health-avg7"],
  ["show-progress","progress-card"]
];
const prefix="balance-prefs-v1:";
const routePrefix="balance-last-tab-v1:";
const reminderPrefix="balance-reminder-shown-v1:";
const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
const write=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const defaults=()=>({visible:Object.fromEntries(FLAGS.map(([id])=>[id,true])),reminder:{frequency:"off",weekday:1,time:"09:00"}});
export function createPreferences(getAccount,notify){
  let settings=defaults();
  function load(){
    settings=defaults();
    const user=getAccount();
    if(user){
      try{
        const saved=JSON.parse(read(prefix+user)||"{}");
        for(const [id] of FLAGS)
          if(typeof saved.visible?.[id]==="boolean")settings.visible[id]=saved.visible[id];
        if(["off","daily","weekly"].includes(saved.reminder?.frequency))
          settings.reminder.frequency=saved.reminder.frequency;
        if(Number.isInteger(saved.reminder?.weekday)&&saved.reminder.weekday>=0&&saved.reminder.weekday<=6)
          settings.reminder.weekday=saved.reminder.weekday;
        if(/^([01]\d|2[0-3]):[0-5]\d$/.test(saved.reminder?.time||""))
          settings.reminder.time=saved.reminder.time;
      }catch{}
    }
    for(const [id] of FLAGS)document.getElementById(id).checked=settings.visible[id];
    document.getElementById("reminder-frequency").value=settings.reminder.frequency;
    document.getElementById("reminder-weekday").value=String(settings.reminder.weekday);
    document.getElementById("reminder-time").value=settings.reminder.time;
    apply();
    document.getElementById("reminder-status").textContent=settings.reminder.frequency==="off"?
      "Los avisos están desactivados.":"Verás el aviso al abrir Balance, si corresponde.";
  }
  function persist(){
    const user=getAccount();if(!user)return;
    write(prefix+user,JSON.stringify(settings));
  }
  function apply(){
    for(const [id,target] of FLAGS){
      const el=document.getElementById(target);
      if(!el)continue;
      if(id==="show-progress"){
        if(!settings.visible[id])el.hidden=true;
      }else el.hidden=!settings.visible[id];
    }
    const overview=document.querySelector(".health-overview");
    if(overview)overview.hidden=FLAGS.slice(0,4).every(([id])=>!settings.visible[id]);
  }
  for(const [id] of FLAGS){
    document.getElementById(id).addEventListener("change",event=>{
      if(!getAccount())return;
      settings.visible[id]=event.target.checked;
      persist();notify();apply();
    });
  }
  document.getElementById("reminder-form").addEventListener("submit",event=>{
    event.preventDefault();
    if(!getAccount())return;
    const frequency=document.getElementById("reminder-frequency").value;
    const weekday=Number(document.getElementById("reminder-weekday").value);
    const time=document.getElementById("reminder-time").value;
    if(!["off","daily","weekly"].includes(frequency)||!Number.isInteger(weekday)||weekday<0||weekday>6||
       !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return;
    settings.reminder={frequency,weekday,time};
    persist();
    document.getElementById("reminder-status").textContent=frequency==="off"?
      "Recordatorio desactivado.":"Recordatorio guardado. Aparecerá al abrir Balance, si corresponde.";
  });
  function checkReminder(ctx){
    if(!ctx)return;
    const r=settings.reminder,now=new Date(),date=iso(now),key=reminderPrefix+ctx.userId;
    if(r.frequency==="off"||now.toTimeString().slice(0,5)<r.time||
      (r.frequency==="weekly"&&now.getDay()!==r.weekday)||
      ctx.entries.some(row=>row.kind==="weight"&&row.date===date)||read(key)===date)return;
    write(key,date);
    notify("Recordatorio: hoy puedes registrar tu peso.");
  }
  function lastView(){
    const user=getAccount();const v=user&&read(routePrefix+user);
    return v==="comidas"?"comidas":"peso";
  }
  function saveView(view){
    const user=getAccount();
    if(user&&["peso","comidas"].includes(view))write(routePrefix+user,view);
  }
  return {load,apply,checkReminder,lastView,saveView};
}
