// app.js
import { firebaseConfig, APP_NAME } from "./config.js";

// Firebase (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ========= Firebase ========= */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ========= Estado ========= */
let state = {
  user: null,
  monthBase: new Date(),
  halls: ["Gourmet", "Menor"],
  parties: [],
  view: "calendar" // "calendar" | "list"
};

let deferredPrompt = null;
document.title = APP_NAME;

/* ========= Init ========= */
function init() {
  // Registro do Service Worker + fluxo de atualização
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(reg=>{
      // Se há um SW em "waiting", oferece atualização
      if (reg.waiting) askToRefresh(reg.waiting);

      // Detecta novo SW instalado
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (sw) sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) askToRefresh(sw);
        });
      });

      // Recarrega quando o novo SW assume
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return; refreshing = true; location.reload();
      });
    }).catch(()=>{});
  }

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });

  onAuthStateChanged(auth, (u) => {
    state.user = u ? { email: u.email, uid: u.uid } : null;
    toggleAuthUI();
    if (u) loadParties().then(()=>{ renderAll(); showView(state.view); });
  });

  ensureHelpers();
  fillHallSelects();
  bindEvents();
  renderCalendar();
}

function ensureHelpers() {
  const style = document.createElement("style");
  style.textContent = `
    .center-v{display:grid;min-height:60vh;place-items:center}
    .action-btn{margin-right:6px}
    .cal-dot{position:absolute;right:8px;bottom:8px;width:9px;height:9px;border-radius:50%;
      background:#19d38a;box-shadow:0 0 0 3px rgba(24,192,122,.14)}
  `;
  document.head.appendChild(style);
}

/* ========= Drawer ========= */
function openDrawer(){ $("#drawer").hidden=false; $("#backdrop").hidden=false; setTimeout(()=>$("#drawer").classList.add("open"),0); }
function closeDrawer(){ $("#drawer").classList.remove("open"); setTimeout(()=>{ $("#drawer").hidden=true; $("#backdrop").hidden=true; },180); }

function bindEvents() {
  // Login
  $("#btn-login")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#login-form [name=email]").value.trim();
    const pass  = $("#login-form [name=password]").value;
    if (!email || !pass) return err("Preencha e-mail e senha.");
    try { await signInWithEmailAndPassword(auth, email, pass); toast("Login ok."); }
    catch { err("Falha no login. Confira e-mail e senha."); }
  });

  // Menu
  $("#btn-menu")?.addEventListener("click", openDrawer);
  $("#btn-close-drawer")?.addEventListener("click", closeDrawer);
  $("#backdrop")?.addEventListener("click", closeDrawer);
  $('[data-go="calendar"]')?.addEventListener("click", ()=>{ showView("calendar"); closeDrawer(); });
  $('[data-go="list"]')?.addEventListener("click", ()=>{ showView("list"); closeDrawer(); });
  $("#m-new")?.addEventListener("click", ()=>{ closeDrawer(); openPartyDialog(); });
  $("#m-logout")?.addEventListener("click", async ()=>{ closeDrawer(); await signOut(auth); toast("Saiu."); });

  // Acessibilidade do Drawer: ESC fecha e foca primeiro item ao abrir
  document.addEventListener("keydown", (ev)=>{
    if (ev.key === "Escape" && !$("#drawer").hidden) { closeDrawer(); }
  });
  const firstDrawerItem = () => $("#drawer .drawer-item, #btn-close-drawer");
  const drawerObserver = new MutationObserver(()=>{
    if (!$("#drawer").hidden) { firstDrawerItem()?.focus(); }
  });
  drawerObserver.observe($("#drawer"), { attributes:true, attributeFilter:["hidden"] });

  // Ações
  $("#fab-new")?.addEventListener("click", () => openPartyDialog());
  $("#btn-close-view")?.addEventListener("click", () => $("#view-dialog").close());

  // Calendário
  $("#cal-prev")?.addEventListener("click", () => { shiftMonth(-1); });
  $("#cal-next")?.addEventListener("click", () => { shiftMonth(1); });

  // Filtros (lista)
  $("#filters")?.addEventListener("submit", (e) => { e.preventDefault(); renderTable(); });
  $("#btn-clear-filters")?.addEventListener("click", () => { $("#filters").reset(); renderTable(); });
}

function showView(view){
  state.view = view;
  $("#sec-calendar").hidden = view !== "calendar";
  $("#sec-list").hidden = view !== "list";
  document.querySelector(view==="calendar" ? "#sec-calendar" : "#sec-list").scrollIntoView({behavior:"smooth"});
}

function fillHallSelects() {
  const selects = $$('select[name="hall"]');
  selects.forEach(sel => {
    const firstIsAll = sel.querySelector('option[value=""]') !== null;
    sel.innerHTML = firstIsAll ? '<option value="">Todos</option>' : "";
    ["Gourmet","Menor"].forEach(h => {
      const o = document.createElement("option");
      o.value = h; o.textContent = h;
      sel.appendChild(o);
    });
  });
}

function toggleAuthUI() {
  const logged = !!state.user;
  $("#login-section").hidden = logged;
  $("#app-section").hidden = !logged;
  $("#fab-new").hidden = !logged;
}

/* ========= Firestore ========= */
async function loadParties() {
  $("#tbody-parties")?.classList.add("loading");
  try {
    const snap = await getDocs(collection(db, "parties"));
    state.parties = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } finally {
    $("#tbody-parties")?.classList.remove("loading");
  }
}
async function createParty(data) { const ref = await addDoc(collection(db, "parties"), data); return ref.id; }
async function updateParty(id, data) { await updateDoc(doc(db, "parties", id), data); }
async function deleteParty(id) { await deleteDoc(doc(db, "parties", id)); }

/* ========= Calendário & KPIs ========= */
function shiftMonth(n){ const d = new Date(state.monthBase); d.setMonth(d.getMonth()+n); state.monthBase = d; renderCalendar(); }
function renderAll(){ renderCalendar(); renderTable(); updateKPIs(); }

function updateKPIs(){
  const todayStr = fmtDate(new Date());
  const fourWeeks = new Date(); fourWeeks.setDate(fourWeeks.getDate()+28);
  $("#kpi-today").textContent = state.parties.filter(p => p.date === todayStr).length;
  $("#kpi-upcoming").textContent = state.parties.filter(p => new Date(p.date) > new Date() && new Date(p.date) <= fourWeeks).length;
  $("#kpi-guests").textContent = state.parties.reduce((a,p)=> a + (Array.isArray(p.guests)?p.guests.length:0), 0);
}

function renderCalendar(){
  const grid = $("#cal-grid");
  const title = $("#cal-title");
  const base = new Date(state.monthBase.getFullYear(), state.monthBase.getMonth(), 1);
  const monthName = base.toLocaleString("pt-BR",{month:"long", timeZone:"America/Sao_Paulo"});
  title.textContent = `${cap(monthName)} ${base.getFullYear()}`;
  grid.innerHTML = "";

  const start = new Date(base);
  const startWeekday = (start.getDay()+6)%7; // seg = 0
  start.setDate(start.getDate() - startWeekday);

  for (let i=0;i<42;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const dateStr = fmtDate(d);

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (d.getMonth() !== base.getMonth()) cell.classList.add("cal-out");

    const hit = document.createElement("button");
    hit.className = "cal-hit"; hit.title = dateStr;

    const dayDiv = document.createElement("div");
    dayDiv.textContent = d.getDate();
    hit.appendChild(dayDiv);

    // bolinha verde quando existe festa
    const has = state.parties.some(p => p.date === dateStr);
    if (has) {
      const dot = document.createElement("span");
      dot.className = "cal-dot";
      hit.appendChild(dot);
    }

    hit.addEventListener("click", () => {
      $("#filters [name=date]").value = dateStr;
      renderTable();
      showView("list");
    });

    if (dateStr === fmtDate(new Date())) cell.classList.add("cal-today");
    cell.appendChild(hit);
    grid.appendChild(cell);
  }
}

/* ========= Tabela ========= */
function renderTable(){
  const tbody = $("#tbody-parties");
  tbody.innerHTML = "";

  const fDate = $("#filters [name=date]").value;
  const fHall = $("#filters [name=hall]").value;

  const list = state.parties
    .filter(p => !fDate || p.date === fDate)
    .filter(p => !fHall || p.hall === fHall)
    .sort((a,b)=> (a.date+b.start_time).localeCompare(b.date+b.start_time));

  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td"); td.colSpan = 8; td.className="muted";
    td.textContent = "Nenhum registro.";
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }

  list.forEach(p=>{
    const tr = document.createElement("tr");
    const showFinalize = eventEnded(p);
    const statusBadge = p.status ? `<span class="badge ${p.status==="ok"?"ok":"warn"}">${p.status==="ok"?"OK":"Ocorrência"}</span>` : "";

    tr.innerHTML = `
      <td data-th="Data">${p.date}</td>
      <td data-th="Início">${p.start_time||""}</td>
      <td data-th="Término">${p.end_time||""}</td>
      <td data-th="Salão">${p.hall||""}</td>
      <td data-th="Apto">${p.apartment||""}</td>
      <td data-th="Morador">${p.resident_name||""}</td>
      <td data-th="Materiais">${matSummary(p)}</td>
      <td data-th="Ações">
        ${statusBadge}
        <button class="btn tiny action-btn" data-act="view">Ver</button>
        <button class="btn tiny action-btn" data-act="edit">Editar</button>
        ${showFinalize?'<button class="btn tiny action-btn" data-act="finalizar">Finalizar</button>':''}
        ${p.status?'<button class="btn tiny action-btn" data-act="refinalize">Editar finalização</button>':''}
        <button class="btn tiny action-btn" data-act="guests">Convidados</button>
        <button class="btn tiny danger action-btn" data-act="del">Apagar</button>
      </td>
    `;

    tr.querySelector('[data-act="view"]').addEventListener("click", ()=> openView(p));
    tr.querySelector('[data-act="edit"]').addEventListener("click", ()=> openPartyDialog(p));
    tr.querySelector('[data-act="guests"]').addEventListener("click", ()=> openGuests(p));
    if (showFinalize) tr.querySelector('[data-act="finalizar"]')?.addEventListener("click", ()=> openFinalize(p));
    if (p.status) tr.querySelector('[data-act="refinalize"]')?.addEventListener("click", ()=> openFinalize(p));
    tr.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
      if (!confirm("Apagar esta festa?")) return;
      await deleteParty(p.id); await loadParties(); renderAll(); toast("Apagado.");
    });

    tbody.appendChild(tr);
  });
}

function eventEnded(p){
  const end = new Date(`${p.date}T${p.end_time || "23:59"}`);
  return new Date() > end;
}

function matSummary(p){
  const req = `${p.cups||0} copos, ${p.plates||0} pratos`;
  const brk = (p.broken_cups||0)+(p.broken_plates||0)+(p.broken_forks||0)+(p.broken_knives||0)+(p.broken_spoons||0);
  return `${req}${brk?` • quebrados: ${brk}`:""}`;
}

/* ========= Nova/Editar ========= */
function openPartyDialog(existing=null){
  const dlg = $("#party-dialog");
  dlg.innerHTML = `
    <form id="party-form" class="form">
      <header><h3 id="dialog-title">${existing ? "Editar Festa" : "Nova Festa"}</h3></header>
      <div class="grid two">
        <label>Data <input type="date" name="date" required></label>
        <label>Salão <select name="hall" required></select></label>
        <label>Início <input type="time" name="start_time" required></label>
        <label>Término <input type="time" name="end_time"></label>
      </div>
      <fieldset><legend>Materiais (solicitados)</legend>
        <div class="grid five">
          <label>Copos <input type="number" name="cups" min="0" value="0"></label>
          <label>Garfos <input type="number" name="forks" min="0" value="0"></label>
          <label>Facas <input type="number" name="knives" min="0" value="0"></label>
          <label>Colheres <input type="number" name="spoons" min="0" value="0"></label>
          <label>Pratos <input type="number" name="plates" min="0" value="0"></label>
        </div>
      </fieldset>
      <div class="grid two">
        <label>Apto <input type="text" name="apartment" inputmode="numeric" autocomplete="on" required></label>
        <label>Morador <input type="text" name="resident_name" autocomplete="name" required></label>
      </div>
      <label>Convidados
        <textarea name="guests_text" rows="5" placeholder="Nome 1; Nome 2; ..."></textarea>
      </label>
      <menu>
        <button id="btn-cancel" type="button" class="btn">Cancelar</button>
        <button id="btn-save" class="btn primary">Salvar</button>
      </menu>
    </form>
  `;
  fillHallSelects();
  const form = $("#party-form");
  form.dataset.editing = existing ? existing.id : "";

  if (existing){
    form.date.value = existing.date || "";
    form.hall.value = existing.hall || "";
    form.start_time.value = existing.start_time || "";
    form.end_time.value = existing.end_time || "";
    form.apartment.value = existing.apartment || "";
    form.resident_name.value = existing.resident_name || "";
    form.cups.value = existing.cups||0;
    form.forks.value = existing.forks||0;
    form.knives.value = existing.knives||0;
    form.spoons.value = existing.spoons||0;
    form.plates.value = existing.plates||0;
    form.guests_text.value = (existing.guests||[]).join("; ");
  }

  $("#btn-cancel")?.addEventListener("click", () => $("#party-dialog").close());
  $("#btn-save")?.addEventListener("click", (e) => { e.preventDefault(); savePartyFromForm(); });

  dlg.showModal();
}

async function savePartyFromForm(){
  const form = $("#party-form");
  const data = Object.fromEntries(new FormData(form).entries());
  data.cups = num(data.cups); data.forks=num(data.forks); data.knives=num(data.knives);
  data.spoons=num(data.spoons); data.plates=num(data.plates);
  data.guests = (data.guests_text||"").split(";").map(s=>s.trim()).filter(Boolean);

  const editingId = $("#party-form").dataset.editing;
  try {
    if (editingId){ await updateParty(editingId, data); }
    else { await createParty({ ...data, created_at: Date.now() }); }
    $("#party-dialog").close();
    await loadParties(); renderAll(); toast("Salvo.");
  } catch { err("Não foi possível salvar."); }
}

/* ========= Finalizar ========= */
let currentFinalizeId = null;

function openFinalize(p){
  currentFinalizeId = p.id;
  const dlg = $("#finalize-dialog");
  dlg.innerHTML = `
    <form id="finalize-form" class="form">
      <header><h3>Finalizar festa</h3></header>
      <p class="tiny muted">Use este formulário somente depois que a festa terminou.</p>
      <fieldset>
        <legend>Resultado</legend>
        <label><input type="radio" name="status" value="ok" ${p.status!=="occurrence"?"checked":""}> Terminou bem</label>
        <label><input type="radio" name="status" value="occurrence" ${p.status==="occurrence"?"checked":""}> Teve ocorrência</label>
      </fieldset>
      <label>Notas (opcional)
        <textarea name="occurrence_notes" rows="4" placeholder="Descreva a ocorrência">${p.occurrence_notes||""}</textarea>
      </label>
        <fieldset><legend>Itens quebrados (opcional)</legend>
        <div class="grid five">
          <label>Copos <input type="number" name="broken_cups" min="0" value="${num(p.broken_cups)}"></label>
          <label>Garfos <input type="number" name="broken_forks" min="0" value="${num(p.broken_forks)}"></label>
          <label>Facas <input type="number" name="broken_knives" min="0" value="${num(p.broken_knives)}"></label>
          <label>Colheres <input type="number" name="broken_spoons" min="0" value="${num(p.broken_spoons)}"></label>
          <label>Pratos <input type="number" name="broken_plates" min="0" value="${num(p.broken_plates)}"></label>
        </div>
      </fieldset>
      <menu>
        <button id="btn-finalize-cancel" type="button" class="btn">Cancelar</button>
        <button id="btn-finalize-save" class="btn primary">Salvar finalização</button>
      </menu>
    </form>
  `;
  $("#btn-finalize-cancel")?.addEventListener("click", () => $("#finalize-dialog").close());
  $("#btn-finalize-save")?.addEventListener("click", (e) => { e.preventDefault(); saveFinalizeFromForm(); });
  dlg.showModal();
}

async function saveFinalizeFromForm(){
  if (!currentFinalizeId) return;
  const f = $("#finalize-form");
  const data = Object.fromEntries(new FormData(f).entries());
  const patch = {
    status: data.status,
    occurrence_notes: data.occurrence_notes || "",
    broken_cups:   num(data.broken_cups),
    broken_forks:  num(data.broken_forks),
    broken_knives: num(data.broken_knives),
    broken_spoons: num(data.broken_spoons),
    broken_plates: num(data.broken_plates),
    finalized_at: Date.now()
  };
  try {
    await updateParty(currentFinalizeId, patch);
    $("#finalize-dialog").close();
    currentFinalizeId = null;
    await loadParties(); renderAll(); toast("Festa finalizada.");
  } catch { err("Não foi possível salvar a finalização."); }
}

/* ========= Ver & Convidados ========= */
function openView(p){
  const el = $("#view-content");
  const guests = (p.guests||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join(" ");
  const notes = p.occurrence_notes ? esc(p.occurrence_notes) : "—";
  const brk = (p.broken_cups||0)+(p.broken_plates||0)+(p.broken_forks||0)+(p.broken_knives||0)+(p.broken_spoons||0);
  el.innerHTML = `
    <div class="party-card card">
      <div class="party-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong>${p.date} • ${esc(p.hall||"")}</strong>
        <span class="badge ${p.status === "ok" ? "ok" : p.status === "occurrence" ? "warn" : ""}">
          ${p.status ? (p.status === "ok" ? "OK" : "Ocorrência") : "Sem status"}
        </span>
      </div>
      <div class="muted tiny">Início: ${p.start_time||"-"} • Término: ${p.end_time||"-"}</div>
      <div class="muted tiny">Materiais: ${matSummary(p)}</div>
      <div class="muted tiny">Convidados: ${guests||"<em>—</em>"}</div>
      <div class="muted tiny">Notas: ${notes}</div>
      <div class="muted tiny">Quebrados: ${brk || "—"}</div>
    </div>
  `;
  $("#view-dialog").showModal();
}

async function openGuests(p){
  const list = prompt("Edite os convidados (separe por ponto e vírgula ';'):", (p.guests||[]).join("; "));
  if (list===null) return;
  const guests = list.split(";").map(s=>s.trim()).filter(Boolean);
  try { await updateParty(p.id, { guests }); await loadParties(); renderAll(); toast("Convidados atualizados."); }
  catch { err("Não foi possível atualizar convidados."); }
}

/* ========= Util ========= */
function fmtDate(d){ return d.toISOString().slice(0,10); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; setTimeout(()=>t.hidden=true,2000); }
function err(msg){ const e=$("#errbox"); e.textContent=msg; e.hidden=false; setTimeout(()=>e.hidden=true,2500); }
function esc(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function num(v){ const n=parseInt(v,10); return isNaN(n)?0:n; }

function askToRefresh(worker){
  if (confirm("Aplicativo atualizado. Deseja 