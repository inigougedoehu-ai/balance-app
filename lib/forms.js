import {render,toast,resetForm,fillForm,today} from "./ui.js";
const $=id=>document.getElementById(id);
const uuid=()=>crypto.randomUUID();
const dateValid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d)) &&
  !Number.isNaN(Date.parse(d+"T12:00:00Z")) &&
  new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;

export function createForms(getCtx,afterSave){
  let editingWeight=null,editingMeal=null;
  function repaint(){
    const ctx=getCtx();
    if(ctx)render(ctx,editRecord,deleteRecord);
  }
  function editRecord(record){
    if(record.kind==="weight")editingWeight=record.id;
    else editingMeal=record.id;
    fillForm(record);
  }
  async function change(op,modify){
    const ctx=getCtx();
    if(!ctx)return;
    modify(ctx);
    ctx.pending.push({id:uuid(),...op});
    try{
      await ctx.save();
      repaint();
      afterSave();
      toast("Registro guardado en este dispositivo");
    }catch(error){
      console.error("Balance: error de almacenamiento",error);
      toast("No se ha podido confirmar el guardado local");
    }
  }
  async function deleteRecord(record){
    if(!confirm("¿Borrar este registro? El cambio se sincronizará con Google."))return;
    await change({kind:record.kind,action:"delete",recordId:record.id},
      ctx=>{ctx.entries=ctx.entries.filter(r=>r.id!==record.id)});
    if(editingWeight===record.id){editingWeight=null;resetForm("weight")}
    if(editingMeal===record.id){editingMeal=null;resetForm("meal")}
  }
  $("weight-cancel").addEventListener("click",()=>{editingWeight=null;resetForm("weight")});
  $("meal-cancel").addEventListener("click",()=>{editingMeal=null;resetForm("meal")});
  $("weight-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const ctx=getCtx();
    if(!ctx)return;
    const date=$("weight-date").value,value=Number($("weight-value").value);
    if(!dateValid(date)||!Number.isFinite(value)||value<15||value>500){toast("Comprueba fecha y peso");return}
    const old=ctx.entries.find(e=>e.id===editingWeight);
    const now=new Date().toISOString();
    const record={id:old?.id||uuid(),kind:"weight",date,value,
      createdAt:old?.createdAt||now,updatedAt:now};
    await change({kind:"weight",action:"upsert",recordId:record.id,record},
      c=>{c.entries=c.entries.filter(e=>e.id!==record.id).concat(record)});
    editingWeight=null;resetForm("weight");
  });
  $("meal-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const ctx=getCtx();if(!ctx)return;
    const date=$("meal-date").value,type=$("meal-type").value;
    const description=$("meal-description").value.trim(),notes=$("meal-notes").value.trim();
    if(!dateValid(date)||!description||description.length>400||notes.length>600){
      toast("Revisa la fecha y la descripción de la comida");return;
    }
    const old=ctx.entries.find(e=>e.id===editingMeal);
    const now=new Date().toISOString();
    const record={id:old?.id||uuid(),kind:"meal",date,type,description,notes,
      createdAt:old?.createdAt||now,updatedAt:now};
    await change({kind:"meal",action:"upsert",recordId:record.id,record},
      c=>{c.entries=c.entries.filter(e=>e.id!==record.id).concat(record)});
    editingMeal=null;resetForm("meal");
  });
  $("goal-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const ctx=getCtx();if(!ctx)return;
    const raw=$("goal-value").value.trim();
    const value=raw===""?null:Number(raw);
    if(value!==null&&(!Number.isFinite(value)||value<15||value>500)){
      toast("El objetivo no es válido");return;
    }
    await change({kind:"goal",action:"set",value},c=>{c.goal=value});
  });
  $("export-data").addEventListener("click",()=>{
    const ctx=getCtx();if(!ctx)return;
    const json={format:"balance-v1",userId:ctx.userId,exportedAt:new Date().toISOString(),
      goal:ctx.goal,entries:ctx.entries};
    const url=URL.createObjectURL(new Blob([JSON.stringify(json,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;
    a.download="balance-"+ctx.userId+"-"+today()+".json";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {repaint,reset:()=>{editingWeight=null;editingMeal=null;resetForm("weight");resetForm("meal")}};
}
