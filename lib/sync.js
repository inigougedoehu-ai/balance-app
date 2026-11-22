import {request} from "./bridge.js";

// Aplicación idempotente: operaciones con UUID propio, sin duplicados en Sheets.
export function createSynchronizer(ctx,sessionToken,onChange,onStatus){
  let active=false,rerun=false;
  async function sync(){
    if(active){rerun=true;return}
    if(!sessionToken){onStatus("Sin internet o sin sesión: los cambios están cifrados en este dispositivo.","working");return}
    active=true;
    onStatus("Sincronizando con Google Sheets…","working");
    try{
      await ctx.flush();
      while(ctx.pending.length){
        const batch=ctx.pending.slice(0,30);
        const answer=await request("push",{token:sessionToken,operations:batch});
        if(!answer?.ok||!Array.isArray(answer.confirmed)||!batch.every(x=>answer.confirmed.includes(x.id))){
          throw Error("El servidor no confirmó todos los cambios");
        }
        const ack=new Set(answer.confirmed);
        ctx.pending=ctx.pending.filter(x=>!ack.has(x.id));
        await ctx.save();
      }
      const snapshot=await request("pull",{token:sessionToken});
      if(!snapshot?.ok||!Array.isArray(snapshot.weights)||!Array.isArray(snapshot.meals)){
        throw Error("El servidor no ha devuelto los registros completos");
      }
      const map=new Map();
      const remoteExtras=Array.isArray(snapshot.extras)?snapshot.extras:
        ctx.entries.filter(entry=>["measure","day_note","favorite"].includes(entry.kind));
      for(const entry of [...snapshot.weights,...snapshot.meals,...remoteExtras])
        map.set(entry.id,entry);
      let goal=snapshot.goal;
      // Los servidores antiguos no incluían estos dos campos.
      let heightCm=Object.prototype.hasOwnProperty.call(snapshot,"heightCm")
        ?snapshot.heightCm:ctx.heightCm;
      let birthDate=Object.prototype.hasOwnProperty.call(snapshot,"birthDate")
        ?snapshot.birthDate:ctx.birthDate;
      for(const op of ctx.pending){
        if(op.kind==="goal")goal=op.value;
        else if(op.kind==="profile"){
          heightCm=op.value.heightCm;
          birthDate=op.value.birthDate;
        }
        else if(op.action==="delete")map.delete(op.recordId);
        else if(op.action==="upsert")map.set(op.recordId,op.record);
      }
      ctx.entries=Array.from(map.values());
      ctx.goal=goal;
      ctx.heightCm=heightCm;
      ctx.birthDate=birthDate;
      ctx.syncedAt=new Date().toISOString();
      await ctx.save();
      onChange();
      onStatus(ctx.pending.length
        ?ctx.pending.length+" cambios pendientes de sincronizar."
        :"Todos los registros están sincronizados con Google Sheets.","success");
    }catch(error){
      onStatus("Sin sincronizar: "+error.message+". Tus datos siguen guardados en este dispositivo.","error");
      console.error("Balance: fallo de sincronización",error);
    }finally{
      active=false;
      if(rerun){rerun=false;setTimeout(sync,250)}
    }
  }
  return {sync,isBusy:()=>active};
}
