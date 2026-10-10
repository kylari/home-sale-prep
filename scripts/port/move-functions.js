/* One-off photo move from the Claude page (hosted site only). Files are named <photo id>.<ext>. */
async function movePhotos(){
  const msg=$("#mv-msg"),files=[...$("#mv-files").files];if(!files.length){msg.textContent="Choose the zip files or photos first.";return}
  $("#mv-go").disabled=true;const todo=[];
  try{
    for(const f of files){
      if(/\.zip$/i.test(f.name)){
        if(!window.JSZip){msg.textContent="Loading the unzip tool…";await new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
        msg.textContent="Opening "+f.name+"…";const z=await JSZip.loadAsync(f);
        z.forEach((p,e)=>{if(!e.dir)todo.push({name:p.split("/").pop(),get:()=>e.async("blob")})});
      }else todo.push({name:f.name,get:async()=>f});
    }
    const TYPES={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",heic:"image/heic",pdf:"application/pdf"};
    const list=todo.map(t=>{const m=t.name.match(/^([0-9a-f]{32})(?:\.(\w+))?$/i);return m?Object.assign(t,{id:m[1].toLowerCase(),type:TYPES[(m[2]||"").toLowerCase()]||"application/octet-stream"}):null}).filter(Boolean);
    if(!list.length){msg.textContent="None of those files have a photo name from the Claude page, so nothing was uploaded.";return}
    const sb=window.homeStore.client();let done=0,bad=[];
    const one=async t=>{try{const b=await t.get();const r=await sb.storage.from("house").upload(t.id,b,{contentType:t.type,upsert:true});if(r.error)bad.push(t.id)}catch(e){bad.push(t.id)}
      done++;msg.textContent=`Uploaded ${done} of ${list.length}…`};
    let i=0;await Promise.all(Array.from({length:4},async()=>{while(i<list.length)await one(list[i++])}));
    msg.textContent=bad.length?`Done, but ${bad.length} of ${list.length} didn't upload. Run it again with the same files to retry them.`:`All ${list.length} uploaded. Reload any page to see them.`;
  }catch(e){msg.textContent="Something went wrong part way through. Run it again with the same files; finished ones are just replaced."}
  finally{$("#mv-go").disabled=false}
}
document.addEventListener("click",e=>{if(e.target.id==="mv-go")movePhotos()});
