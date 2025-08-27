// app.js v13 — identidade “Vivendas de La Salle”
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
  const toast=(m)=>{const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,2000);};
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

  const loginSection=$('#login-section'), appSection=$('#app-section'), navActions=$('#nav-actions'), fab=$('#fab-new');
  const currentUser=$('#current-user'), tbody=$('#tbody-parties'), cards=$('#cards'), emptyMsg=$('#empty-msg'), loadingMsg=$('#loading-msg');
  const loginForm=$('#login-form'), btnLogin=$('#btn-login'), filtersForm=$('#filters');
  const btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), btnLogout=$('#btn-logout');
  const dialog=$('#party-dialog'), form=$('#party-form'), dialogTitle=$('#dialog-title'), btnSave=$('#btn-save'), btnCancel=$('#btn-cancel');
  const viewDialog=$('#view-dialog'), viewContent=$('#view-content'), btnCloseView=$('#btn-close-view');
  const filterHallSel=filtersForm.querySelector('select[name="hall"]');
  const formHallSel=form.querySelector('select[name="hall"]');
  const kToday=$('#kpi-today'), kUpcoming=$('#kpi-upcoming'), kGuests=$('#kpi-guests');

  let state={filterDate:'', filterHall:'', editingId:null};

  function setLoading(flag){ loading=!!flag; loadingMsg.hidden=!loading; }
  async function reloadAll(){
    setLoading(true); hideErr();
    try{
      const snap = await getDocs(festasCol);
      CACHE = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      render();
    }catch(err){ console.error(err); showErr('Falha ao carregar dados: ' + humanizeFirebaseError(err)); }
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
  function render(){ const rows=filtered(getAll()); emptyMsg.hidden = rows.length>0 || loading; renderCards(rows); renderTable(rows); renderMetrics(getAll()); }
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
        <div class="kv"><span>Apto</span><span>${escapeHTML(r.apartment)}</span></div>
        <div class="kv"><span>Morador</span><span>${escapeHTML(r.resident_name)}</span></div>
        <div class="mats">${chips}</div>
        <div class="row-actions">
          <button class="btn primary" data-act="edit" aria-label="Editar">Editar</button>
          <button class="btn primary" data-act="view" aria-label="Ver detalhes">Ver</button>
          <button class="btn" data-act="dup"  aria-label="Duplicar">Duplicar</button>
          <button class="btn" data-act="ics"  aria-label="Baixar ICS">ICS</button>
          <button class="btn danger" data-act="del" aria-label="Excluir">Excluir</button>
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
      <td>${r.hall}</td><td>${escapeHTML(r.apartment)}</td><td>${escapeHTML(r.resident_name)}</td>
      <td>${mats(r)}</td>
      <td><div class="row-actions">
          <button class="btn primary" data-act="edit" data-id="${r.id}">Editar</button>
          <button class="btn primary" data-act="view" data-id="${r.id}">Ver</button>
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
      date: (fd.get('date')||'').toString(),
      start_time: (fd.get('start_time')||'').toString(),
      end_time: (fd.get('end_time')||'').toString(),
      hall: (fd.get('hall')||'').toString(),
      cups: Number(fd.get('cups')||0),
      forks: Number(fd.get('forks')||0),
      knives: Number(fd.get('knives')||0),
      spoons: Number(fd.get('spoons')||0),
      plates: Number(fd.get('plates')||0),
      apartment: (fd.get('apartment')||'').toString().trim(),
      resident_name: (fd.get('resident_name')||'').toString().trim(),
      guests_text: (fd.get('guests_text')||'').toString()
    };
    if(!o.date) return err('Informe a data.');
    if(!o.start_time) return err('Informe o horário de início.');
    if(!o.hall) return err('Informe o salão.');
    if(!o.apartment) return err('Informe o apartamento.');
    if(!o.resident_name) return err('Informe o nome do morador.');
    if(o.end_time && parseTime(o.end_time)<=parseTime(o.start_time)) return err('Término deve ser após o início.');
    ['cups','forks','knives','spoons','plates'].forEach(k=>{ if(o[k]<0||Number.isNaN(o[k])) o[k]=0; });
    return o;
  }
  function err(m){ showErr(m); return null; }

  function composeId(p){
    // ID único: 2025-09-10_gourmet_1900
    return `${p.date}_${slug(p.hall)}_${(p.start_time||'').replace(':','')}`;
  }

  function openCreate(){ form.reset(); $('#party-form [name="date"]').value=fmtDate(new Date()); formHallSel.value=CONFIG.halls[0]||''; dialogTitle.textContent='Nova Festa'; dialog.showModal(); }
  function fill(p,id){
    form.dataset.editId = id || '';
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
  function openEdit(id){ const p=getAll().find(x=>x.id===id); if(!p)return; dialogTitle.textContent='Editar Festa'; fill(p,id); dialog.showModal(); }

  function showView(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const nl=(s)=>String(s||'').replace(/\n/g,'<br>');
    $('#view-content').innerHTML=`
      <div class="view-line"><strong>Data</strong><span>${p.date}</span></div>
      <div class="view-line"><strong>Início</strong><span>${p.start_time||''}</span></div>
      <div class="view-line"><strong>Término</strong><span>${p.end_time||''}</span></div>
      <div class="view-line"><strong>Salão</strong><span>${p.hall}</span></div>
      <div class="view-line"><strong>Apto</strong><span>${escapeHTML(p.apartment)}</span></div>
      <div class="view-line"><strong>Morador</strong><span>${escapeHTML(p.resident_name)}</span></div>
      <div class="view-line"><strong>Materiais</strong><span>${mats(p)}</span></div>
      <div class="view-line"><strong>Convidados</strong><span>${nl(p.guests_text)||'(não informado)'}</span></div>`;
    $('#view-dialog').showModal();
  }

  async function saveParty(){
    hideErr();
    const p=getForm(); if(!p) return;
    const isEdit = !!form.dataset.editId;
    const id = isEdit ? form.dataset.editId : composeId(p);
    try{
      $('#btn-save').disabled=true; $('#btn-save').textContent = isEdit ? 'Salvando…' : 'Criando…';
      if(!isEdit){
        const exists = await getDoc(doc(festasCol, id));
        if(exists.exists()){ showErr('Já existe uma festa para este salão, data e horário.'); $('#btn-save').disabled=false; $('#btn-save').textContent='Salvar'; return; }
      }
      await setDoc(doc(festasCol, id), p);
      dialog.close(); await reloadAll(); toast(isEdit?'Festa atualizada.':'Festa criada.');
    }catch(err){ console.error(err); showErr('Erro ao salvar: ' + humanizeFirebaseError(err)); }
    finally{ $('#btn-save').disabled=false; $('#btn-save').textContent='Salvar'; }
  }

  async function del(id){
    if(!confirm('Confirmar exclusão?')) return;
    try{ await deleteDoc(doc(festasCol, id)); await reloadAll(); toast('Festa removida.'); }
    catch(err){ console.error(err); showErr('Erro ao excluir: ' + humanizeFirebaseError(err)); }
  }
  function duplicate(id){
    const src=getAll().find(x=>x.id===id); if(!src)return;
    const copy={...src}; const newId=composeId(copy);
    setDoc(doc(festasCol, newId), copy).then(reloadAll).then(()=>toast('Festa duplicada.'))
      .catch(err=>{ console.error(err); showErr('Erro ao duplicar: ' + humanizeFirebaseError(err)); });
  }
  function downloadICS(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const dt=(d,t)=>`${d.replace(/-/g,'')}`+(t?`T${t.replace(':','')}00`:'');
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vivendas de La Salle//Festas//PT-BR','BEGIN:VEVENT',
      `UID:${id}@vivendas`,`DTSTART:${dt(p.date,p.start_time)}`,`DTEND:${dt(p.date,p.end_time||p.start_time)}`,
      `SUMMARY:Festa - ${p.resident_name} (${p.apartment})`,`LOCATION:${p.hall}`,
      `DESCRIPTION:Materiais: ${mats(p)}\\nConvidados:\\n${(p.guests_text||'').replace(/\\n/g,'; ')}`,
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download=`festa-${p.date}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }

  function bindUI(){
    $('#filters').addEventListener('submit', e=>{
      e.preventDefault(); hideErr();
      const fd=new FormData(e.target);
      state.filterDate=(fd.get('date')||'').toString();
      state.filterHall=(fd.get('hall')||'').toString();
      render();
    });
    $('#btn-clear-filters').addEventListener('click', ()=>{ $('#filters').reset(); state.filterDate=''; state.filterHall=''; render(); });

    $('#btn-new').addEventListener('click', openCreate);
    $('#fab-new').addEventListener('click', openCreate);

    $('#btn-export').addEventListener('click', ()=>{
      const rows=getAll(); const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));
      a.download='festas.json'; a.click();
    });
    $('#btn-export-csv').addEventListener('click', ()=>{
      const rows=getAll(); const h=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text'];
      const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`;
      const csv=[h.join(',')].concat(rows.map(r=>h.map(k=>esc(r[k])).join(','))).join('\n');
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='festas.csv'; a.click();
    });

    form.addEventListener('submit', e=>e.preventDefault());
    $('#btn-save').addEventListener('click', saveParty);
    $('#btn-cancel').addEventListener('click', ()=>dialog.close());
    $('#btn-close-view').addEventListener('click', ()=>viewDialog.close());
  }

  function applyAuth(user){
    const logged=!!user;
    loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; fab.hidden=!logged;
    currentUser.textContent = logged ? user.email : '';
    if(logged){ hideErr(); }
  }
  function initAuth(){
    onAuthStateChanged(auth, async (user)=>{
      applyAuth(user);
      if(user){ await reloadAll(); toast('Login efetuado.'); }
    });
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault(); hideErr();
      const fd=new FormData(e.target);
      const email=(fd.get('email')||'').toString().trim();
      const password=(fd.get('password')||'').toString();
      try{ btnLogin.disabled=true; btnLogin.textContent='Entrando…'; await signInWithEmailAndPassword(auth, email, password); }
      catch(err){ console.error(err); showErr('Falha no login: ' + humanizeFirebaseError(err)); }
      finally{ btnLogin.disabled=false; btnLogin.textContent='Entrar'; }
    });
    btnLogout.addEventListener('click', ()=>signOut(auth));
  }

  function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function humanizeFirebaseError(err){
    const code = String(err?.code||'').toLowerCase();
    if(code.includes('permission-denied')) return 'Sem permissão. Faça login.';
    if(code.includes('unauthenticated')) return 'Você precisa estar logado.';
    if(code.includes('failed-precondition')) return 'Condição inválida. Verifique suas regras do Firestore.';
    if(code.includes('unavailable')) return 'Serviço temporariamente indisponível. Tente novamente.';
    if(code.includes('not-found')) return 'Registro não encontrado.';
    if(code.includes('already-exists')) return 'Já existe um registro igual.';
    if(code.includes('invalid-argument')) return 'Dados inválidos. Revise os campos.';
    if(code.includes('deadline-exceeded')) return 'Tempo excedido. Verifique sua conexão.';
    return err?.message || 'Erro inesperado';
  }

  window.addEventListener('DOMContentLoaded', ()=>{ buildHallSelects(); bindUI(); initAuth(); });
})();