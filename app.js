// app.js v26 — idem anterior, só altera o badge do calendário
import { CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(function(){
  'use strict';
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast=(m)=>{const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,1800);};
  const showErr=(m)=>{const el=$('#errbox'); if(!el) return; el.textContent=String(m||'Erro'); el.hidden=false;};
  const hideErr=()=>{const el=$('#errbox'); if(el) el.hidden=true;};
  const fmtDate=(d)=>{try{if(typeof d==='string')return d;return d.toISOString().slice(0,10);}catch{return '';}};
  const parseTime=(str)=>{if(!str)return null;const [h,m]=str.split(':').map(Number);return h*60+m;};
  const mats=(r)=>`copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;
  const byDateTime=(a,b)=> (a.date===b.date? (b.start_time||'').localeCompare(a.start_time||'') : (a.date>b.date?-1:1));
  const slug=(s)=> String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-_]/gi,'').toLowerCase();

  const app = initializeApp(CONFIG.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const festasCol = collection(db, 'festas');

  let CACHE = []; let loading = false;
  const navActions=$('#nav-actions'), fab=$('#fab-new');
  const loginSection=$('#login-section'), appSection=$('#app-section'), currentUser=$('#current-user');
  const tbody=$('#tbody-parties'), cards=$('#cards'), emptyMsg=$('#empty-msg'), loadingMsg=$('#loading-msg');
  const loginForm=$('#login-form'), btnLogin=$('#btn-login');
  const btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), btnLogout=$('#btn-logout');
  const form=$('#party-form'), dialogTitle=$('#dialog-title'), btnSave=$('#btn-save');
  const viewContent=$('#view-content');
  const filterHallSel=document.querySelector('#filters select[name="hall"]');
  const formHallSel=form.querySelector('select[name="hall"]');
  const kToday=$('#kpi-today'), kUpcoming=$('#kpi-upcoming'), kGuests=$('#kpi-guests');

  const calGrid = $('#cal-grid'), calTitle = $('#cal-title');
  const calPrev = $('#cal-prev'), calNext = $('#cal-next');
  let calCursor = new Date();

  let state={filterDate:'', filterHall:'', editingId:null};

  navActions.hidden = true; fab.hidden = true; appSection.hidden = true;

  function setLoading(flag){ loading=!!flag; loadingMsg.hidden=!loading; }
  async function reloadAll(){
    setLoading(true); hideErr();
    try{ const snap = await getDocs(festasCol); CACHE = snap.docs.map(d => ({ id:d.id, ...d.data() })); render(); }
    catch(err){ console.error(err); showErr('Falha ao carregar dados.'); }
    finally{ setLoading(false); }
  }
  const getAll = ()=> CACHE.slice();

  function buildHallSelects(){
    filterHallSel.innerHTML = '<option value="">Todos</option>' + CONFIG.halls.map(h=>`<option value="${h}">${h}</option>`).join('');
    formHallSel.innerHTML   = CONFIG.halls.map(h=>`<option value="${h}">${h}</option>`).join('');
  }
  function filtered(rows){
    return rows.filter(r=>{
      if(state.filterDate && r.date!==state.filterDate) return false;
      if(state.filterHall && !r.hall.toLowerCase().includes(state.filterHall.toLowerCase())) return false;
      return true;
    }).sort(byDateTime);
  }
  function render(){
    const rows=filtered(getAll());
    emptyMsg.hidden = rows.length>0 || loading;
    renderCalendar();
    renderCards(rows);
    renderTable(rows);
    renderMetrics(getAll());
  }
  function renderMetrics(all){
    const today=fmtDate(new Date());
    kToday.textContent = all.filter(r=>r.date===today).length;
    const now=new Date(today); const in28=new Date(now); in28.setDate(in28.getDate()+28);
    kUpcoming.textContent = all.filter(r=> new Date(r.date)>=now && new Date(r.date)<=in28).length;
    kGuests.textContent = all.reduce((s,r)=> s + ((r.guests_text||'').split(/\n+/).filter(Boolean).length||0), 0);
  }

  function monthInfo(d){ const y=d.getFullYear(), m=d.getMonth(); const first=new Date(y,m,1); const last=new Date(y,m+1,0); const startDow=(first.getDay()+6)%7; return {y,m,days:last.getDate(),startDow}; }
  function fmtMonthTitle(d){ return d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase()); }
  function renderCalendar(){
    const {y,m,startDow}=monthInfo(calCursor);
    calTitle.textContent = fmtMonthTitle(calCursor);
    const todayStr = fmtDate(new Date());
    const counts = getAll().reduce((acc,r)=>{ acc[r.date]=(acc[r.date]||0)+1; return acc; }, {});
    const dow = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    calGrid.innerHTML = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    const cells = [];
    const firstGridDate = new Date(y,m,1-startDow);
    for(let i=0;i<42;i++){
      const d=new Date(firstGridDate); d.setDate(d.getDate()+i);
      const ds=fmtDate(d); const inMonth=d.getMonth()===m; const isToday=ds===todayStr; const has=counts[ds]>0;
      const classes=['cal-cell']; if(!inMonth) classes.push('cal-out'); if(isToday) classes.push('cal-today');
      const mark = has ? `<span class="cal-mark" aria-hidden="true"></span>` : '';
      cells.push(`<div class="${classes.join(' ')}"><button class="cal-hit" data-date="${ds}"><div class="cal-date">${String(d.getDate()).padStart(2,'0')}</div>${mark}</button></div>`);
    }
    calGrid.insertAdjacentHTML('beforeend', cells.join(''));
    let pressTimer=null;
    calGrid.querySelectorAll('.cal-hit').forEach(btn=>{
      btn.addEventListener('click',e=>{ const date=e.currentTarget.dataset.date; state.filterDate=date; document.querySelector('#filters [name="date"]').value=date; render(); document.getElementById('cards').scrollIntoView({behavior:'smooth',block:'start'}); });
      btn.addEventListener('mousedown',e=>{ const date=e.currentTarget.dataset.date; pressTimer=setTimeout(()=>openCreateWithDate(date),600); });
      ['mouseup','mouseleave','touchend','touchcancel','mouseout'].forEach(ev=>btn.addEventListener(ev,()=>{ if(pressTimer){clearTimeout(pressTimer);pressTimer=null;} }));
      btn.addEventListener('touchstart',e=>{ const date=e.currentTarget.dataset.date; pressTimer=setTimeout(()=>openCreateWithDate(date),700); },{passive:true});
    });
    calPrev.onclick=()=>{ calCursor=new Date(y,m-1,1); renderCalendar(); };
    calNext.onclick=()=>{ calCursor=new Date(y,m+1,1); renderCalendar(); };
  }
  function openCreateWithDate(dateStr){ openCreate(); document.querySelector('#party-form [name="date"]').value=dateStr; }

  function cardHTML(r){
    const chips=[`Copos ${r.cups||0}`,`Garfos ${r.forks||0}`,`Facas ${r.knives||0}`,`Colheres ${r.spoons||0}`,`Pratos ${r.plates||0}`].map(x=>`<span class="chip">${x}</span>`).join('');
    return `<article class="party-card" data-id="${r.id}">
      <div class="party-head"><strong>${r.date} • ${r.start_time||''}${r.end_time?'–'+r.end_time:''}</strong><span class="badge">${r.hall}</span></div>
      <div class="kv"><span>Apto</span><span>${escape(r.apartment)}</span></div>
      <div class="kv"><span>Morador</span><span>${escape(r.resident_name)}</span></div>
      <div class="mats">${chips}</div>
      <div class="row-actions">
        <button class="btn primary" data-act="edit">Editar</button>
        <button class="btn primary" data-act="view">Ver</button>
        <button class="btn" data-act="dup">Duplicar</button>
        <button class="btn" data-act="ics">ICS</button>
        <button class="btn danger" data-act="del">Excluir</button>
      </div>
    </article>`;
  }
  function renderCards(rows){
    const el=$('#cards'); el.innerHTML = rows.map(cardHTML).join('');
    el.querySelectorAll('.party-card').forEach(card=>{
      const id=card.dataset.id;
      card.querySelector('[data-act="edit"]').onclick=()=>openEdit(id);
      card.querySelector('[data-act="view"]').onclick=()=>showView(id);
      card.querySelector('[data-act="dup"]').onclick=()=>duplicate(id);
      card.querySelector('[data-act="ics"]').onclick=()=>downloadICS(id);
      card.querySelector('[data-act="del"]').onclick=()=>del(id);
    });
  }
  function rowHTML(r){ return `<tr><td>${r.date}</td><td>${r.start_time||''}</td><td>${r.end_time||''}</td><td>${r.hall}</td><td>${escape(r.apartment)}</td><td>${escape(r.resident_name)}</td><td>${mats(r)}</td><td><div class="row-actions"><button class="btn primary" data-act="edit" data-id="${r.id}">Editar</button><button class="btn primary" data-act="view" data-id="${r.id}">Ver</button><button class="btn" data-act="dup" data-id="${r.id}">Duplicar</button><button class="btn" data-act="ics" data-id="${r.id}">ICS</button><button class="btn danger" data-act="del" data-id="${r.id}">Excluir</button></div></td></tr>`; }
  function renderTable(rows){
    const tb=tbody; tb.innerHTML = rows.map(rowHTML).join('');
    tb.querySelectorAll('[data-act="edit"]').forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
    tb.querySelectorAll('[data-act="view"]').forEach(b=>b.onclick=()=>showView(b.dataset.id));
    tb.querySelectorAll('[data-act="dup"]').forEach(b=>b.onclick=()=>duplicate(b.dataset.id));
    tb.querySelectorAll('[data-act="ics"]').forEach(b=>b.onclick=()=>downloadICS(b.dataset.id));
    tb.querySelectorAll('[data-act="del"]').forEach(b=>b.onclick=()=>del(b.dataset.id));
  }

  function getForm(){
    const fd=new FormData(form);
    const o={date:String(fd.get('date')||''),start_time:String(fd.get('start_time')||''),end_time:String(fd.get('end_time')||''),hall:String(fd.get('hall')||''),cups:Number(fd.get('cups')||0),forks:Number(fd.get('forks')||0),knives:Number(fd.get('knives')||0),spoons:Number(fd.get('spoons')||0),plates:Number(fd.get('plates')||0),apartment:String(fd.get('apartment')||'').trim(),resident_name:String(fd.get('resident_name')||'').trim(),guests_text:String(fd.get('guests_text')||'')};
    if(!o.date) return err('Informe a data.'); if(!o.start_time) return err('Informe o horário de início.'); if(!o.hall) return err('Informe o salão.'); if(!o.apartment) return err('Informe o apartamento.'); if(!o.resident_name) return err('Informe o nome do morador.');
    if(o.end_time && parseTime(o.end_time)<=parseTime(o.start_time)) return err('Término deve ser após o início.');
    ['cups','forks','knives','spoons','plates'].forEach(k=>{ if(o[k]<0||Number.isNaN(o[k])) o[k]=0; }); return o;
  }
  function err(m){ showErr(m); return null; }
  const composeId=p=>`${p.date}_${slug(p.hall)}_${(p.start_time||'').replace(':','')}`;

  function openCreate(){ form.reset(); document.querySelector('#party-form [name="date"]').value=fmtDate(new Date()); formHallSel.value=CONFIG.halls[0]||''; dialogTitle.textContent='Nova Festa'; document.querySelector('#party-dialog').showModal(); }
  function fill(p,id){ form.dataset.editId=id||''; for(const [k,v] of Object.entries(p)){ const el=form.querySelector(`[name="${k}"]`); if(el) el.value=v??''; } }
  function openEdit(id){ const p=getAll().find(x=>x.id===id); if(!p)return; dialogTitle.textContent='Editar Festa'; fill(p,id); document.querySelector('#party-dialog').showModal(); }

  function showView(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const nl=s=>String(s||'').replace(/\n/g,'<br>');
    viewContent.innerHTML=`<div class="view-line"><strong>Data</strong><span>${p.date}</span></div><div class="view-line"><strong>Início</strong><span>${p.start_time||''}</span></div><div class="view-line"><strong>Término</strong><span>${p.end_time||''}</span></div><div class="view-line"><strong>Salão</strong><span>${p.hall}</span></div><div class="view-line"><strong>Apto</strong><span>${escape(p.apartment)}</span></div><div class="view-line"><strong>Morador</strong><span>${escape(p.resident_name)}</span></div><div class="view-line"><strong>Materiais</strong><span>${mats(p)}</span></div><div class="view-line"><strong>Convidados</strong><span>${nl(p.guests_text)||'(não informado)'}</span></div>`;
    document.querySelector('#view-dialog').showModal();
  }

  async function saveParty(){
    hideErr(); const p=getForm(); if(!p) return;
    const isEdit=!!form.dataset.editId; const id=isEdit?form.dataset.editId:composeId(p);
    try{
      btnSave.disabled=true; btnSave.textContent=isEdit?'Salvando…':'Criando…';
      if(!isEdit){ const exists=await getDoc(doc(festasCol,id)); if(exists.exists()){ showErr('Já existe uma festa para este salão, data e horário.'); btnSave.disabled=false; btnSave.textContent='Salvar'; return; } }
      await setDoc(doc(festasCol,id),p); document.querySelector('#party-dialog').close(); await reloadAll(); toast(isEdit?'Festa atualizada.':'Festa criada.');
    }catch(err){ console.error(err); showErr('Erro ao salvar.'); }
    finally{ btnSave.disabled=false; btnSave.textContent='Salvar'; }
  }
  async function del(id){ if(!confirm('Confirmar exclusão?')) return; try{ await deleteDoc(doc(festasCol,id)); await reloadAll(); toast('Festa removida.'); }catch(e){ showErr('Erro ao excluir.'); } }
  function duplicate(id){ const src=getAll().find(x=>x.id===id); if(!src)return; const copy={...src}; const newId=composeId(copy); setDoc(doc(festasCol,newId),copy).then(reloadAll).then(()=>toast('Festa duplicada.')).catch(()=>showErr('Erro ao duplicar.')); }
  function downloadICS(id){ const p=getAll().find(x=>x.id===id); if(!p)return; const dt=(d,t)=>`${d.replace(/-/g,'')}`+(t?`T${t.replace(':','')}00`:''); const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vivendas//Festas//PT-BR','BEGIN:VEVENT',`UID:${id}@vivendas`,`DTSTART:${dt(p.date,p.start_time)}`,`DTEND:${dt(p.date,p.end_time||p.start_time)}`,`SUMMARY:Festa - ${p.resident_name} (${p.apartment})`,`LOCATION:${p.hall}`,`DESCRIPTION:Materiais: ${mats(p)}\\nConvidados:\\n${(p.guests_text||'').replace(/\\n/g,'; ')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download=`festa-${p.date}.ics`; a.click(); URL.revokeObjectURL(a.href); }

  function bindUI(){
    document.getElementById('filters').addEventListener('submit',e=>{e.preventDefault(); const fd=new FormData(e.target); state.filterDate=String(fd.get('date')||''); state.filterHall=String(fd.get('hall')||''); render();});
    document.getElementById('btn-clear-filters').onclick=()=>{ document.getElementById('filters').reset(); state.filterDate=''; state.filterHall=''; render(); };
    document.getElementById('btn-new').onclick=openCreate; fab.onclick=openCreate;
    btnExport.onclick=()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(getAll(),null,2)],{type:'application/json'})); a.download='festas.json'; a.click(); };
    btnCSV.onclick=()=>{ const rows=getAll(); const h=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text']; const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`; const csv=[h.join(',')].concat(rows.map(r=>h.map(k=>esc(r[k])).join(','))).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='festas.csv'; a.click(); };
    form.addEventListener('submit',e=>e.preventDefault()); btnSave.onclick=saveParty;
    document.getElementById('btn-cancel').onclick=()=>document.getElementById('party-dialog').close();
    document.getElementById('btn-close-view').onclick=()=>document.getElementById('view-dialog').close();
  }

  function applyAuth(user){ const logged=!!user; loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; fab.hidden=!logged; currentUser.textContent=logged?user.email:''; if(logged) hideErr(); }
  function initAuth(){
    onAuthStateChanged(auth,async user=>{ applyAuth(user); if(user){ buildHallSelects(); await reloadAll(); toast('Login efetuado.'); }});
    loginForm.addEventListener('submit',async e=>{ e.preventDefault(); hideErr(); const fd=new FormData(e.target); const email=String(fd.get('email')||'').trim(); const password=String(fd.get('password')||''); try{ btnLogin.disabled=true; btnLogin.textContent='Entrando…'; await signInWithEmailAndPassword(auth,email,password);}catch{showErr('Falha no login.');}finally{btnLogin.disabled=false; btnLogin.textContent='Entrar';}});
    btnLogout.onclick=()=>signOut(auth);
  }

  const escape=s=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  bindUI(); initAuth();
})();