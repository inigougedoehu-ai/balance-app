import {request} from "./bridge.js";

// Cola cifrada e idempotente, con comprobación de versión del registro
// cuando el backend 0.8 la admite. Las decisiones de conflicto son explícitas.
const isRecord=kind=>["weight","meal","measure","day_note","favorite"].includes(kind);
const keyOf=op=>op.kind+":"+op.recordId;
function remoteRecords(snapshot,local){
  const extras=Array.isArray(snapshot.extras)?snapshot.extras:
    local.filter(row=>["measure","day_note","favorite"].includes(row.kind));
  return [...snapshot.weights,...snapshot.meals,...extras];
}
export function createSynchronizer(ctx,sessionToken,onChange,onStatus){
  let active=false,rerun=false;
  function blocked(op){return isRecord(op.kind)&&ctx.conflicts.some(c=>c.key===keyOf(op))}
  function report(kind="success"){
    const blockedCount=ctx.conflicts.length,waiting=ctx.pending.length;
    onStatus(blockedCount?
      blockedCount+" conflicto(s) por resolver · "+waiting+" cambio(s) pendientes.":
      waiting?waiting+" cambios pendientes de sincronizar. Los registros siguen guardados localmente.":
      "Todos los registros están sincronizados con Google Sheets.",blockedCount?"error":kind);
  }
  async function sync(){
    if(active){rerun=true;return}
    if(!sessionToken){onStatus("Sin sesión remota: los registros están cifrados en este dispositivo.","working");return}
    active=true;
    onStatus("Sincronizando con Google Sheets…","working");
    try{
      await ctx.flush();
      let iterations=0;
      while(true){
        if(++iterations>150)throw Error("Demasiadas operaciones pendientes");
        const batch=ctx.pending.filter(op=>!blocked(op)).slice(0,30);
        if(!batch.length)break;
        for(const op of batch){
          if(isRecord(op.kind)&&!Object.prototype.hasOwnProperty.call(op,"baseUpdatedAt"))
            op.baseUpdatedAt=Object.prototype.hasOwnProperty.call(ctx.remoteBase,keyOf(op))
              ?ctx.remoteBase[keyOf(op)]:null;
        }
        await ctx.save();
        const answer=await request("push",{token:sessionToken,operations:batch});
        if(!answer?.ok||!Array.isArray(answer.confirmed))throw Error("Respuesta de sincronización inválida");
        const ack=new Set(answer.confirmed),conflicts=answer.conflicts||[];
        if(!Array.isArray(conflicts)||batch.some(op=>!ack.has(op.id)&&!conflicts.some(c=>c.operationId===op.id)))
          throw Error("El servidor no confirmó todas las operaciones");
        for(const c of conflicts){
          const k=c.kind+":"+c.recordId;
          if(!ctx.conflicts.some(item=>item.key===k))
            ctx.conflicts.push({key:k,kind:c.kind,recordId:c.recordId,serverUpdatedAt:c.serverUpdatedAt??null});
        }
        ctx.pending=ctx.pending.filter(op=>!ack.has(op.id));
        // Operaciones posteriores sobre un registro recién escrito esperan
        // la versión confirmada por el servidor, incluso en otro lote.
        for(const [k,revision] of Object.entries(answer.revisions||{})){
          ctx.remoteBase[k]=revision;
          for(const op of ctx.pending)if(isRecord(op.kind)&&keyOf(op)===k)
            op.baseUpdatedAt=revision;
        }
        await ctx.save();
        if(!ack.size&&!conflicts.length)throw Error("La sincronización no ha avanzado");
      }
      const snapshot=await request("pull",{token:sessionToken});
      if(!snapshot?.ok||!Array.isArray(snapshot.weights)||!Array.isArray(snapshot.meals))
        throw Error("La copia remota es incompleta");
      const records=remoteRecords(snapshot,ctx.entries);
      const map=new Map(records.map(row=>[row.id,row]));
      const base={};
      for(const row of records)base[row.kind+":"+row.id]=row.updatedAt??null;
      let goal=snapshot.goal;
      let heightCm=Object.prototype.hasOwnProperty.call(snapshot,"heightCm")?
        snapshot.heightCm:ctx.heightCm;
      let birthDate=Object.prototype.hasOwnProperty.call(snapshot,"birthDate")?
        snapshot.birthDate:ctx.birthDate;
      // Aplica también las operaciones creadas mientras se esperaba la red.
      for(const op of ctx.pending){
        if(op.kind==="goal")goal=op.value;
        else if(op.kind==="profile"){
          heightCm=op.value.heightCm;birthDate=op.value.birthDate;
        }else if(op.action==="delete")map.delete(op.recordId);
        else if(op.action==="upsert")map.set(op.recordId,op.record);
      }
      ctx.entries=[...map.values()];
      ctx.remoteBase=base;
      ctx.goal=goal;ctx.heightCm=heightCm;ctx.birthDate=birthDate;
      ctx.syncedAt=new Date().toISOString();
      await ctx.save();
      onChange();
      report();
    }catch(error){
      onStatus("Sin sincronizar: "+error.message+". La copia local sigue disponible.","error");
      console.error("Balance: fallo de sincronización",error);
    }finally{
      active=false;
      if(rerun){rerun=false;setTimeout(sync,250)}
    }
  }
  async function resolve(kind,recordId,strategy){
    if(!["remote","local"].includes(strategy)||active)return false;
    const key=kind+":"+recordId;
    if(!ctx.conflicts.some(item=>item.key===key))return false;
    if(strategy==="local"){
      for(const op of ctx.pending){
        if(isRecord(op.kind)&&keyOf(op)===key)
          op.baseUpdatedAt=Object.prototype.hasOwnProperty.call(ctx.remoteBase,key)?ctx.remoteBase[key]:null;
      }
      ctx.conflicts=ctx.conflicts.filter(c=>c.key!==key);
      await ctx.save();
      onChange();sync();return true;
    }
    // Elegir la versión remota exige recuperarla otra vez; no se usa una
    // instantánea antigua que pudiera sobrescribir cambios recientes.
    const result=await request("pull",{token:sessionToken});
    if(!result?.ok||!Array.isArray(result.weights)||!Array.isArray(result.meals))
      throw Error("No se pudo recuperar la versión remota");
    const remote=remoteRecords(result,ctx.entries).find(row=>row.kind===kind&&row.id===recordId);
    ctx.pending=ctx.pending.filter(op=>!isRecord(op.kind)||keyOf(op)!==key);
    ctx.entries=ctx.entries.filter(row=>row.kind!==kind||row.id!==recordId);
    if(remote)ctx.entries.push(remote);
    ctx.remoteBase[key]=remote?.updatedAt??null;
    ctx.conflicts=ctx.conflicts.filter(c=>c.key!==key);
    await ctx.save();onChange();sync();return true;
  }
  return {sync,resolve,isBusy:()=>active};
}
