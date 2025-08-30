/* ==========================================================
   Vivendas — App (v7 refatorado)
   - Login com mensagens claras na página
   - Troca Login/App garantida (guardas)
   - Calendário com “bolinha verde”
   - Lista, Nova/Editar, Finalizar, Convidados
   - Lembretes (3 e 1 dias)
   - Menu lateral + PWA instalar
   ========================================================== */

import { firebaseConfig, APP_NAME } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Helpers DOM ---------- */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const txt = (el, v)=>{ if (el) el.textContent = v; };
const show = (el, yes)=>{ if (el) el.hidden = !yes; };

/* ---------- Estado ---------- */
let state = {
  user: null,
  monthBase: new Date(),
  parties: [],
  view: "calendar"
};

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ---------- PWA install ---------- */
let deferredPrompt = null, installTried = false;

/* ---------- Init seguro ---------- */
document.title = APP_NAME;

function init() {
  // Service worker (versão incrementada no index)
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=6").catch(()=>{});

  // Fonte grande em mobile (extra via classe)
  const mq = window.matchMedia("(max-width: 900px)");
  const html = document.documentElement;
  const setMobile = () => mq.matches ? html.classList.add("is-mobile") : html.classList.remove("is-mobile");
  setMobile();
  (mq.addEventListener ? mq.addEventListener("change", setMobile) : mq.addListener(setMobile));

  // Instalação
  window.addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); deferredPrompt = e; });

  // Auth
  onAuthStateChanged(auth, async (u)=>{
    state.user = u ? { email: u.email, uid: u.uid } : null;
    toggleAuthUI();
    if (u) { await loadParties(); renderAll(); showView(state.view); }
  });

  // Controles fixos
  bindEvents();
  fillHallSelects();
  renderCalendar();
  startReminderLoop();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

/* ---------- Troca de telas ---------- */
function toggleAuthUI(){
  const logged = !!state.user;
  show($("#login-section"), !logged);
  show($("#app-section"), logged);
  if ($("#fab-new")) $("#fab-new").hidden = !logged;
}

/* ---------- Eventos ---------- */
function bindEvents(){
  // Login
  $("#login-form")?.addEventListener("submit", onLoginSubmit);
  $("#btn-login")?.addEventListener("click", (e)=>{ e.preventDefault(); $("#login-form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); });
  $("#btn-install-login")?.addEventListener("click", triggerInstall);

  // Menu
  $("#btn-menu")?.addEventListener("click", openDrawer);
  $("#btn-close-drawer")?.addEventListener("click", closeDrawer);
  $("#backdrop")?.addEventListener("click", closeDrawer);
  $('[data-go="calendar"]')?.addEventListener("click", ()=>{ showView("calendar"); closeDrawer(); });
  $('[data-go="list"]')?.addEventListener("click", ()=>{ showView("list"); closeDrawer(); });
  $("#m-new")?.addEventListener("click", ()=>{ closeDrawer(); openPartyDialog(); });
  $("#m-notify")?.addEventListener("click", ()=>{ closeDrawer(); requestNotify(); });
  $("#m-install")?.addEventListener("click", ()=>{ closeDrawer(); triggerInstall(); });
  $("#m-logout")?.addEventListener("click", async()=>{ closeDrawer(); await signOut(auth); toast("Saiu."); });

  // Ações gerais
  $("#fab-new")?.addEventListener("click", ()=> openPartyDialog());
  $("#btn-close-view")?.addEventListener("click", ()=> $("#view-dialog").close());

  // Calendário
  $("#cal-prev")?.addEventListener("click", ()=> shiftMonth(-1));
  $("#cal-next")?.addEventListener("click", ()=> shiftMonth(1));

  // Lista / filtros
  $("#filters")?.addEventListener("submit",(e)=>{ e.preventDefault(); renderTable(); });
  $("#btn-clear-filters")?.addEventListener("click",()=>{ $("#filters").reset(); renderTable(); });
}

/* ---------- Login ---------- */
async function onLoginSubmit(e){
  e.preventDefault();
  hideLoginError();
  const email = $("#login-form [name=email]").value.trim();
  const pass  = $("#login-form [name=password]").value;
  if(!email || !pass) return showLoginError({code:"custom/missing-fields"});

  try{
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Login ok.");
  }catch(ex){
    showLoginError(ex);
  }
}
function hideLoginError(){ const b=$("#login-error-box"); if (b) b.hidden = true; }
function showLoginError(ex){
  const box = $("#login-error-box"); if (!box) return;
  const { friendly, code, tips } = explainAuthError(ex);
  box.innerHTML = `
    <div><strong>${friendly}</strong></div>
    <div style="margin-top:6px">Código técnico: <code>${code||"—"}</code></div>
    ${tips.length ? `<ul style="margin:8px 0 0 18px">${tips.map(t=>`<li>${t}</li>`).join("")}</ul>` : ""}
  `;
  box.hidden = false;
}
function explainAuthError(ex){
  const code = ex?.code || ex || "";
  let friendly = "Não foi possível entrar."; const tips = [];
  switch(code){
    case "custom/missing-fields": friendly="Preencha e-mail e senha."; break;
    case "auth/invalid-email": friendly="E-mail inválido."; break;
    case "auth/user-not-found": friendly="Usuário não existe."; tips.push("Firebase → Authentication → Usuários → Adicionar usuário."); break;
    case "auth/wrong-password": friendly="Senha incorreta."; break;
    case "auth/too-many-requests": friendly="Muitas tentativas. Tente mais tarde."; break;
    case "auth/network-request-failed": friendly="Sem internet ou rede bloqueada."; tips.push("Teste em outra rede / aba anônima."); break;
    case "auth/operation-not-allowed": friendly="E-mail/Senha desativado."; tips.push("Ative em Authentication → Método de login."); break;
    case "auth/unauthorized-domain": friendly="Domínio não autorizado."; tips.push("Authentication → Configurações → Domínios autorizados."); break;
    case "auth/invalid-api-key":
    case "auth/configuration-not-found": friendly="Configuração inválida."; tips.push("Confira o arquivo config.js."); break;
    default: tips.push("Confirme: usuário criado, método e-mail/senha ativo e domínio autorizado.");
  }
  return { friendly, code, tips };
}

/* ---------- Drawer ---------- */
function openDrawer(){ $("#drawer").hidden=false; $("#backdrop").hidden=false; document.body.classList.add("no-scroll"); setTimeout(()=>$("#drawer").classList.add("open"),0); }
function closeDrawer(){ $("#drawer").classList.remove("open"); setTimeout(()=>{ $("#drawer").hidden=true; $("#backdrop").hidden=true; document.body.classList.remove("no-scroll"); },180); }

/* ---------- PWA install ---------- */
async function triggerInstall(){
  try{
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") toast("Instalação iniciada.");
      deferredPrompt = null;
    } else if (!installTried) {
      installTried = true;
      toast("Se o botão 'Instalar' aparecer no navegador, toque nele.");
    }
  }catch{ err("Não foi possível iniciar a instalação."); }
}

/* ---------- Navegação interna ---------- */
function showView(view){
  state.view = view;
  show($("#sec-calendar"), view==="calendar");
  show($("#sec-list"), view==="list");
  (view==="calendar"? $("#sec-calendar") : $("#sec-list"))?.scrollIntoView({behavior:"smooth"});
}

/* ---------- Firestore ---------- */
async function loadParties(){
  const snap = await getDocs(collection(db,"parties"));
  state.parties = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
async function createParty(data){ const ref = await addDoc(collection(db,"parties"), data); return ref.id; }
async function updateParty(id, data){ await updateDoc(doc(db,"parties",id), data); }
async function deleteParty(id){ await deleteDoc(doc(db,"parties",id)); }

/* ---------- KPIs / Calendário ---------- */
function renderAll(){ renderCalendar(); renderTable(); updateKPIs(); }

function updateKPIs(){
  const todayStr = fmtDate(new Date());
  const fourWeeks = new Date(); fourWeeks.setDate(fourWeeks.getDate()+28);
  txt($("#kpi-today"), state.parties.filter(p=>p.date===todayStr).length);
  txt($("#kpi-upcoming"), state.parties.filter(p=> new Date(p.date) > new Date() && new Date(p.date) <= fourWeeks).length);
  txt($("#kpi-guests"), state.parties.reduce((a,p)=> a + (Array.isArray(p.guests)?p.guests.length:0), 0));
}

function shiftMonth(n){ const d = new Date(state.monthBase); d.setMonth(d.getMonth()+n); state.monthBase=d; renderCalendar(); }

function renderCalendar(){
  const grid = $("#cal-grid"); const title = $("#cal-title"); if (!grid || !title) return;
  const base = new Date(state.monthBase.getFullYear(), state.monthBase.getMonth(), 1);
  const monthName = base.toLocaleString("pt-BR",{month:"long"});
  title.textContent = `${cap(monthName)} ${base.getFullYear()}`;
  grid.innerHTML = "";

  const start = new Date(base);
  const startWeekday = (start.getDay()+6)%7; // seg = 0
  start.setDate(start.getDate()-startWeekday);

  for (let i=0;i<42;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const dateStr = fmtDate(d);

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (d.getMonth() !== base.getMonth()) cell.classList.add("cal-out");
    if (dateStr === fmtDate(new Date())) cell.classList.add("cal-today");

    const hit = document.createElement("button");
    hit.className = "cal-hit"; hit.title = dateStr;
    hit.innerHTML = `<div>${d.getDate()}</div>`;

    // bolinha verde (sem número)
    if (state.parties.some(p=>p.date===dateStr)) {
      const dot = document.createElement("span"); dot.className="cal-dot"; hit.appendChild(dot);
    }

    hit.addEventListener("click", ()=>{
      const f = $("#filters"); if (f) { f.date.value = dateStr; renderTable(); showView("list"); }
    });

    cell.appendChild(hit);
    grid.appendChild(cell);
  }
}

/* ---------- Lista / Tabela ---------- */
function renderTable(){
  const tbody = $("#tbody-parties"); if (!tbody) return;
  tbody.innerHTML = "";

  const fDate = $("#filters [name=date]")?.value || "";
  const fHall = $("#filters [name=hall]")?.value || "";

  const list = state.parties
    .filter(p=>!fDate || p.date===fDate)
    .filter(p=>!fHall || p.hall===fHall)
    .sort((a,b)=> (a.date+a.start_time).localeCompare(b.date+b.start_time));

  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td"); td.colSpan = 8; td.className="muted"; td.textContent="Nenhum registro.";
    tr.appendChild(td); tbody.appendChild(tr); return;
  }

  list.forEach(p=>{
    const tr = document.createElement("tr");
    const showFinalize = hasEnded(p);
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
        <button class="btn tiny action-btn" data-act="view" type="button">Ver</button>
        <button class="btn tiny action-btn" data-act="edit" type="button">Editar</button>
        ${showFinalize?'<button class="btn tiny action-btn" data-act="finalize" type="button">Finalizar</button>':''}
        ${p.status?'<button class="btn tiny action-btn" data-act="refinalize" type="button">Editar finalização</button>':''}
        <button class="btn tiny action-btn" data-act="guests" type="button">Convidados</button>
        <button class="btn tiny danger action-btn" data-act="del" type="button">Apagar</button>
      </td>
    `;
    tr.querySelector('[data-act="view"]').addEventListener("click", ()=> openView(p));
    tr.querySelector('[data-act="edit"]').addEventListener("click", ()=> openPartyDialog(p));
    tr.querySelector('[data-act="guests"]').addEventListener("click", ()=> openGuests(p));
    if (showFinalize) tr.querySelector('[data-act="finalize"]')?.addEventListener("click", ()=> openFinalize(p));
    if (p.status) tr.querySelector('[data-act="refinalize"]')?.addEventListener("click", ()=> openFinalize(p));
    tr.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
      if (!confirm("Apagar esta festa?")) return;
      await deleteParty(p.id); await loadParties(); renderAll(); toast("Apagado.");
    });

    tbody.appendChild(tr);
  });
}
function hasEnded(p){ const end = new Date(`${p.date}T${p.end_time||"23:59"}`); return new Date() > end; }
function matSummary(p){
  const req = `${p.cups||0} copos, ${p.plates||0} pratos`;
  const brk = (p.broken_cups||0)+(p.broken_plates||0)+(p.broken_forks||0)+(p.broken_knives||0)+(p.broken_spoons||0);
  return `${req}${brk?` • quebrados: ${brk}`:""}`;
}

/* ---------- Nova/Editar ---------- */
function fillHallSelects(){
  $$('select[name="hall"]').forEach(sel=>{
    const hasAll = sel.querySelector('option[value=""]')!==null;
    sel.innerHTML = hasAll ? '<option value="">Todos</option>' : "";
    ["Gourmet","Menor"].forEach(h=>{ const o=document.createElement("option"); o.value=h; o.textContent=h; sel.appendChild(o); });
  });
}

function openPartyDialog(existing=null){
  const dlg = $("#party-dialog");
  dlg.innerHTML = `
    <form id="party-form" class="form">
      <header><h3>${existing ? "Editar Festa" : "Nova Festa"}</h3></header>
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
        <label>Apto <input type="text" name="apartment" required></label>
        <label>Morador <input type="text" name="resident_name" required></label>
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
    form.date.value = existing.date||""; form.hall.value = existing.hall||"";
    form.start_time.value = existing.start_time||""; form.end_time.value = existing.end_time||"";
    form.apartment.value = existing.apartment||""; form.resident_name.value = existing.resident_name||"";
    form.cups.value = +existing.cups||0; form.forks.value = +existing.forks||0;
    form.knives.value = +existing.knives||0; form.spoons.value = +existing.spoons||0; form.plates.value = +existing.plates||0;
    form.guests_text.value = (existing.guests||[]).join("; ");
  }
  $("#btn-cancel")?.addEventListener("click",()=> dlg.close());
  $("#btn-save")?.addEventListener("click",(e)=>{ e.preventDefault(); savePartyFromForm(); });
  dlg.showModal();
}

async function savePartyFromForm(){
  const form = $("#party-form"); if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  data.cups = n(data.cups); data.forks=n(data.forks); data.knives=n(data.knives); data.spoons=n(data.spoons); data.plates=n(data.plates);
  data.guests = (data.guests_text||"").split(";").map(s=>s.trim()).filter(Boolean);

  const id = form.dataset.editing;
  try{
    if (id) await updateParty(id, data);
    else await createParty({ ...data, created_at: Date.now() });
    $("#party-dialog").close(); await loadParties(); renderAll(); toast("Salvo.");
  }catch{ err("Não foi possível salvar."); }
}

/* ---------- Finalizar ---------- */
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
          <label>Copos <input type="number" name="broken_cups"   min="0" value="${n(p.broken_cups)}"></label>
          <label>Garfos <input type="number" name="broken_forks"  min="0" value="${n(p.broken_forks)}"></label>
          <label>Facas <input type="number" name="broken_knives" min="0" value="${n(p.broken_knives)}"></label>
          <label>Colheres <input type="number" name="broken_spoons" min="0" value="${n(p.broken_spoons)}"></label>
          <label>Pratos <input type="number" name="broken_plates" min="0" value="${n(p.broken_plates)}"></label>
        </div>
      </fieldset>
      <menu>
        <button id="btn-finalize-cancel" type="button" class="btn">Cancelar</button>
        <button id="btn-finalize-save" class="btn primary">Salvar finalização</button>
      </menu>
    </form>
  `;
  $("#btn-finalize-cancel")?.addEventListener("click",()=> dlg.close());
  $("#btn-finalize-save")?.addEventListener("click",(e)=>{ e.preventDefault(); saveFinalizeFromForm(); });
  dlg.showModal();
}

async function saveFinalizeFromForm(){
  if (!currentFinalizeId) return;
  const f = $("#finalize-form"); const d = Object.fromEntries(new FormData(f).entries());
  const patch = {
    status: d.status,
    occurrence_notes: d.occurrence_notes||"",
    broken_cups:n(d.broken_cups), broken_forks:n(d.broken_forks), broken_knives:n(d.broken_knives),
    broken_spoons:n(d.broken_spoons), broken_plates:n(d.broken_plates),
    finalized_at: Date.now()
  };
  try{
    await updateParty(currentFinalizeId, patch);
    $("#finalize-dialog").close(); currentFinalizeId=null;
    await loadParties(); renderAll(); toast("Festa finalizada.");
  }catch{ err("Não foi possível salvar a finalização."); }
}

/* ---------- Ver & Convidados ---------- */
function openView(p){
  const el = $("#view-content"); if (!el) return;
  const guests = (p.guests||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join(" ");
  const notes = p.occurrence_notes ? esc(p.occurrence_notes) : "—";
  const brk = (p.broken_cup