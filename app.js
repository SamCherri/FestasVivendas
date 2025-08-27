// app.js v18 — Calendário mensal + clique para filtrar + long-press para criar
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

  // Firebase
  const app = initializeApp(CONFIG.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const festasCol = collection(db, 'festas');

  // Estado/UI
  let CACHE = []; let loading = false;
  const loginSection=$('#login-section'), appSection=$('#app-section'), navActions=$('#nav-actions'), fab=$('#fab-new');
  const currentUser=$('#current-user'), tbody=$('#tbody-parties'), cards=$('#cards'), emptyMsg=$('#empty-msg'), loadingMsg=$('#loading-msg');
  const loginForm=$('#login-form'), btnLogin=$('#btn-login'), filtersForm=$('#filters');
  const btnNew=$('#btn-new'), btnExport=$('#btn-export'), btnCSV=$('#btn-export-csv'), btnLogout=$('#btn-logout');
  const dialog=$('#party-dialog'), form=$('#party-form'), dialogTitle=$('#dialog-title'), btnSave=$('#btn-save');
  const viewDialog=$('#view-dialog'), viewContent=$('#view-content');
  const filterHallSel=filtersForm.querySelector('select[name="hall"]');
  const formHallSel=form.querySelector('select[name="hall"]');
  const kToday=$('#kpi-today'), kUpcoming=$('#kpi-upcoming'), kGuests=$('#kpi-guests');

  // Calendário
  const calGrid = $('#cal-grid'), calTitle = $('#cal-title');
  const calPrev = $('#cal-prev'), calNext = $('#cal-next');
  let calCursor = new Date(); // mês atual

  let state={filterDate:'', filterHall:'', editingId:null};

  // Garante oculto no start
  navActions.hidden = true; fab.hidden = true; appSection.hidden = true;

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
  function render(){
    const rows=filtered(getAll());
    emptyMsg.hidden = rows.length>0 || loading;
    renderCalendar();              // NOVO: renderiza calendário
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

  // ====== Calendário (macro) ======
  function monthInfo(d){
    const y=d.getFullYear(), m=d.getMonth();
    const first=new Date(y,m,1);
    const last=new Date(y,m+1,0);
    const startDow = (first.getDay()+6)%7; // transformar para semana começando em segunda (0=seg)
    return { y, m, days:last.getDate(), startDow };
  }
  function fmtMonthTitle(d){
    return d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })
      .replace(/^./, c=>c.toUpperCase()); // capitaliza primeira letra
  }
  function renderCalendar(){
    const {y,m,days,startDow} = monthInfo(calCursor);
    calTitle.textContent = fmtMonthTitle(calCursor);
    const todayStr = fmtDate(new Date());
    // Mapear quantas festas por dia
    const counts = getAll().reduce((acc,r)=>{ acc[r.date]=(acc[r.date]||0)+1; return acc; }, {});
    // Construir células: cabeçalho dias da semana + 6 linhas
    const dow = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    calGrid.innerHTML = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    const cells = [];
    const prevDays = startDow;
    const totalCells = 42; // 6 semanas x 7 dias
    // Data base para iteração
    const firstGridDate = new Date(y,m,1 - prevDays);
    for(let i=0;i<totalCells;i++){
      const d = new Date(firstGridDate); d.setDate(d.getDate()+i);
      const ds = fmtDate(d);
      const inMonth = d.getMonth()===m;
      const isToday = ds===todayStr;
      const has = counts[ds]>0;
      const classes = ['cal-cell'];
      if(!inMonth) classes.push('cal-out');
      if(isToday) classes.push('cal-today');
      const badge = has ? `<span class="badge-small">${counts[ds]} festa(s)</span>` : '';
      cells.push(`
        <div class="${classes.join(' ')}">
          <button class="cal-hit" data-date="${ds}" ${inMonth?'':'data-out="1"'} aria-label="Dia ${ds}">
            <div class="cal-date">${String(d.getDate()).padStart(2,'0')}</div>
            <div class="cal-badges">${badge}</div>
          </button>
        </div>`);
    }
    calGrid.insertAdjacentHTML('beforeend', cells.join(''));
    // Eventos: clique = filtra; long-press = abre criação
    let pressTimer=null;
    calGrid.querySelectorAll('.cal-hit').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const date = e.currentTarget.dataset.date;
        state.filterDate = date;
        $('#filters [name="date"]').value = date;
        render();
        // rola para lista
        document.getElementById('cards').scrollIntoView({behavior:'smooth', block:'start'});
      });
      btn.addEventListener('mousedown', (e)=>{
        const date = e.currentTarget.dataset.date;
        pressTimer = setTimeout(()=>{ openCreateWithDate(date); }, 600);
      });
      ['mouseup','mouseleave','touchend','touchcancel','mouseout'].forEach(ev=>{
        btn.addEventListener(ev, ()=>{ if(pressTimer){clearTimeout(pressTimer); pressTimer=null;} });
      });
      btn.addEventListener('touchstart', (e)=>{
        const date = e.currentTarget.dataset.date;
        press