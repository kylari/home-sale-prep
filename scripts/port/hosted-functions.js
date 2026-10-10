function askName(force){return new Promise(res=>{const d=$("#who"),i=$("#who-name");const cur=window.homeStore.actor();
  if(cur&&!force){res(cur);return}i.value=cur;d.showModal();
  $("#whoform").onsubmit=e=>{e.preventDefault();const n=i.value.trim();if(!n)return;window.homeStore.setActor(n);d.close();res(n)};
  d.oncancel=e=>{if(!window.homeStore.actor())e.preventDefault()}})}
function showWho(){const n=window.homeStore.actor();const w=$("#whoami");w.hidden=!n;w.innerHTML=n?`Using as ${esc(n)} · <button type="button" id="whochange">Change</button>`:""}
document.addEventListener("click",async e=>{if(e.target.id==="whochange"){const before=window.homeStore.actor();const n=await askName(true);if(n!==before)location.reload()}});
const HNOUN={tasks:"task",areas:"area",area_groups:"group",contacts:"contact",documents:"document",finishes:"finish",checklists:"checklist",items:"furniture item",members:"member",invites:"invite"};
const HSKIP=new Set(["updated_at","updated_by","updated_by_name","created_at","created_by","created_by_name","extra"]);
function hLabel(r){const d=r.new_data||r.old_data||{};return d.title||d.name||d.item||(d.num?"#"+d.num:"")||r.row_id||""}
function hChanges(r){if(r.action!=="update"||!r.old_data||!r.new_data)return"";const ch=Object.keys(r.new_data).filter(k=>!HSKIP.has(k)&&JSON.stringify(r.new_data[k])!==JSON.stringify(r.old_data[k]));
  const ox=r.old_data.extra||{},nx=r.new_data.extra||{};Object.keys(Object.assign({},ox,nx)).forEach(k=>{if(JSON.stringify(ox[k])!==JSON.stringify(nx[k]))ch.push(k)});
  const L={sort:"order",group_id:"group",now_text:"now",sale_text:"goals for sale",current_photos:"current photos",cost_low:"low estimate",cost_high:"high estimate",est_hours:"estimated hours",act_hours:"actual hours",after_ids:"waits on",contact_id:"contact",repeat_months:"repeat",next_made:"next repeat",desc_agreed:"description agreed",tasks_agreed:"tasks agreed",choice_notes:"choice notes",mats:"materials",conf:"confidence",have:"status",vision:"inspiration"};
  return ch.length?"Changed "+[...new Set(ch.map(k=>L[k]||k.replace(/_/g," ")))].join(", "):""}
async function renderHistory(){const ul=$("#histlist");try{const rows=await window.homeStore.history(200);
  if(!rows.length){ul.innerHTML='<li class="note">No changes yet.</li>';return}
  const verb={insert:"added",update:"changed",delete:"removed"};
  ul.innerHTML=rows.map(r=>{const t=new Date(r.at);const lbl=hLabel(r);const num=(r.new_data||r.old_data||{}).num;
    return `<li><div><strong>${esc(r.actor||"Someone")}</strong> ${verb[r.action]} ${HNOUN[r.table_name]||r.table_name}${lbl?` <strong>${esc((num&&r.table_name==="tasks"?"#"+num+" ":"")+lbl)}</strong>`:""}</div>
    <div class="chg">${esc(hChanges(r))}</div><div class="when">${t.toLocaleString("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}</div></li>`}).join("")}
  catch(e){ul.innerHTML='<li class="note">Couldn\'t load the history. Reload to try again.</li>'}}
