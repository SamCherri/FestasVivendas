// app.js v8 - Firebase (Auth + Firestore) — site estático (GitHub Pages)
import { CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(function(){
  'use strict';
  // Helpers UI
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast=(m)=>{const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,1800);};
  const fmtDate=(d)=>{try{if(typeof d==='string')return d;return d.toISOString().slice(0,10);}catch{return '';}};
  const parseTime=(str)=>{if(!str)return null;const [h,m]=str.split(':').map(Number);return h*60+m;};
  const overlaps=(a1,a2,b1,b2)=>{const A1=parseTime(a1)??-1,A2=parseTime(a2)??parseTime(a1),B1=parseTime(b1)??-1,B2=parseTime(b2)??parseTime(b1);return !(A2<=B1||B2<=A1);};
  const mats=(r)=>`copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;
  const byDateTime=(a,b)=> (a.date===b.date? (b.start_time||'').localeCompare(a.start_time||'') : (a.date>b.date?-1:1));

  // Firebase init
  const app = initializeApp(CONFIG.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const festasCol = collection(db, 'festas');

  // Cache
  let CACHE = [];
  async function reloadAll(){
    const snap = await getDocs(festasCol);
    CACHE = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render();
  }
  const getAll = ()=> CACHE.slice();

  // Elements
  const loginSection=$('#login-section'), appSection=$('#app-section'), navActions=$('#nav-actions'), fab=$('#fab-new');
  const currentUser=$('#current-user'), tbody=$('#tbody-parties'), cards=$('#cards'), emptyMsg=$('#empty-msg');
  const loginForm=$('#login-form'), filtersForm=$('#filters');
  const btnClear=$('#btn-clear-filters'), btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), btnLogout=$('#btn-logout');
  const dialog=$('#party-dialog'), form=$('#party-form'), dialogTitle=$('#dialog-title');
  const viewDialog=$('#view-dialog'), viewContent=$('#view-content'), btnCloseView=$('#btn-close-view');
  const filterHallSel=filtersForm.querySelector('select[name="hall"]');
  const formHallSel=form.querySelector('select[name="hall"]');

  const kToday=$('#kpi-today'), kUpcoming=$('#kpi-upcoming'), kGuests=$('#kpi-guests');
  let state={filterDate:'', filterHall:'', editingId:null};

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
    emptyMsg.hidden = rows.length>0;
    renderCards(rows); renderTable(rows); renderMetrics(getAll());
  }

  function renderMetrics(all){
    const today=fmtDate(new Date());
    kToday.textContent = all.filter(r=>r.date===today).length;
    const now=new Date(today); const in28=new Date(now); in28.setDate(in28.getDate()+28);
    kUpcoming.textContent = all.filter(r=> new Date(r.date)>=now && new Date(r.date)<=in28).length;
    kGuests.textContent = all.reduce((s,r)=> s + ((r.guests_text||'').split(/\n+/).filter(Boolean).length||0), 0);
  }

  function cardHTML(r){
    const chips=[`Copos ${r.cups||0}`,`Garfos ${r.forks||0}`,`Facas ${r.knives||0}`,`Colheres ${r.spoons||0}`,`Pratos ${r.plates||0}`].map(x=>`<span class="chip">${x}</span>`).join('');
    return `
      <article class="party-card" data-id="${r.id}">
        <div class="party-head"><strong>${r.date} • ${r.start_time||''}${r.end_time?'–'+r.end_time:''}</strong><span class="badge">${r.hall}</span></div>
        <div class="kv"><span>Apto</span><span>${r.apartment}</span></div>
        <div class="kv"><span>Morador</span><span>${r.resident_name}</span></div>
        <div class="mats">${chips}</div>
        <div class="row-actions">
          <button class="btn" data-act="edit">Editar</button>
          <button class="btn" data-act="view">Ver</button>
          <button class="btn" data-act="dup">Duplicar</button>
          <button class="btn" data-act="ics">ICS</button>
          <button class="btn danger" data-act="del">Excluir</button>
        </div>
      </article>`;
  }
  function renderCards(rows){
    cards.innerHTML = rows.map(cardHTML).join('');
    cards.querySelectorAll('.party-card').forEach(card=>{
      const id=card.dataset.id;
      card.querySelector('[data-act="edit"]').addEventListener('click', ()=>openEdit(id));
      card.querySelector('[data-act="view"]').addEventListener('click', ()=>showView(id));
      card.querySelector('[data-act="dup"]').addEventListener('click', ()=>duplicate(id));
      card.querySelector('[data-act="ics"]').addEventListener('click', ()=>downloadICS(id));
      card.querySelector('[data-act="del"]').addEventListener('click', ()=>del(id));
    });
  }

  function rowHTML(r){
    return `<tr>
      <td>${r.date}</td><td>${r.start_time||''}</td><td>${r.end_time||''}</td>
      <td>${r.hall}</td><td>${r.apartment}</td><td>${r.resident_name}</td>
      <td>${mats(r)}</td>
      <td><div class="row-actions">
          <button class="btn" data-act="edit" data-id="${r.id}">Editar</button>
          <button class="btn" data-act="view" data-id="${r.id}">Ver</button>
          <button class="btn" data-act="dup"  data-id="${r.id}">Duplicar</button>
          <button class="btn" data-act="ics"  data-id="${r.id}">ICS</button>
          <button class="btn danger" data-act="del" data-id="${r.id}">Excluir</button>
      </div></td></tr>`;
  }
  function renderTable(rows){
    tbody.innerHTML = rows.map(rowHTML).join('');
    $$('[data-act="edit"]',tbody).forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.id)));
    $$('[data-act="view"]',tbody).forEach(b=>b.addEventListener('click',()=>showView(b.dataset.id)));
    $$('[data-act="dup"]', tbody).forEach(b=>b.addEventListener('click',()=>duplicate(b.dataset.id)));
    $$('[data-act="ics"]', tbody).forEach(b=>b.addEventListener('click',()=>downloadICS(b.dataset.id)));
    $$('[data-act="del"]',tbody).forEach(b=>b.addEventListener('click',()=>del(b.dataset.id)));
  }

  function getForm(){
    const fd=new FormData(form);
    const o={
      id: form.dataset.editId || crypto.randomUUID(),
      date: (fd.get('date')||'').toString(),
      start_time: (fd.get('start_time')||'').toString(),
      end_time: (fd.get('end_time')||'').toString(),
      hall: (fd.get('hall')||'').toString(),
      cups: Number(fd.get('cups')||0),
      forks: Number(fd.get('forks')||0),
      knives: Number(fd.get('knives')||0),
      spoons: Number(fd.get('spoons')||0),
      plates: Number(fd.get('plates')||0),
      apartment: (fd.get('apartment')||'').toString(),
      resident_name: (fd.get('resident_name')||'').toString(),
      guests_text: (fd.get('guests_text')||'').toString()
    };
    if(!o.date || !o.start_time || !o.hall || !o.apartment || !o.resident_name){ toast('Preencha os campos obrigatórios.'); return null; }
    if(o.end_time && parseTime(o.end_time)<=parseTime(o.start_time)){ toast('Término deve ser depois do início.'); return null; }
    return o;
  }

  function openCreate(){ form.reset(); form.dataset.editId=''; $('#party-form [name="date"]').value=fmtDate(new Date()); $('#dialog-title').textContent='Nova Festa'; dialog.showModal(); }
  function fill(p){
    form.dataset.editId = p.id || '';
    $('#party-form [name="date"]').value=p.date||'';
    $('#party-form [name="start_time"]').value=p.start_time||'';
    $('#party-form [name="end_time"]').value=p.end_time||'';
    formHallSel.value=p.hall||CONFIG.halls[0];
    $('#party-form [name="cups"]').value=p.cups??0;
    $('#party-form [name="forks"]').value=p.forks??0;
    $('#party-form [name="knives"]').value=p.knives??0;
    $('#party-form [name="spoons"]').value=p.spoons??0;
    $('#party-form [name="plates"]').value=p.plates??0;
    $('#party-form [name="apartment"]').value=p.apartment||'';
    $('#party-form [name="resident_name"]').value=p.resident_name||'';
    $('#party-form [name="guests_text"]').value=p.guests_text||'';
  }
  function openEdit(id){ const p=getAll().find(x=>x.id===id); if(!p)return; $('#dialog-title').textContent='Editar Festa'; fill(p); dialog.showModal(); }
  function showView(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    viewContent.innerHTML=`
      <div class="view-line"><strong>Data</strong><span>${p.date}</span></div>
      <div class="view-line"><strong>Início</strong><span>${p.start_time||''}</span></div>
      <div class="view-line"><strong>Término</strong><span>${p.end_time||''}</span></div>
      <div class="view-line"><strong>Salão</strong><span>${p.hall}</span></div>
      <div class="view-line"><strong>Apto</strong><span>${p.apartment}</span></div>
      <div class="view-line"><strong>Morador</strong><span>${p.resident_name}</span></div>
      <div class="view-line"><strong>Materiais</strong><span>${mats(p)}</span></div>
      <div class="view-line"><strong>Convidados</strong><span>${(p.guests_text||'').replace(/\n/g,'<br>')||'(não informado)'}</span></div>`;
    viewDialog.showModal();
  }

  async function saveParty(){
    const p=getForm(); if(!p) return;
    const rows=getAll();
    const conflict = rows.some(r => r.id!==p.id && r.date===p.date && r.hall===p.hall && overlaps(r.start_time,r.end_time,p.start_time,p.end_time));
    if(conflict && !confirm('Conflito de horário no mesmo salão. Salvar assim mesmo?')) return;

    await setDoc(doc(festasCol, p.id), p);
    dialog.close(); await reloadAll(); toast('Festa salva.');
  }

  async function del(id){
    if(!confirm('Confirmar exclusão?')) return;
    await deleteDoc(doc(festasCol, id));
    await reloadAll(); toast('Festa removida.');
  }

  function duplicate(id){
    const src=getAll().find(x=>x.id===id); if(!src)return;
    const copy={...src, id: crypto.randomUUID()};
    setDoc(doc(festasCol, copy.id), copy).then(reloadAll).then(()=>toast('Festa duplicada.'));
  }

  function downloadICS(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const dt=(d,t)=>`${d.replace(/-/g,'')}`+(t?`T${t.replace(':','')}00`:'');
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vivendas//Festas//PT-BR','BEGIN:VEVENT',
      `UID:${p.id}@vivendas`,`DTSTART:${dt(p.date,p.start_time)}`,`DTEND:${dt(p.date,p.end_time||p.start_time)}`,
      `SUMMARY:Festa - ${p.resident_name} (${p.apartment})`,`LOCATION:${p.hall}`,
      `DESCRIPTION:Materiais: ${mats(p)}\\nConvidados:\\n${(p.guests_text||'').replace(/\\n/g,'; ')}`,
      'END:VEVENT','END:VCALENDAR'].join('\\r\\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download=`festa-${p.date}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }

  // Filtros e binds
  function bindUI(){
    buildHallSelects();
    $('#filters').addEventListener('submit', e=>{e.preventDefault(); const fd=new FormData(e.target); state.filterDate=(fd.get('date')||'').toString(); state.filterHall=(fd.get('hall')||'').toString(); render();});
    $('#btn-clear-filters').addEventListener('click', ()=>{ $('#filters').reset(); state.filterDate=''; state.filterHall=''; render(); });
    $('#btn-new').addEventListener('click', openCreate);
    $('#fab-new').addEventListener('click', openCreate);
    $('#btn-export').addEventListener('click', ()=>{const rows=getAll(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'})); a.download='festas.json'; a.click();});
    $('#btn-export-csv').addEventListener('click', ()=>{const rows=getAll(); const h=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text']; const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`; const csv=[h.join(',')].concat(rows.map(r=>h.map(k=>esc(r[k])).join(','))).join('\\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='festas.csv'; a.click();});
    $('#party-form').addEventListener('submit', e=>e.preventDefault());
    $('#btn-save').addEventListener('click', saveParty);
    $('#btn-close-view').addEventListener('click', ()=>$('#view-dialog').close());
  }

  // Auth
  function applyAuth(user){
    const logged=!!user;
    loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; $('#fab-new').hidden=!logged;
    $('#current-user').textContent = logged ? user.email : '';
  }
  function initAuth(){
    onAuthStateChanged(auth, async (user)=>{
      applyAuth(user);
      if(user){ await reloadAll(); toast('Login efetuado.'); }
    });
    $('#login-form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd=new FormData(e.target);
      const email=(fd.get('email')||'').toString().trim();
      const password=(fd.get('password')||'').toString();
      try{ await signInWithEmailAndPassword(auth, email, password); }
      catch(err){ console.error(err); toast('Falha no login. Verifique e-mail/senha.'); }
    });
    $('#btn-logout').addEventListener('click', ()=>signOut(auth));
  }

  // Boot
  window.addEventListener('DOMContentLoaded', ()=>{
    buildHallSelects();
    bindUI(); initAuth();
  });
})();