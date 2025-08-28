// app.js v30 — Auth + Firestore + Calendário + UX
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
  const showErr=(m)=>{const e=$('#errbox');e.textContent=m||'Erro';e.hidden=false;};
  const hideErr=()=>{$('#errbox').hidden=true;};
  const fmtDate=(d)=>{try{return typeof d==='string'?d:d.toISOString().slice(0,10);}catch{return'';}};
  const parseTime=(s)=>{if(!s)return null;const[a,b]=s.split(':').map(Number);return a*60+b;};
  const mats=(r)=>`copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;
  const slug=(s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-_]/gi,'').toLowerCase();
  const byDateTime=(a,b)=> (a.date===b.date? (b.start_time||'').localeCompare(a.start_time||'') : (a.date>b.date?-1:1));

  // Firebase
  const app = initializeApp(CONFIG.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const festasCol = collection(db, 'festas');

  // UI refs
  const loginSection=$('#login-section'), appSection=$('#app-section'), navActions=$('#nav-actions'), fab=$('#fab-new');
  const currentUser=$('#current-user'), cards=$('#cards'), tbody=$('#tbody-parties'), emptyMsg=$('#empty-msg'), loadingMsg=$('#loading-msg');
  const loginForm=$('#login-form'), btnLogin=$('#btn-login');
  const btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), btnLogout=$('#btn-logout');
  const dialog=$('#party-dialog'), form=$('#party-form'), dialogTitle=$('#dialog-title'), btnSave=$('#btn-save');
  const viewDialog=$('#view-dialog'), viewContent=$('#view-content');

  let CACHE=[], loading=false;
  let state={filterDate:'', filterHall:''};
  let calCursor=new Date();

  // inicia invisível
  navActions.hidden = true; fab.hidden = true; appSection.hidden = true;

  // ===== Helpers =====
  function setLoading(f){loading=f;loadingMsg.hidden=!f;}
  const getAll = ()=>CACHE.slice();

  function buildHallSelects(){
    const selFilter = document.querySelector('#filters select[name="hall"]');
    const selForm   = document.querySelector('#party-form select[name="hall"]');
    selFilter.innerHTML = '<option value="">Todos</option>' + CONFIG.halls.map(h=>`<option>${h}</option>`).join('');
    selForm.innerHTML   = CONFIG.halls.map(h=>`<option>${h}</option>`).join('');
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
    $('#kpi-today').textContent = all.filter(r=>r.date===today).length;
    const start=new Date(today); const end=new Date(today); end.setDate(end.getDate()+28);
    $('#kpi-upcoming').textContent = all.filter(r=> new Date(r.date)>=start && new Date(r.date)<=end).length;
    $('#kpi-guests').textContent = all.reduce((s,r)=> s + ((r.guests_text||'').split(/\n+/).filter(Boolean).length||0), 0);
  }

  // ===== Calendário =====
  const calGrid=$('#cal-grid'), calTitle=$('#cal-title'); const calPrev=$('#cal-prev'), calNext=$('#cal-next');
  function monthInfo(d){const y=d.getFullYear(), m=d.getMonth(); const first=new Date(y,m,1), last=new Date(y,m+1,0); const start=(first.getDay()+6)%7; return {y,m,days:last.getDate(),start};}
  function fmtMonthTitle(d){return d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());}
  function renderCalendar(){
    const {y,m,start}=monthInfo(calCursor);
    calTitle.textContent=fmtMonthTitle(calCursor);
    const counts=getAll().reduce((a,r)=>{a[r.date]=(a[r.date]||0)+1;return a;}, {});
    const dow=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    calGrid.innerHTML = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    const total=42; const first=new Date(y,m,1-start);
    const today=fmtDate(new Date());
    const cells=[];
    for(let i=0;i<total;i++){
      const d=new Date(first); d.setDate(d.getDate()+i);
      const ds=fmtDate(d), inMonth=d.getMonth()===m, isToday=ds===today, has=counts[ds]>0;
      const cls=['cal-cell']; if(!inMonth) cls.push('cal-out'); if(isToday) cls.push('cal-today');
      const badge = has ? `<span class="badge-small">festa</span>` : '';
      cells.push(`<div class="${cls.join(' ')}">
        <button class="cal-hit" data-date="${ds}" ${inMonth?'':'data-out="1"'} aria-label="Dia ${ds}">
          <div class="cal-date">${String(d.getDate()).padStart(2,'0')}</div>
          <div>${badge}</div>
        </button></div>`);
    }
    calGrid.insertAdjacentHTML('beforeend', cells.join(''));
    calGrid.querySelectorAll('.cal-hit').forEach(btn=>{
      btn.addEventListener('click', e=>{
        state.filterDate = e.currentTarget.dataset.date;
        $('#filters [name="date"]').value = state.filterDate;
        render();
        document.getElementById('cards').scrollIntoView({behavior:'smooth', block:'start'});
      });
      // pressionar e segurar = criar
      let t=null;
      btn.addEventListener('mousedown',e=>{const ds=e.currentTarget.dataset.date;t=setTimeout(()=>{openCreateWithDate(ds);},600);});
      ['mouseup','mouseleave','touchend','touchcancel','mouseout'].forEach(ev=>btn.addEventListener(ev,()=>{if(t){clearTimeout(t);t=null;}}));
      btn.addEventListener('touchstart',e=>{const ds=e.currentTarget.dataset.date;t=setTimeout(()=>{openCreateWithDate(ds);},700);},{passive:true});
    });
    calPrev.onclick=()=>{calCursor=new Date(y,m-1,1);renderCalendar();};
    calNext.onclick=()=>{calCursor=new Date(y,m+1,1);renderCalendar();};
  }
  function openCreateWithDate(dateStr){ openCreate(); $('#party-form [name="date"]').value = dateStr; }

  // ===== Cards & Tabela =====
  function cardHTML(r){
    const chips=[`Copos ${r.cups||0}`,`Garfos ${r.forks||0}`,`Facas ${r.knives||0}`,`Colheres ${r.spoons||0}`,`Pratos ${r.plates||0}`]
      .map(x=>`<span class="chip">${x}</span>`).join('');
    return `<article class="party-card" data-id="${r.id}">
      <div class="party-head"><strong>${r.date} • ${r.start_time||''}${r.end_time?'–'+r.end_time:''}</strong><span class="badge">${r.hall}</span></div>
      <div class="kv"><span>Apto</span> ${escapeHTML(r.apartment)} </div>
      <div class="kv"><span>Morador</span> ${escapeHTML(r.resident_name)} </div>
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
    cards.innerHTML = rows.map(cardHTML).join('');
    cards.querySelectorAll('.party-card').forEach(el=>{
      const id=el.dataset.id;
      el.querySelector('[data-act="edit"]').onclick=()=>openEdit(id);
      el.querySelector('[data-act="view"]').onclick=()=>showView(id);
      el.querySelector('[data-act="dup"]').onclick=()=>duplicate(id);
      el.querySelector('[data-act="ics"]').onclick=()=>downloadICS(id);
      el.querySelector('[data-act="del"]').onclick=()=>del(id);
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
        <button class="btn" data-act="dup" data-id="${r.id}">Duplicar</button>
        <button class="btn" data-act="ics" data-id="${r.id}">ICS</button>
        <button class="btn danger" data-act="del" data-id="${r.id}">Excluir</button>
      </div></td></tr>`;
  }
  function renderTable(rows){
    tbody.innerHTML = rows.map(rowHTML).join('');
    $$('[data-act="edit"]',tbody).forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
    $$('[data-act="view"]',tbody).forEach(b=>b.onclick=()=>showView(b.dataset.id));
    $$('[data-act="dup"]',tbody).forEach(b=>b.onclick=()=>duplicate(b.dataset.id));
    $$('[data-act="ics"]',tbody).forEach(b=>b.onclick=()=>downloadICS(b.dataset.id));
    $$('[data-act="del"]',tbody).forEach(b=>b.onclick=()=>del(b.dataset.id));
  }

  // ===== CRUD =====
  function composeId(p){ return `${p.date}_${slug(p.hall)}_${(p.start_time||'').replace(':','')}`; }
  function getForm(){
    const fd=new FormData(form);
    const o={
      date:String(fd.get('date')||''),
      start_time:String(fd.get('start_time')||''),
      end_time:String(fd.get('end_time')||''),
      hall:String(fd.get('hall')||''),
      cups:+(fd.get('cups')||0), forks:+(fd.get('forks')||0), knives:+(fd.get('knives')||0),
      spoons:+(fd.get('spoons')||0), plates:+(fd.get('plates')||0),
      apartment:String(fd.get('apartment')||'').trim(),
      resident_name:String(fd.get('resident_name')||'').trim(),
      guests_text:String(fd.get('guests_text')||'')
    };
    if(!o.date) return err('Informe a data.');
    if(!o.start_time) return err('Informe o início.');
    if(!o.hall) return err('Informe o salão.');
    if(!o.apartment) return err('Informe o apartamento.');
    if(!o.resident_name) return err('Informe o morador.');
    if(o.end_time && parseTime(o.end_time)<=parseTime(o.start_time)) return err('Término deve ser após o início.');
    ['cups','forks','knives','spoons','plates'].forEach(k=>{ if(o[k]<0||Number.isNaN(o[k])) o[k]=0; });
    return o;
  }
  function err(m){ showErr(m); return null; }

  function openCreate(){
    form.reset();
    $('#party-form [name="date"]').value=fmtDate(new Date());
    $('#party-form [name="hall"]').value=CONFIG.halls[0]||'';
    dialogTitle.textContent='Nova Festa';
    dialog.showModal();
  }
  function fill(p,id){
    form.dataset.editId=id||'';
    $('#party-form [name="date"]').value=p.date||'';
    $('#party-form [name="start_time"]').value=p.start_time||'';
    $('#party-form [name="end_time"]').value=p.end_time||'';
    $('#party-form [name="hall"]').value=p.hall||'';
    ['cups','forks','knives','spoons','plates'].forEach(k=>$('#party-form [name="'+k+'"]').value=p[k]??0);
    $('#party-form [name="apartment"]').value=p.apartment||'';
    $('#party-form [name="resident_name"]').value=p.resident_name||'';
    $('#party-form [name="guests_text"]').value=p.guests_text||'';
  }
  function openEdit(id){ const p=getAll().find(x=>x.id===id); if(!p)return; dialogTitle.textContent='Editar Festa'; fill(p,id); dialog.showModal(); }

  function showView(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const nl=(s)=>String(s||'').replace(/\n/g,'<br>');
    viewContent.innerHTML=`
      <div><strong>Data:</strong> ${p.date}</div>
      <div><strong>Início:</strong> ${p.start_time||''}</div>
      <div><strong>Término:</strong> ${p.end_time||''}</div>
      <div><strong>Salão:</strong> ${p.hall}</div>
      <div><strong>Apto:</strong> ${escapeHTML(p.apartment)}</div>
      <div><strong>Morador:</strong> ${escapeHTML(p.resident_name)}</div>
      <div><strong>Materiais:</strong> ${mats(p)}</div>
      <div><strong>Convidados:</strong> ${nl(p.guests_text)||'(não informado)'}</div>`;
    $('#view-dialog').showModal();
  }

  async function saveParty(){
    hideErr();
    const p=getForm(); if(!p) return;
    const isEdit=!!form.dataset.editId;
    const id=isEdit?form.dataset.editId:composeId(p);
    try{
      btnSave.disabled=true; btnSave.textContent=isEdit?'Salvando…':'Criando…';
      if(!isEdit){
        const snap=await getDoc(doc(festasCol,id));
        if(snap.exists()){ showErr('Já existe festa com essa data/horário/salão.'); btnSave.disabled=false; btnSave.textContent='Salvar'; return; }
      }
      await setDoc(doc(festasCol,id), p);
      dialog.close();
      await reloadAll();
      toast(isEdit?'Atualizado.':'Criado.');
    }catch(e){ showErr('Erro ao salvar: '+humanizeFirebaseError(e)); }
    finally{ btnSave.disabled=false; btnSave.textContent='Salvar'; }
  }
  async function del(id){ if(!confirm('Confirmar exclusão?')) return;
    try{ await deleteDoc(doc(festasCol,id)); await reloadAll(); toast('Excluído.'); }
    catch(e){ showErr('Erro ao excluir: '+humanizeFirebaseError(e)); }
  }
  function duplicate(id){
    const src=getAll().find(x=>x.id===id); if(!src)return;
    const copy={...src}; const newId=composeId(copy);
    setDoc(doc(festasCol,newId),copy).then(reloadAll).then(()=>toast('Duplicado.'))
    .catch(e=>showErr('Erro ao duplicar: '+humanizeFirebaseError(e)));
  }
  function downloadICS(id){
    const p=getAll().find(x=>x.id===id); if(!p)return;
    const dt=(d,t)=>`${d.replace(/-/g,'')}`+(t?`T${t.replace(':','')}00`:'');
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vivendas//Festas//PT-BR','BEGIN:VEVENT',
      `UID:${id}@vivendas`,`DTSTART:${dt(p.date,p.start_time)}`,`DTEND:${dt(p.date,p.end_time||p.start_time)}`,
      `SUMMARY:Festa - ${p.resident_name} (${p.apartment})`,`LOCATION:${p.hall}`,
      `DESCRIPTION:Materiais: ${mats(p)}\\nConvidados:\\n${(p.guests_text||'').replace(/\\n/g,'; ')}`,
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download=`festa-${p.date}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }

  // ===== Data load =====
  function setLoadingUI(logged){
    loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; fab.hidden=!logged;
  }
  async function reloadAll(){
    setLoading(true); hideErr();
    try{ const snap=await getDocs(festasCol); CACHE=snap.docs.map(d=>({id:d.id,...d.data()})); render(); }
    catch(e){ showErr('Falha ao carregar: '+humanizeFirebaseError(e)); }
    finally{ setLoading(false); }
  }

  // ===== Auth =====
  function initAuth(){
    onAuthStateChanged(auth, async (user)=>{
      setLoadingUI(!!user);
      if(user){ $('#current-user').textContent=user.email||''; buildHallSelects(); await reloadAll(); }
    });
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault(); hideErr();
      const fd=new FormData(loginForm);
      const email=String(fd.get('email')||'').trim();
      const password=String(fd.get('password')||'');
      try{ btnLogin.disabled=true; btnLogin.textContent='Entrando…'; await signInWithEmailAndPassword(auth,email,password); }
      catch(err){ showErr('Falha no login: '+humanizeFirebaseError(err)); }
      finally{ btnLogin.disabled=false; btnLogin.textContent='Entrar'; }
    });
    btnLogout.addEventListener('click', ()=>signOut(auth));
  }

  // ===== UI binds =====
  function bindUI(){
    $('#filters').addEventListener('submit',e=>{
      e.preventDefault(); const fd=new FormData(e.target);
      state.filterDate=String(fd.get('date')||''); state.filterHall=String(fd.get('hall')||''); render();
    });
    $('#btn-clear-filters').addEventListener('click',()=>{ $('#filters').reset(); state.filterDate=''; state.filterHall=''; render(); });

    btnNew.onclick=openCreate; fab.onclick=openCreate;
    btnExport.onclick=()=>{ const rows=getAll(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'})); a.download='festas.json'; a.click();};
    btnCSV.onclick=()=>{ const rows=getAll(); const h=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text']; const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`; const csv=[h.join(',')].concat(rows.map(r=>h.map(k=>esc(r[k])).join(','))).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='festas.csv'; a.click();};

    form.addEventListener('submit',e=>e.preventDefault());
    btnSave.onclick=saveParty;
    $('#btn-cancel').onclick=()=>dialog.close();
    $('#btn-close-view').onclick=()=>viewDialog.close();
  }

  // utils
  function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function humanizeFirebaseError(err){
    const code=String(err?.code||'').toLowerCase();
    if(code.includes('invalid-api-key')) return 'API key inválida. Confira o config.js.';
    if(code.includes('auth/invalid-email')) return 'E-mail inválido.';
    if(code.includes('auth/user-not-found')) return 'Usuário não encontrado.';
    if(code.includes('auth/wrong-password')) return 'Senha incorreta.';
    if(code.includes('permission-denied')) return 'Sem permissão. Verifique as regras do Firestore.';
    if(code.includes('unauthenticated')) return 'É preciso estar logado.';
    return err?.message||'Erro';
  }

  // boot
  buildHallSelects();
  bindUI();
  initAuth();
})();