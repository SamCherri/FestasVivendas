// app.js
import { firebaseConfig, APP_NAME } from "./config.js";

// Firebase direto da web (sem instalar nada)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  halls: ["Salão 1", "Salão 2", "Quiosque"],
  parties: [] // vem do Firestore
};

document.title = APP_NAME;

/* ========= Init ========= */
function init() {
  onAuthStateChanged(auth, (u) => {
    state.user = u ? { email: u.email, uid: u.uid } : null;
    toggleAuthUI();
    if (u) loadParties().then(()=>{ renderAll(); });
  });

  ensureHelpers();
  fillHallSelects();
  bindEvents();
  renderCalendar();
  startReminderLoop();
}

function ensureHelpers() {
  const style = document.createElement("style");
  style.textContent = `.center-v{display:grid;min-height:60vh;place-items:center}.action-btn{margin-right:6px}`;
  document.head.appendChild(style);
}

function fillHallSelects() {
  const selects = $$('select[name="hall"]');
  selects.forEach(sel => {
    const has = Array.from(sel.options).some(o => o.value && o.value !== "");
    if (!has) {
      state.halls.forEach(h => {
        const o = document.createElement("option");
        o.value = h; o.textContent = h;
        sel.appendChild(o);
      });
    }
  });
}

function bindEvents() {
  $("#btn-login")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#login-form [name=email]").value.trim();
    const pass  = $("#login-form [name=password]").value;
    if (!email || !pass) return err("Preencha e-mail e senha.");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Login ok.");
    } catch (e) {
      err("Falha no login. Confira e-mail e senha.");
    }
  });

  $("#btn-logout")?.addEventListener("click", async () => {
    await signOut(auth);
    toast("Saiu.");
  });

  $("#btn-new")?.addEventListener("click", () => openPartyDialog());
  $("#fab-new")?.addEventListener("click", () => openPartyDialog());

  $("#btn-report")?.addEventListener("click", () => openReport());
  $("#btn-notify")?.addEventListener("click", () => requestNotify());

  $("#btn-close-view")?.addEventListener("click", () => $("#view-dialog").close());
  $("#btn-cancel")?.addEventListener("click", () => $("#party-dialog").close());

  $("#btn-save")?.addEventListener("click", (e) => { e.preventDefault(); savePartyFromForm(); });

  // calendário
  $("#cal-prev")?.addEventListener("click", () => { shiftMonth(-1); });
  $("#cal-next")?.addEventListener("click", () => { shiftMonth(1); });

  // filtros
  $("#filters")?.addEventListener("submit", (e) => { e.preventDefault(); renderTable(); });
  $("#btn-clear-filters")?.addEventListener("click", () => { $("#filters