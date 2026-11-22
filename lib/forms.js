import {ageYears} from "./health.js";
import {render,toast,resetForm,fillForm,today,textNode} from "./ui.js";

const $=id=>document.getElementById(id);
const uuid=()=>crypto.randomUUID();
const dateValid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d)) &&
  !Number.isNaN(Date.parse(d+"T12:00:00Z")) &&
  new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;

export function createForms(getCtx,afterSave,canEditProfile=()=>true,composer){
  let editingWeight=null,editingMeal=null,features=null;
  let weightBusy=false,mealBusy=false;
  function repaint(){
    const ctx=getCtx();
    if(ctx){
      render(ctx,editRecord,deleteRecord,repeatMeal,meal=>features?.toggleFavorite(meal));
      features?.render(ctx);
      if(!$("composer-meal-slot").hidden)showSuggestions(ctx);
    }
  }
  function showSuggestions(ctx){
    const items=ctx.entries.filter(row=>row.kind==="meal").slice()
      .sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    const map=new Map();
    for(const meal of items){
      const key=meal.type+"|"+meal.description.trim().toLowerCase();
      const old=map.get(key);
      if(old)old.count++;
      else map.set(key,{meal,count:1,recency:meal.date});
    }
    const allFavorites=ctx.entries.filter(row=>row.kind==="favorite");
    const favorites=allFavorites.slice().sort((a,b)=>b.date.localeCompare(a.date))
      .map(meal=>({meal,count:0,favorite:true,recency:meal.date}));
    const keys=new Set(favorites.map(item=>item.meal.type+"|"+item.meal.description.trim().toLocaleLowerCase("es")));
    const frequent=[...map.values()].filter(item=>!keys.has(item.meal.type+"|"+item.meal.description.trim().toLocaleLowerCase("es")))
      .sort((a,b)=>b.count-a.count||b.recency.localeCompare(a.recency));
    const picks=favorites.concat(frequent).slice(0,7);
    const box=$("meal-suggestions"),list=$("meal-suggestions-list");
    list.replaceChildren();
    box.hidden=!picks.length;
    for(const item of picks){
      const button=textNode("button","","meal-suggestion");
      button.type="button";
      const description=item.meal.description.length>60?item.meal.description.slice(0,58)+"…":item.meal.description;
      button.append(textNode("strong",description),textNode("small",
        (item.favorite?"★ Favorito · ":"")+item.meal.type+(item.count>1?" · "+item.count+" veces":"")));
      button.addEventListener("click",()=>prefillMeal(item.meal));
      list.append(button);
    }
  }
  function prefillMeal(meal){
    editingMeal=null;
    resetForm("meal");
    $("meal-date").value=today();
    $("meal-type").value=meal.type;
    $("meal-description").value=meal.description;
    $("meal-notes").value=meal.notes||"";
    $("meal-description").focus();
  }
  function open(kind,record=null,isRepeat=false){
    if(!getCtx()||!["weight","meal"].includes(kind))return;
    if(kind==="weight"){
      editingWeight=null;
      resetForm("weight");
      if(record){
        editingWeight=record.id;
        fillForm(record);
      }
    }else{
      editingMeal=null;
      resetForm("meal");
      if(record){
        if(isRepeat)prefillMeal(record);
        else{
          editingMeal=record.id;
          fillForm(record);
        }
      }
      showSuggestions(getCtx());
    }
    composer.show(kind);
  }
  function editRecord(record){open(record.kind,record)}
  function repeatMeal(record){open("meal",record,true)}
  async function change(op,modify,options={}){
    const ctx=getCtx();
    if(!ctx)return false;
    modify(ctx);
    ctx.pending.push({id:uuid(),...op});
    ctx.revision=(ctx.revision||0)+1;
    try{
      await ctx.save();
      if(ctx!==getCtx())return false;
      repaint();
      afterSave();
      if(!options.silent)toast(options.message||(
        op.kind==="profile"?"Datos personales guardados":
        op.kind==="goal"?"Objetivo guardado":"Registro guardado"));
      return true;
    }catch(error){
      console.error("Balance: error guardando el registro",error);
      toast("No se ha podido confirmar el guardado local. Revisa el almacenamiento.");
      return false;
    }
  }
  async function deleteRecord(record){
    const ctx=getCtx();if(!ctx)return;
    const original=structuredClone(record);
    const saved=await change({kind:record.kind,action:"delete",recordId:record.id},
      state=>{state.entries=state.entries.filter(row=>row.id!==record.id)},
      {silent:true});
    if(!saved)return;
    if(editingWeight===record.id)editingWeight=null;
    if(editingMeal===record.id)editingMeal=null;
    toast("Registro eliminado",{
      actionLabel:"Deshacer",
      onAction:async()=>{
        if(ctx!==getCtx()||ctx.entries.some(row=>row.id===original.id))return;
        const restored={...original,updatedAt:new Date().toISOString()};
        await change({kind:record.kind,action:"upsert",recordId:restored.id,record:restored},
          state=>{state.entries=state.entries.concat([restored])},
          {message:"Registro restaurado"});
      }
    });
  }
  function reset(){
    editingWeight=null;editingMeal=null;
    resetForm("weight");resetForm("meal");
  }
  $("weight-today").addEventListener("click",()=>{$("weight-date").value=today()});
  $("meal-today").addEventListener("click",()=>{$("meal-date").value=today()});
  $("meal-filter").addEventListener("change",repaint);
  $("chart-period").addEventListener("change",repaint);
  $("profile-birth-date").max=today();
  $("profile-birth-date").addEventListener("change",()=>{
    const age=ageYears($("profile-birth-date").value);
    $("profile-age").textContent=age===null?"Edad: sin configurar":"Edad: "+age+" años";
  });
  $("weight-cancel").addEventListener("click",()=>{editingWeight=null;composer.hide()});
  $("meal-cancel").addEventListener("click",()=>{editingMeal=null;composer.hide()});

  $("weight-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(weightBusy||!getCtx())return;
    const date=$("weight-date").value,value=Number($("weight-value").value);
    if(!dateValid(date)||!Number.isFinite(value)||value<15||value>500){
      toast("Comprueba la fecha y el peso");return;
    }
    weightBusy=true;$("weight-submit").disabled=true;
    try{
      const ctx=getCtx();
      let old=ctx.entries.find(row=>row.id===editingWeight);
      const sameDate=ctx.entries.filter(row=>row.kind==="weight"&&row.date===date&&row.id!==editingWeight)
        .sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0];
      if(old&&sameDate){
        toast("Ya existe otro pesaje en esa fecha. Elige otra fecha.");
        return;
      }
      if(!old&&sameDate){
        if(!confirm("Ya hay un pesaje el "+date+". ¿Quieres actualizarlo con este valor?"))return;
        old=sameDate;
      }
      const now=new Date().toISOString();
      const record={id:old?.id||uuid(),kind:"weight",date,value,
        createdAt:old?.createdAt||now,updatedAt:now};
      const okay=await change({kind:"weight",action:"upsert",recordId:record.id,record},
        state=>{state.entries=state.entries.filter(row=>row.id!==record.id).concat([record])});
      if(okay){editingWeight=null;resetForm("weight");composer.hide()}
    }finally{weightBusy=false;$("weight-submit").disabled=false}
  });
  $("meal-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(mealBusy||!getCtx())return;
    const date=$("meal-date").value,type=$("meal-type").value;
    const description=$("meal-description").value.trim(),notes=$("meal-notes").value.trim();
    if(!dateValid(date)||!description||description.length>400||notes.length>600){
      toast("Revisa la fecha y la descripción");return;
    }
    mealBusy=true;$("meal-submit").disabled=true;
    try{
      const ctx=getCtx(),old=ctx.entries.find(row=>row.id===editingMeal);
      const now=new Date().toISOString();
      const record={id:old?.id||uuid(),kind:"meal",date,type,description,notes,
        createdAt:old?.createdAt||now,updatedAt:now};
      const okay=await change({kind:"meal",action:"upsert",recordId:record.id,record},
        state=>{state.entries=state.entries.filter(row=>row.id!==record.id).concat([record])});
      if(okay){editingMeal=null;resetForm("meal");composer.hide()}
    }finally{mealBusy=false;$("meal-submit").disabled=false}
  });
  $("profile-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!getCtx())return;
    if(!canEditProfile()){toast("Actualiza Apps Script para guardar el perfil.");return}
    const heightRaw=$("profile-height").value.trim();
    const birthRaw=$("profile-birth-date").value.trim();
    const heightCm=heightRaw===""?null:Number(heightRaw),birthDate=birthRaw===""?null:birthRaw;
    if(heightCm!==null&&(!Number.isFinite(heightCm)||heightCm<90||heightCm>250)){
      toast("La altura debe estar entre 90 y 250 cm");return;
    }
    if(birthDate!==null&&(!dateValid(birthDate)||birthDate<"1900-01-01"||birthDate>today())){
      toast("Revisa la fecha de nacimiento");return;
    }
    await change({kind:"profile",action:"set",value:{heightCm,birthDate}},
      state=>{state.heightCm=heightCm;state.birthDate=birthDate});
  });
  $("goal-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!getCtx())return;
    const raw=$("goal-value").value.trim(),value=raw===""?null:Number(raw);
    if(value!==null&&(!Number.isFinite(value)||value<15||value>500)){
      toast("El objetivo no es válido");return;
    }
    await change({kind:"goal",action:"set",value},state=>{state.goal=value});
  });
  $("export-data").addEventListener("click",()=>{
    const ctx=getCtx();if(!ctx)return;
    const info={format:"balance-v1",userId:ctx.userId,exportedAt:new Date().toISOString(),
      goal:ctx.goal,heightCm:ctx.heightCm,birthDate:ctx.birthDate,entries:ctx.entries};
    const url=URL.createObjectURL(new Blob([JSON.stringify(info,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="balance-"+ctx.userId+"-"+today()+".json";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {repaint,reset,open,deleteRecord,change,setFeatures:next=>{features=next}};
}
