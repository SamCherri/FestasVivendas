(function () {
  'use strict';
  // ---- Helpers
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
  const toast=(m)=>{const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,1800);};
  const fmtDate=(d)=>{try{if(typeof d==='string')return d;return d.toISOString().slice(0,10);}catch{return '';}};
  const parseTime=(str)=>{if(!str)return null;const [h,m]=str.split(':').map(Number);return h*60+m;};
  const genId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const byDateTime=(a,b)=> (a.date===b.date? (b.start_time||'').localeCompare(a.start_time||'') : (a.date>b.date?-1:1));
  const overlaps=(a1,a2,b1,b2)=>{const A1=parseTime(a1)??-1,A2=parseTime(a2)??parseTime(a1),B1=parseTime(b1)??-1,B2=parseTime(b2)??parseTime(b1);return !(A2<=B1||B2<=A1);};
  const conflict=(rows,c,ignore=null)=> rows.some(r=> r.id!==ignore && r.date===c.date && r.hall.trim().toLowerCase()===c.hall.trim().toLowerCase() && overlaps(r.start_time,r.end_time,c.start_time,c.end_time));
  const mats=(r)=>`copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;

  // ---- API (Google Sheets via Apps Script) ----
  const API = {
    async list() {
      const url = `${CONFIG.apiUrl}?action=list&key=${encodeURIComponent(CONFIG.apiKey)}`;
      const r = await fetch(url); const j = await r.json();
      if (!j.ok) throw new Error(j.error||'list failed'); return j.rows||[];
    },
    async upsert(row) {
      const url = `${CONFIG.apiUrl}?action=upsert&key=${encodeURIComponent(CONFIG.apiKey)}`;
      const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'upsert failed'); return j.id;
    },
    async remove(id) {
      const url = `${CONFIG.apiUrl}?action=delete&key=${encodeURIComponent(CONFIG.apiKey)}`;
      const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'delete failed'); return true;
    }
  };
  let CACHE = [];
  async function reloadAll(){ CACHE = await API.list(); render(); }
  const getAll = ()=> CACHE.slice();

  // ---- Elements
  const loginSection=$('#login-section'), appSection=$('#app-section'), navActions=$('#nav-actions'), fab=$('#fab-new');
  const currentUser=$('#current-user'), tbody=$('#tbody-parties'), cards=$('#cards'), emptyMsg=$('#empty-msg');
  const loginForm=$('#login-form'), filtersForm=$('#filters'), btnClear=$('#btn-clear-filters');
  const btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), fileImport=$('#file-import'), btnLogout=$('#btn-logout');
  const dialog=$('#party-dialog'), form=$('#party-form'), dialogTitle=$('#dialog-title');
  const viewDialog=$('#view-dialog'), viewContent=$('#view-content'), btnCloseView=$('#btn-close-view');
  const filterHallSel=filtersForm.querySelector('select[name="hall"]');
  const formHallSel=form.querySelector('select[name="hall"]');
  const hallsCanvas=$('#chart-halls');

  // KPIs / Chart
  const kToday=$('#kpi-today'), kUpcoming=$('#kpi-upcoming'), kGuests=$('#kpi-guests');
  let hallChart=null;

  let state={filterDate:'', filterHall:'', editingId:null};

  // ---- Init
  function init(){
    buildHallSelects();

    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd=new FormData(loginForm);
      const u=(fd.get('username')||'').toString().trim();
      const p=(fd.get('password')||'').toString();
      const found=CONFIG.users.find(x=>x.username===u && x.password===p);
      if(!found) return toast('Usuário ou senha inválidos.');
      sessionStorage.setItem('vls_user', JSON.stringify({username:found.username, role:found.role}));
      applyAuth();
      try { await reloadAll(); toast('Login efetuado.'); } catch(err){ toast('Falha ao carregar dados. Verifique API.'); console.error(err); }
    });

    filtersForm.addEventListener('submit',(e)=>{
      e.preventDefault();
      const fd=new FormData(filtersForm);
      state.filterDate=(fd.get('date')||'').toString();
      state.filterHall=(fd.get('hall')||'').toString().trim().toLowerCase();
      render();
    });
    btnClear.addEventListener('click',()=>{filtersForm.reset();state.filterDate='';state.filterHall='';render();});

    btnNew.addEventListener('click', openCreate);
    fab.addEventListener('click', openCreate);

    btnExport.addEventListener('click', ()=>{
      const rows=getAll(); const blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='festas-export.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    btnCSV.addEventListener('click', ()=>{
      const rows=getAll(); const headers=['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text'];
      const esc=(s)=>`"${String(s??'').replace(/"/g,'""')}"`;
      const csv=[headers.join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h])).join(','))).join('\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='festas-export.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
    fileImport.addEventListener('change', async(e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      try{
        const txt=await f.text(); const data=JSON.parse(txt); if(!Array.isArray(data)) throw new Error('JSON inválido');
        for(const row of data){ if(!row.id) row.id=genId(); await API.upsert(row); }
        await reloadAll(); toast('Importação concluída.');
      }catch(err){ toast('Falha ao importar: '+err.message); } finally { fileImport.value=''; }
    });
    btnLogout.addEventListener('click',()=>{ sessionStorage.removeItem('vls_user'); applyAuth(); });

    dialog.addEventListener('close', ()=>{ form.reset(); state.editingId=null; });
    form.addEventListener('submit', e=>e.preventDefault());
    $('#btn-save').addEventListener('click', saveParty);
    btnCloseView.addEventListener('click', ()=>viewDialog.close());

    applyAuth();
    if(getUser()) reloadAll().catch(console.error);
  }

  function getUser(){ try{return JSON.parse(sessionStorage.getItem('vls_user'))||null;}catch{return null;} }
  function applyAuth(){
    const u=getUser(); const logged=!!u;
    loginSection.hidden=logged; appSection.hidden=!logged; navActions.hidden=!logged; fab.hidden=!logged;
    if(u) currentUser.textContent=`${u.username} (${u.role})`;
  }

  function buildHallSelects(){
    filterHallSel.innerHTML = '<option value=\"\">Todos</option>' + CONFIG.halls.map(h=>`<option value=\"${h}\">${h}</option>`).join('');
    formHallSel.innerHTML   = CONFIG.halls.map(h=>`<option value=\"${h}\">${h}</option>`).join('');
  }

  function filtered(rows){
    return rows.filter(r=>{
      if(state.filterDate && r.date!==state.filterDate) return false;
      if(state.filterHall && !r.hall.toLowerCase().includes(state.filterHall)) return false;
      return true;
    }).sort(byDateTime);
  }

  function render(){
    const rows=filtered(getAll());
    emptyMsg.hidden = rows.length>0;
    renderCards(rows); renderTable(rows);
    renderMetrics(getAll());
  }

  // ---- Dashboard
  function renderMetrics(all){
    const today=fmtDate(new Date());
    kToday.textContent = all.filter(r=>r.date===today).length;

    const now=new Date(today); const in30=new Date(now); in30.setDate(in30.getDate()+28);
    kUpcoming.textContent = all.filter(r=> new Date(r.date)>=now && new Date(r.date)<=in30).length;

    kGuests.textContent = all.reduce((sum,r)=> sum + ((r.guests_text||'').split(/\n+/).filter(Boolean).length||0), 0);

    const byHall=CONFIG.halls.reduce((acc,h)=>(acc[h]=0,acc),{});
    all.forEach(r=>{ const d=new Date(r.date); if(d>=now && d<=in30){ if(byHall[r.hall]!=null) byHall[r.hall]++; }});
    const labels=Object.keys(byHall); const data=Object.values(byHall);

    if(hallChart){ hallChart.data.labels=labels; hallChart.data.datasets[0].data=data; hallChart.update(); }
    else {
      hallChart=new Chart(hallsCanvas,{ type:'bar', data:{ labels, datasets:[{ label:'Reservas', data }] }, options:{ responsive:true, plugins:{legend:{display:false}} }});
    }
  }

  // ---- Cards (mobile)
  function cardHTML(r){
    const chips=[`Copos ${r.cups||0}`,`Garfos ${r.forks||0}`,`Facas ${r.knives||0}`,`Colheres ${r.spoons||0}`,`Pratos ${r.plates||0}`]
      .map(x=>`<span class="chip">${x}</span>`).join('');
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
      card.querySelector('[data-act="dup"]').addEventListener('click',  ()=>duplicate(id));
      card.querySelector('[data-act="ics"]').addEventListener('click',  ()=>downloadICS(id));
      card.querySelector('[data-act="del"]').addEventListener('click',  ()=>del(id));
    });
  }

  // ---- Tabela (desktop)
  function rowHTML(r){
    return `
      <tr>
        <td>${r.date}</td><td>${r.start_time||''}</td><td>${r.end_time||''}</td>
        <td>${r.hall}</td><td>${r.apartment}</td><td>${r.resident_name}</td>
        <td>${mats(r)}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-act="edit" data-id="${r.id}">Editar</button>
            <button class="btn" data-act="view" data-id="${r.id}">Ver</button>
            <button class="btn" data-act="dup"  data-id="${r.id}">Duplicar</button>
            <button class="btn" data-act="ics"  data-id="${r.id}">ICS</button>
            <button class="btn danger" data-act="del" data-id="${r.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }
  function renderTable(rows){
    tbody.innerHTML = rows.map(rowHTML).join('');
    $$('[data-act="edit"]',tbody).forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.id)));
    $$('[data-act="view"]',tbody).forEach(b=>b.addEventListener('click',()=>showView(b.dataset.id)));
    $$('[data-act="dup"]', tbody).forEach(b=>b.addEventListener('click',()=>duplicate(b.dataset.id)));
    $$('[data-act="ics"]', tbody).forEach(b=>b.addEventListener('click',()=>downloadICS(b.dataset.id)));
    $$('[data-act="del"]',tbody).forEach(b=>b.addEventListener('click',()=>del(b.dataset.id)));
  }

  // ---- CRUD
  function openCreate(){ form.reset(); $('#party-form [name="date"]').value=fmtDate(new Date()); dialogTitle.textContent='Nova Festa'; dialog.showModal(); }
  function fill(p){
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
  function openEdit(id){ const p=getAll().find(x=>x.id===id); if(!p)return; state.editingId=id; dialogTitle.textContent='Editar Festa'; fill(p); dialog.showModal(); }

  function showView(id){
    const p=getAll().find(x=>x.id===id); if(!p) return;
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

  async function del(id){
    const u=getUser(); if(!u) return;
    if(CONFIG.deleteRequiresSindico && u.role!=='sindico') return toast('Somente o síndico pode excluir.');
    if(!confirm('Confirmar exclusão?')) return;
    await API.remove(id);
    await reloadAll(); toast('Festa removida.');
  }

  function duplicate(id){
    const p=getAll().find(x=>x.id===id); if(!p) return;
    const copy={...p,id:genId()}; API.upsert(copy).then(()=>reloadAll()).then(()=>toast('Festa duplicada.')).catch(e=>toast('Erro ao duplicar'));
  }

  function readForm(){
    const fd=new FormData(form);
    const o={
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
    if(!CONFIG.halls.includes(o.hall)){ toast('Salão inválido. Use: Gourmet ou Menor.'); return null; }
    if(o.end_time && parseTime(o.end_time)<=parseTime(o.start_time)){ toast('Término deve ser depois do início.'); return null; }
    return o;
  }

  async function saveParty(){
    const u=getUser(); if(!u) return;
    const p=readForm(); if(!p) return;
    const rows=getAll();
    if(conflict(rows,p,state.editingId) && !confirm('Conflito de horário no mesmo salão. Salvar assim mesmo?')) return;
    await API.upsert(p);
    dialog.close(); await reloadAll(); toast('Festa salva.');
  }

  // ---- ICS
  function downloadICS(id){
    const p=getAll().find(x=>x.id===id); if(!p) return;
    const dt = (d,t)=>`${d.replace(/-/g,'')}` + (t?`T${t.replace(':','')}00`:'');
    const uid = `${id}@vivendas`;
    const ics = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vivendas//Festas//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${dt(p.date,p.start_time)}`,
      `DTEND:${dt(p.date,p.end_time||p.start_time)}`,
      `SUMMARY:Festa - ${p.resident_name} (${p.apartment})`,
      `LOCATION:${p.hall}`,
      `DESCRIPTION:Materiais: ${mats(p)}\\nConvidados:\\n${(p.guests_text||'').replace(/\\n/g,'; ')}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\\r\\n');
    const blob=new Blob([ics],{type:'text/calendar'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`festa-${p.date}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }

  window.addEventListener('DOMContentLoaded', init);
})();