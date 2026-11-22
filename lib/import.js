import {today,toast} from "./ui.js";
const $=id=>document.getElementById(id);
const ID=/^[0-9a-f-]{36}$/i;
const dateOK=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  !Number.isNaN(Date.parse(d+"T12:00:00Z"))&&new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;
const mealTypes=["Desayuno","Media mañana","Comida","Merienda","Cena","Otro"];
const extraKinds=["measure","favorite","day_note"];
function validate(row){
  if(!row||typeof row!=="object"||!ID.test(row.id)||!dateOK(row.date))throw Error("Identificador o fecha inválidos");
  const base={id:row.id,kind:row.kind,date:row.date,createdAt:typeof row.createdAt==="string"?row.createdAt:new Date().toISOString(),
    updatedAt:typeof row.updatedAt==="string"?row.updatedAt:new Date().toISOString()};
  if(row.kind==="weight"){
    if(!Number.isFinite(row.value)||row.value<15||row.value>500)throw Error("Peso fuera de rango");
    return {...base,value:row.value};
  }
  if(row.kind==="meal"||row.kind==="favorite"){
    if(!mealTypes.includes(row.type)||typeof row.description!=="string"||
      !row.description.trim()||row.description.length>400||
      (row.notes!==undefined&&(typeof row.notes!=="string"||row.notes.length>600)))throw Error("Comida inválida");
    return {...base,type:row.type,description:row.description,notes:row.notes||""};
  }
  if(row.kind==="day_note"){
    if(typeof row.text!=="string"||!row.text.trim()||row.text.length>1000)throw Error("Nota diaria inválida");
    return {...base,text:row.text};
  }
  if(row.kind==="measure"){
    const data={notes:row.notes||""};
    if(typeof data.notes!=="string"||data.notes.length>400)throw Error("Observaciones inválidas");
    let any=false;
    for(const key of ["waistCm","hipCm","chestCm","armCm"]){
      const value=row[key]??null;
      if(value!==null){
        if(!Number.isFinite(value)||value<10||value>250)throw Error("Medida fuera de rango");
        any=true;
      }
      data[key]=value;
    }
    if(!any)throw Error("Registro de medidas vacío");
    return {...base,...data};
  }
  throw Error("Tipo de registro desconocido");
}
export function parseBackup(raw,userId,existing,allowExtras){
  if(typeof raw!=="string"||raw.length>6_000_000)throw Error("La copia es demasiado grande");
  let file;
  try{file=JSON.parse(raw)}catch{throw Error("El archivo no contiene JSON válido")}
  if(!file||file.format!=="balance-v1"||file.userId!==userId||!Array.isArray(file.entries))
    throw Error("Formato de Balance o cuenta incorrectos");
  if(file.entries.length>3000)throw Error("La copia tiene demasiados registros (máximo 3000 por importación)");
  const known=new Set(existing.map(row=>row.id));
  const incoming=new Set(),records=[];
  let skipped=0;
  for(const original of file.entries){
    const row=validate(original);
    if(incoming.has(row.id))throw Error("La copia repite identificadores");
    incoming.add(row.id);
    if(known.has(row.id)){skipped++;continue}
    if(!allowExtras&&extraKinds.includes(row.kind))
      throw Error("Esta copia contiene medidas, favoritos o notas: necesitas Apps Script 0.7.0 o superior.");
    records.push(row);
  }
  return {records,skipped,total:file.entries.length};
}
export function createImporter(getCtx,api){
  let staged=null,source=null,busy=false;
  const upload=$("import-file"),button=$("import-confirm"),preview=$("import-preview");
  function clear(){
    staged=null;source=null;
    button.disabled=true;preview.textContent="";
    upload.value="";
  }
  upload.addEventListener("change",async()=>{
    staged=null;source=null;button.disabled=true;
    const file=upload.files?.[0];
    if(!file){preview.textContent="";return}
    if(file.size>6_000_000){preview.textContent="Archivo demasiado grande.";return}
    const ctx=getCtx();if(!ctx){preview.textContent="Abre tu cuenta antes de importar.";return}
    try{
      const text=await file.text();
      if(ctx!==getCtx())return;
      const result=parseBackup(text,ctx.userId,ctx.entries,api.canExtras());
      staged=result;source=ctx;
      preview.textContent=result.total+" registros en la copia · "+result.records.length+
        " nuevos · "+result.skipped+" ya existentes. "+
        "Se conservarán todos los registros actuales y no se cambiarán los ajustes.";
      button.disabled=result.records.length===0;
    }catch(error){preview.textContent="No se puede importar: "+error.message}
  });
  button.addEventListener("click",async()=>{
    const ctx=getCtx();
    if(busy||!ctx||ctx!==source||!staged?.records.length)return;
    const plan=staged;
    const existing=new Set(ctx.entries.map(row=>row.id));
    const records=plan.records.filter(row=>!existing.has(row.id));
    if(!records.length){clear();toast("Todos esos registros ya existen");return}
    if(!confirm("¿Importar "+records.length+" registros nuevos a tu cuenta? Los actuales se conservarán."))return;
    busy=true;button.disabled=true;
    try{
      await ctx.flush();
      if(ctx!==getCtx())throw Error("La cuenta ha cambiado");
      const ops=records.map(row=>({id:crypto.randomUUID(),kind:row.kind,
        action:"upsert",recordId:row.id,record:row,baseUpdatedAt:null}));
      const previousEntries=ctx.entries,previousPending=ctx.pending;
      ctx.entries=previousEntries.concat(records);
      ctx.pending=previousPending.concat(ops);
      try{await ctx.save()}
      catch(error){
        ctx.entries=previousEntries;ctx.pending=previousPending;
        await ctx.save().catch(()=>{});
        throw error;
      }
      ctx.revision=(ctx.revision||0)+1;
      api.afterImport();
      clear();
      toast(records.length+" registros importados y guardados localmente");
    }catch(error){preview.textContent="No se ha podido completar la importación: "+error.message}
    finally{busy=false}
  });
  return {clear};
}
