/* App estático — foco em mobile (cards), sem banco; dados no localStorage */
(function () {
  'use strict';

  // ---------- Helpers ----------
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  const toast = (msg) => { const el = $('#toast'); el.textContent = msg; el.hidden = false; setTimeout(()=>el.hidden=true, 1800); };
  const fmtDate = (d) => { try { if (typeof d === 'string') return d; return d.toISOString().slice(0,10); } catch { return ''; } };
  const parseTime = (str) => { if (!str) return null; const [h,m] = str.split(':').map(Number); return (h*60+m); };
  const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const loadParties = () => { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || []; } catch { return []; } };
  const saveParties = (rows) => localStorage.setItem(CONFIG.storageKey, JSON.stringify(rows));
  const getUser = () => { try { return JSON.parse(sessionStorage.getItem('vls_user')) || null; } catch { return null; } };
  const setUser = (u) => sessionStorage.setItem('vls_user', JSON.stringify(u));
  const clearUser = () => sessionStorage.removeItem('vls_user');
  const byDateThenTimeDesc = (a,b) => (a.date===b.date? (b.start_time||'').localeCompare(a.start_time||'') : (a.date>b.date?-1:1));
  const overlaps = (a1,a2,b1,b2) => { const A1=parseTime(a1)??-1, A2=parseTime(a2)??parseTime(a1), B1=parseTime(b1)??-1, B2=parseTime(b2)??parseTime(b1); return !(A2<=B1 || B2<=A1); };
  const conflict = (rows,c,ignore=null)=> rows.some(r=> r.id!==ignore && r.date===c.date && r.hall.trim().toLowerCase()===c.hall.trim().toLowerCase() && overlaps(r.start_time,r.end_time,c.start_time,c.end_time));
  const matsText = (r)=>`copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;

  // ---------- Elements ----------
  const loginSection = $('#login-section'), appSection = $('#app-section'), navActions = $('#nav-actions'), fab = $('#fab-new');
  const currentUserSpan = $('#current-user'), hallsDataList = $('#halls');
  const tbody = $('#tbody-parties'), cards = $('#cards'), emptyMsg = $('#empty-msg');
  const loginForm = $('#login-form'), filtersForm = $('#filters'), btnClearFilters = $('#btn-clear-filters');
  const btnNew = $('#btn-new'), btnExport = $('#btn-export'), btnExportCSV = $('#btn-export-csv'), fileImport = $('#file-import'), btnLogout = $('#btn-logout');
  const dialog = $('#party-dialog'), partyForm = $('#party-form'), dialogTitle = $('#dialog-title');

  // ---------- State ----------
  let state = { filterDate:'', filterHall:'', editingId:null };

  // ---------- Init ----------
  function init(){
    hallsDataList.innerHTML = CONFIG.halls.map(h=>`<option value="${h}">`).join('');

    // login
    loginForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const fd = new FormData(loginForm);
      const u = (fd.get('username')||'').toString().trim();
      const p = (fd.get('password')||'').toString();
      const user = CONFIG.users.find(x=>x.username===u && x.password===p);
      if(!user) return toast('Usuário ou senha inválidos.');
      setUser({username:user.username, role:user.role});
      applyAuthUI(); render(); toast('Login efetuado.');
    });

    // filtros
    filtersForm.addEventListener('submit',(e)=>{
      e.preventDefault();
      const fd = new FormData(filtersForm);
      state.filterDate = (fd.get('date')||'').toString();
      state.filterHall = (fd.get('hall')||'').toString().trim().toLowerCase();
      render();
    });
    btnClearFilters.addEventListener('click',()=>{ filtersForm.reset(); state.filterDate=''; state.filterHall=''; render(); });

    // ações topo + FAB
    btnNew.addEventListener('click', openDialogForCreate);
    fab.addEventListener('click', openDialogForCreate);

    btnExport.addEventListener('click', ()=>{
      const rows = loadParties(); const blob = new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='festas-export.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    btnExportCSV.addEventListener('click', ()=>{
      const rows = loadParties(); const csv = toCSV(rows);
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='festas-export.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
    fileImport.addEventListener('change', async(e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      try { const text=await f.text(); const data=JSON.parse(text); if(!Array.isArray(data)) throw new Error('JSON inválido');
        saveParties(data); render(); toast('Importação concluída.');
      } catch(err){ toast('Falha ao importar: '+err.message); } finally { fileImport.value=''; }
    });
    btnLogout.addEventListener('click',()=>{ clearUser(); applyAuthUI(); });

    // dialog
    dialog.addEventListener('close', ()=>{ partyForm.reset(); state.editingId=null; });
    partyForm.addEventListener('submit', e=>e.preventDefault());
    $('#btn-save').addEventListener('click', onSaveParty);

    applyAuthUI(); render();
  }

  function applyAuthUI(){
    const user=getUser(); const logged=!!user;
    loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; fab.hidden=!logged;
    if(user) currentUserSpan.textContent=`${user.username} (${user.role})`;
  }

  function toCSV(rows){
    const headers=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text'];
    const esc = (s)=>`"${String(s??'').replace(/"/g,'""')}"`;
    return [headers.join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h])).join(','))).join('\n');
  }

  // ---------- Render ----------
  function filtered(rows){
    return rows.filter(r=>{
      if(state.filterDate && r.date!==state.filterDate) return false;
      if(state.filterHall && !r.hall.toLowerCase().includes(state.filterHall)) return false;
      return true;
    }).sort(byDateThenTimeDesc);
  }

  function render(){
    const rows = filtered(loadParties());
    emptyMsg.hidden = rows.length>0;
    renderCards(rows);
    renderTable(rows);
  }

  // Cards (mobile)
  function cardHTML(r){
    const chips = [
      `Copos ${r.cups||0}`, `Garfos ${r.forks||0}`, `Facas ${r.knives||0}`,
      `Colheres ${r.spoons||0}`, `Pratos ${r.plates||0}`
    ].map(x=>`<span class="chip">${x}</span>`).join('');
    return `
      <article class="party-card" data-id="${r.id}">
        <div class="party-head">
          <strong>${r.date} • ${r.start_time || ''}${r.end_time ? '–'+r.end_time : ''}</strong>
          <span class="badge">${r.hall}</span>
        </div>
        <div class="kv"><span>Apto</span><span>${r.apartment}</span></div>
        <div class="kv"><span>Morador</span><span>${r.resident_name}</span></div>
        <div class="mats">${chips}</div>
        <div class="row-actions">
          <button class="btn" data-act="edit">Editar</button>
          <button class="btn" data-act="view">Ver</button>
          <button class="btn danger" data-act="delete">Excluir</button>
        </div>
      </article>`;
  }
  function renderCards(rows){
    cards.innerHTML = rows.map(cardHTML).join('');
    cards.querySelectorAll('.party-card').forEach(card=>{
      const id = card.dataset.id;
      card.querySelector('[data-act="edit"]').addEventListener('click', ()=>openDialogForEdit(id));
      card.querySelector('[data-act="view"]').addEventListener('click', ()=>viewParty(id));
      card.querySelector('[data-act="delete"]').addEventListener('click', ()=>deleteParty(id));
    });
  }

  // Tabela (desktop)
  function rowHTML(r){
    return `
      <tr>
        <td>${r.date}</td><td>${r.start_time||''}</td><td>${r.end_time||''}</td>
        <td>${r.hall}</td><td>${r.apartment}</td><td>${r.resident_name}</td>
        <td>${matsText(r)}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-act="edit" data-id="${r.id}">Editar</button>
            <button class="btn" data-act="view" data-id="${r.id}">Ver</button>
            <button class="btn danger" data-act="delete" data-id="${r.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }
  function renderTable(rows){
    tbody.innerHTML = rows.map(rowHTML).join('');
    tbody.querySelectorAll('[data-act="edit"]').forEach(b=>b.addEventListener('click',()=>openDialogForEdit(b.dataset.id)));
    tbody.querySelectorAll('[data-act="view"]').forEach(b=>b.addEventListener('click',()=>viewParty(b.dataset.id)));
    tbody.querySelectorAll('[data-act="delete"]').forEach(b=>b.addEventListener('click',()=>deleteParty(b.dataset.id)));
  }

  // ---------- CRUD ----------
  function openDialogForCreate(){
    $('#party-form [name="date"]').value = fmtDate(new Date());
    dialogTitle.textContent='Nova Festa'; dialog.showModal();
  }
  function fillForm(p){
    $('#party-form [name="date"]').value        = p.date || '';
    $('#party-form [name="start_time"]').value  = p.start_time || '';
    $('#party-form [name="end_time"]').value    = p.end_time || '';
    $('#party-form [name="hall"]').value        = p.hall || '';
    $('#party-form [name="cups"]').value        = p.cups ?? 0;
    $('#party-form [name="forks"]').value       = p.forks ?? 0;
    $('#party-form [name="knives"]').value      = p.knives ?? 0;
    $('#party-form [name="spoons"]').value      = p.spoons ?? 0;
    $('#party-form [name="plates"]').value      = p.plates ?? 0;
    $('#party-form [name="apartment"]').value   = p.apartment || '';
    $('#party-form [name="resident_name"]').value = p.resident_name || '';
    $('#party-form [name="guests_text"]').value = p.guests_text || '';
  }
  function openDialogForEdit(id){
    const rows = loadParties(); const p = rows.find(x=>x.id===id); if(!p) return;
    state.editingId = id; dialogTitle.textContent='Editar Festa'; fillForm(p); dialog.showModal();
  }
  function viewParty(id){
    const p = loadParties().find(x=>x.id===id); if(!p) return;
    const guests = (p.guests_text||'').trim().split(/\n+/).filter(Boolean).map(g=>`• ${g}`).join('\n') || '(não informado)';
    alert(`Data: ${p.date}\nInício: ${p.start_time || ''}${p.end_time ? ' - '+p.end_time : ''}\nSalão: ${p.hall}\nApto: ${p.apartment}\nMorador: ${p.resident_name}\nMateriais: ${matsText(p)}\nConvidados:\n${guests}`);
  }
  function deleteParty(id){
    const user=getUser(); if(!user) return;
    if(CONFIG.deleteRequiresSindico && user.role!=='sindico') return toast('Somente o síndico pode excluir.');
    if(!confirm('Confirmar exclusão?')) return;
    const next = loadParties().filter(x=>x.id!==id); saveParties(next); render(); toast('Festa removida.');
  }
  function readForm(){
    const fd=new FormData(partyForm);
    const o = {
      id: state.editingId || genId(),
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
    return o;
  }
  function onSaveParty(){
    const user=getUser(); if(!user) return;
    const party=readForm(); if(!party) return;
    const rows=loadParties();
    if(conflict(rows,party,state.editingId) && !confirm('Conflito de horário no mesmo salão. Salvar assim mesmo?')) return;
    if(state.editingId){ const i=rows.findIndex(x=>x.id===state.editingId); if(i>=0) rows[i]=party; }
    else { rows.push(party); }
    saveParties(rows); dialog.close(); render(); toast('Festa salva.');
  }

  // boot
  window.addEventListener('DOMContentLoaded', init);
})();
