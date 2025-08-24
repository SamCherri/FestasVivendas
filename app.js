/* App estático responsivo — sem banco; dados no localStorage */
(function () {
  'use strict';

  // ---------- Helpers ----------
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  const toast = (msg) => {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 1800);
  };

  const fmtDate = (d) => { try { if (typeof d === 'string') return d; return d.toISOString().slice(0,10); } catch { return ''; } };
  const parseTime = (str) => {
    if (!str) return null; const [h,m] = str.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null; return h * 60 + m;
  };
  const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  const loadParties = () => { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || []; } catch { return []; } };
  const saveParties = (rows) => localStorage.setItem(CONFIG.storageKey, JSON.stringify(rows));

  const getUser = () => { try { return JSON.parse(sessionStorage.getItem('vls_user')) || null; } catch { return null; } };
  const setUser = (u) => sessionStorage.setItem('vls_user', JSON.stringify(u));
  const clearUser = () => sessionStorage.removeItem('vls_user');

  const byDateThenTimeDesc = (a,b) => { if (a.date !== b.date) return a.date > b.date ? -1 : 1; return (b.start_time||'').localeCompare(a.start_time||''); };

  const overlaps = (aStart, aEnd, bStart, bEnd) => {
    const A1 = parseTime(aStart) ?? -1, A2 = parseTime(aEnd) ?? parseTime(aStart);
    const B1 = parseTime(bStart) ?? -1, B2 = parseTime(bEnd) ?? parseTime(bStart);
    return !(A2 <= B1 || B2 <= A1);
  };
  const checkConflict = (rows, cand, ignoreId=null) =>
    rows.some(r => r.id !== ignoreId &&
      r.date === cand.date &&
      r.hall.trim().toLowerCase() === cand.hall.trim().toLowerCase() &&
      overlaps(r.start_time, r.end_time, cand.start_time, cand.end_time));

  const toCSV = (rows) => {
    const headers = ['date','start_time','end_time','hall','apartment','resident_name','cups','forks','knives','spoons','plates','guests_text'];
    const esc = (s) => `"${String(s).replace(/\"/g,'\"\"')}"`;
    const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h] ?? '')).join(',')));
    return lines.join('\n');
  };

  // ---------- Elements ----------
  const loginSection = $('#login-section');
  const appSection   = $('#app-section');
  const navActions   = $('#nav-actions');
  const currentUserSpan = $('#current-user');
  const hallsDataList = $('#halls');
  const tbody = $('#tbody-parties');
  const emptyMsg = $('#empty-msg');

  const loginForm = $('#login-form');
  const filtersForm = $('#filters');
  const btnClearFilters = $('#btn-clear-filters');
  const btnNew = $('#btn-new');
  const btnExport = $('#btn-export');
  const btnExportCSV = $('#btn-export-csv');
  const fileImport = $('#file-import');
  const btnLogout = $('#btn-logout');

  const dialog = $('#party-dialog');
  const partyForm = $('#party-form');
  const dialogTitle = $('#dialog-title');

  // ---------- State ----------
  let state = { filterDate: '', filterHall: '', editingId: null };

  // ---------- Init ----------
  function init() {
    // halls
    hallsDataList.innerHTML = CONFIG.halls.map(h => `<option value="${h}">`).join('');

    // login
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const username = (fd.get('username') || '').toString().trim();
      const password = (fd.get('password') || '').toString();
      const user = CONFIG.users.find(u => u.username === username && u.password === password);
      if (!user) return toast('Usuário ou senha inválidos.');
      setUser({ username: user.username, role: user.role });
      applyAuthUI(); render(); toast('Login efetuado.');
    });

    // filters
    filtersForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(filtersForm);
      state.filterDate = (fd.get('date') || '').toString();
      state.filterHall = (fd.get('hall') || '').toString().trim().toLowerCase();
      renderTable();
    });
    btnClearFilters.addEventListener('click', () => { filtersForm.reset(); state.filterDate=''; state.filterHall=''; renderTable(); });

    // new
    btnNew.addEventListener('click', () => openDialogForCreate());

    // export JSON
    btnExport.addEventListener('click', () => {
      const rows = loadParties();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'festas-export.json'; a.click(); URL.revokeObjectURL(a.href);
    });

    // export CSV
    btnExportCSV.addEventListener('click', () => {
      const rows = loadParties();
      const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'festas-export.csv'; a.click(); URL.revokeObjectURL(a.href);
    });

    // import
    fileImport.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text); if (!Array.isArray(data)) throw new Error('JSON deve ser uma lista');
        saveParties(data); renderTable(); toast('Importação concluída.');
      } catch (err) { toast('Falha ao importar: ' + err.message); }
      finally { fileImport.value = ''; }
    });

    // logout
    btnLogout.addEventListener('click', () => { clearUser(); applyAuthUI(); toast('Sessão encerrada.'); });

    // dialog
    dialog.addEventListener('close', () => { partyForm.reset(); state.editingId = null; });
    partyForm.addEventListener('submit', (e) => e.preventDefault());
    $('#btn-save').addEventListener('click', onSaveParty);

    applyAuthUI(); render();
  }

  function applyAuthUI() {
    const user = getUser();
    const logged = !!user;
    loginSection.hidden = logged; appSection.hidden = !logged; navActions.hidden = !logged;
    if (user) currentUserSpan.textContent = `${user.username} (${user.role})`;
  }

  function render() { renderTable(); }

  function filtered(rows) {
    return rows.filter(r => {
      if (state.filterDate && r.date !== state.filterDate) return false;
      if (state.filterHall && !r.hall.toLowerCase().includes(state.filterHall)) return false;
      return true;
    }).sort(byDateThenTimeDesc);
  }

  function rowHTML(r) {
    const mats = `copos ${r.cups||0}, garfos ${r.forks||0}, facas ${r.knives||0}, colheres ${r.spoons||0}, pratos ${r.plates||0}`;
    return `
      <tr>
        <td data-label="Data">${r.date}</td>
        <td data-label="Início">${r.start_time || ''}</td>
        <td data-label="Término">${r.end_time || ''}</td>
        <td data-label="Salão">${r.hall}</td>
        <td data-label="Apto">${r.apartment}</td>
        <td data-label="Morador">${r.resident_name}</td>
        <td data-label="Materiais">${mats}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button data-act="edit" data-id="${r.id}" class="btn">Editar</button>
            <button data-act="view" data-id="${r.id}" class="btn">Ver</button>
            <button data-act="delete" data-id="${r.id}" class="btn danger">Excluir</button>
          </div>
        </td>
      </tr>`;
  }

  function renderTable() {
    const rows = filtered(loadParties());
    tbody.innerHTML = '';
    if (!rows.length) { emptyMsg.hidden = false; return; }
    emptyMsg.hidden = true;
    tbody.innerHTML = rows.map(rowHTML).join('');
    tbody.querySelectorAll('button[data-act="edit"]').forEach(b => b.addEventListener('click', () => openDialogForEdit(b.dataset.id)));
    tbody.querySelectorAll('button[data-act="view"]').forEach(b => b.addEventListener('click', () => viewParty(b.dataset.id)));
    tbody.querySelectorAll('button[data-act="delete"]').forEach(b => b.addEventListener('click', () => deleteParty(b.dataset.id)));
  }

  function openDialogForCreate() {
    $('#party-form [name="date"]').value = fmtDate(new Date());
    $('#party-form [name="start_time"]').value = '';
    dialogTitle.textContent = 'Nova Festa'; dialog.showModal();
  }

  function fillForm(p) {
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

  function openDialogForEdit(id) {
    const rows = loadParties();
    const p = rows.find(x => x.id === id); if (!p) return;
    state.editingId = id; dialogTitle.textContent = 'Editar Festa'; fillForm(p); dialog.showModal();
  }

  function viewParty(id) {
    const rows = loadParties();
    const p = rows.find(x => x.id === id); if (!p) return;
    const mats = `copos ${p.cups||0}, garfos ${p.forks||0}, facas ${p.knives||0}, colheres ${p.spoons||0}, pratos ${p.plates||0}`;
    const guests = (p.guests_text || '').trim().split(/\n+/).filter(Boolean).map(g => `• ${g}`).join('\n');
    alert(`Data: ${p.date}
Início: ${p.start_time || ''}  Término: ${p.end_time || ''}
Salão: ${p.hall}
Apto: ${p.apartment}
Morador: ${p.resident_name}
Materiais: ${mats}
Convidados:
${guests || '(não informado)'}`);
  }

  function deleteParty(id) {
    const user = getUser(); if (!user) return;
    if (CONFIG.deleteRequiresSindico && user.role !== 'sindico') return toast('Somente o síndico pode excluir.');
    if (!confirm('Confirmar exclusão?')) return;
    const rows = loadParties().filter(x => x.id !== id); saveParties(rows); renderTable(); toast('Festa removida.');
  }

  function readForm() {
    const fd = new FormData(partyForm);
    const o = {
      id: state.editingId || genId(),
      date: (fd.get('date') || '').toString(),
      start_time: (fd.get('start_time') || '').toString(),
      end_time: (fd.get('end_time') || '').toString(),
      hall: (fd.get('hall') || '').toString(),
      cups: Number(fd.get('cups') || 0),
      forks: Number(fd.get('forks') || 0),
      knives: Number(fd.get('knives') || 0),
      spoons: Number(fd.get('spoons') || 0),
      plates: Number(fd.get('plates') || 0),
      apartment: (fd.get('apartment') || '').toString(),
      resident_name: (fd.get('resident_name') || '').toString(),
      guests_text: (fd.get('guests_text') || '').toString()
    };
    if (!o.date || !o.start_time || !o.hall || !o.apartment || !o.resident_name) { toast('Preencha os campos obrigatórios.'); return null; }
    return o;
  }

  function onSaveParty() {
    const user = getUser(); if (!user) return;
    const party = readForm(); if (!party) return;

    const rows = loadParties();
    const hasConflict = checkConflict(rows, party, state.editingId);
    if (hasConflict && !confirm('Conflito de horário no mesmo salão. Deseja salvar mesmo assim?')) return;

    if (state.editingId) {
      const idx = rows.findIndex(x => x.id === state.editingId);
      if (idx >= 0) rows[idx] = party;
    } else {
      rows.push(party);
    }
    saveParties(rows); dialog.close(); renderTable(); toast('Festa salva.');
  }

  // Boot
  window.addEventListener('DOMContentLoaded', init);
})();