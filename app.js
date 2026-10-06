// Налоговый календарь клиентов — дашборд сроков по данным data/data.js.
// Выполненные задачи хранятся в localStorage поверх данных.
(function () {
  'use strict';
  const DATA = window.TAX_DATA;
  const MONTHS_RU = ['сентябрь','октябрь','ноябрь','декабрь','январь','февраль','март','апрель','май','июнь','июль','август'];
  const MONTH_OF = { '09':0,'10':1,'11':2,'12':3,'01':4,'02':5,'03':6,'04':7,'05':8,'06':9,'07':10,'08':11 };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmtToday = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('today').textContent = fmtToday;

  const doneKey = t => `${t.client}|${t.monthKey}|${t.idx}|${t.raw}`;
  let done = {};
  try { done = JSON.parse(localStorage.getItem('taxcal-done') || '{}'); } catch (e) { done = {}; }
  const isDone = t => t.status === 'выполнено' || !!done[doneKey(t)];

  const tasks = DATA.tasks.map(t => ({
    ...t, text: t.text || t.raw, done: isDone(t),
    isDate: /\d{2}\.\d{2}/.test(t.text), dateISO: t.date,
  })).sort((a, b) => (a.dateISO || '9999').localeCompare(b.dateISO || '9999'));

  // ————————————————— состояние фильтров
  const state = { view: 'list', client: '', regime: '', status: 'active', q: '' };
  const $ = id => document.getElementById(id);
  const $client = $('f-client'), $regime = $('f-regime'), $status = $('f-status'), $search = $('f-search');

  for (const c of DATA.clients) $client.add(new Option(c.name, c.name));
  [...new Set(DATA.clients.map(c => c.regime))].sort().forEach(r => $regime.add(new Option(r, r)));

  // ————————————————— плитки
  function renderTiles(list) {
    const active = list.filter(t => !t.done);
    const overdue = active.filter(t => t.dateISO && t.dateISO < iso(today));
    const soon = active.filter(t => t.dateISO && diffDays(t.dateISO) >= 0 && diffDays(t.dateISO) <= 7);
    const doneCnt = list.length - active.length;
    $('tiles').innerHTML = [
      tile(overdue.length, 'просрочено', 'crit'),
      tile(soon.length, 'в ближайшие 7 дней', 'warn'),
      tile(active.length - overdue.length - soon.length, 'всего активных', ''),
      tile(doneCnt, 'выполнено', 'done'),
    ].join('');
  }
  const tile = (n, label, cls) =>
    `<div class="tile ${cls}"><b>${n}</b><span>${label}</span></div>`;

  // ————————————————— вид «По датам»
  function renderList(list) {
    const groups = {};
    for (const t of list.filter(t => t.isDate)) {
      (groups[t.dateISO] = groups[t.dateISO] || []).push(t);
    }
    let html = '';
    // повторяющиеся каждый месяц (без конкретной даты) — сливаем в одну карточку
    const recurring = new Map();
    for (const t of list.filter(t => !t.isDate)) {
      const k = t.client + '|' + t.text;
      if (!recurring.has(k)) recurring.set(k, { ...t, months: [] });
      recurring.get(k).months.push(t.monthKey);
    }
    if (recurring.size) {
      html += `<div class="day-head">Каждый месяц<small>без конкретной даты</small></div>` +
        [...recurring.values()].map(t => cardRecurring(t)).join('');
    }
    for (const [date, ts] of Object.entries(groups)) {
      const d = new Date(date + 'T00:00:00');
      const dd = diffDays(date);
      const cls = dd < 0 ? 'crit' : dd <= 7 ? 'warn' : '';
      const chip = cls ? `<span class="day-chip ${cls}">${dd < 0 ? 'просрочено' : dd === 0 ? 'сегодня' : 'через ' + declDays(dd)}</span>` : '';
      const label = d.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric', year: 'numeric' });
      html += `<div class="day-group"><div class="day-head ${dd < 0 ? 'overdue' : ''}">${label} ${chip}</div>${ts.map(card).join('')}</div>`;
    }
    $('content').innerHTML = html || `<div class="empty">Ничего не найдено — измените фильтры</div>`;

    function cardRecurring(t) {
      return `<div class="card" data-cl="${esc(t.client)}" data-txt="${esc(t.text)}">
        <input type="checkbox" class="check" ${t.done ? 'checked' : ''} aria-label="Отметить выполнено">
        <div class="text">${esc(t.text)}${t.note ? `<span class="when"><br>${esc(t.note)}</span>` : ''}</div>
        <div class="chips">${t.done ? '<span class="chip status-done">✓ выполнено</span>' : ''}<span class="chip">ежемесячно ×${t.months.length}</span><span class="chip">${esc(t.client)}</span><span class="chip">${esc(t.regime)}</span></div>
      </div>`;
    }
    function card(t) {
      const dd = diffDays(t.dateISO);
      const stCls = t.done ? 'status-done' : dd < 0 ? 'status-crit' : dd <= 7 ? 'status-warn' : '';
      const stTxt = t.done ? '<span class="chip status-done">✓ выполнено</span>'
        : dd < 0 ? `<span class="chip status-crit">⚠ просрочено ${Math.abs(dd)} ${declDays(Math.abs(dd))}</span>`
        : dd <= 7 ? `<span class="chip status-warn">⏳ через ${declDays(dd)}</span>` : '';
      return `<div class="card ${t.done ? 'done' : ''}" data-key="${doneKey(t)}">
        <input type="checkbox" class="check" ${t.done ? 'checked' : ''} aria-label="Отметить выполнено">
        <div class="text">${esc(t.text)}${t.note ? `<span class="when"><br>${esc(t.note)}</span>` : ''}</div>
        <div class="chips">${stTxt}<span class="chip">${esc(t.client)}</span><span class="chip">${esc(t.regime)}</span></div>
      </div>`;
    }
  }

  // ————————————————— вид «По месяцам»
  function renderMatrix(list) {
    const monthKeys = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08'];
    let html = `<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Клиент</th>` +
      monthKeys.map((k, i) => `<th>${MONTHS_RU[i]}<br><small>${k.slice(0, 4)}</small></th>`).join('') +
      `</tr></thead><tbody>`;
    for (const c of DATA.clients.filter(c => list.some(t => t.client === c.name))) {
      html += `<tr><td class="client">${esc(c.name)}<small>${esc(c.regime)}</small></td>`;
      for (const k of monthKeys) {
        const ts = list.filter(t => t.client === c.name && t.monthKey === k);
        html += `<td>` + ts.map(t => {
          const dd = diffDays(t.dateISO);
          const cls = t.done ? 'status-done' : dd < 0 ? 'status-crit' : dd <= 7 ? 'status-warn' : '';
          return `<span class="chip ${cls} cell-chip">${esc(t.text)}</span>`;
        }).join('') + `</td>`;
      }
      html += `</tr>`;
    }
    $('content').innerHTML = html + `</tbody></table></div>`;
  }

  // ————————————————— фильтрация
  function filtered() {
    return tasks.filter(t =>
      (!state.client || t.client === state.client) &&
      (!state.regime || t.regime === state.regime) &&
      (state.status === '' || (state.status === 'done' ? t.done : !t.done)) &&
      (!state.q || (t.text + ' ' + t.client + ' ' + t.regime).toLowerCase().includes(state.q.toLowerCase()))
    );
  }

  function render() {
    const list = filtered();
    renderTiles(list);
    if (state.view === 'list') renderList(list); else renderMatrix(list);
  }

  // ————————————————— события
  document.querySelectorAll('.view-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn); });
      state.view = btn.dataset.view; render();
    }));
  $client.onchange = () => { state.client = $client.value; render(); };
  $regime.onchange = () => { state.regime = $regime.value; render(); };
  $status.onchange = () => { state.status = $status.value; render(); };
  $search.oninput = () => { state.q = $search.value; render(); };
  $('content').addEventListener('click', e => {
    const check = e.target.closest('.check');
    if (!check) return;
    const cardEl = check.closest('.card');
    if (cardEl.dataset.cl) {
      // ежемесячная задача: отмечаем все её месяцы
      for (const t of tasks.filter(x => !x.isDate && x.client === cardEl.dataset.cl && x.text === cardEl.dataset.txt)) {
        if (check.checked) done[doneKey(t)] = true; else delete done[doneKey(t)];
      }
    } else {
      const key = cardEl.dataset.key;
      if (check.checked) done[key] = true; else delete done[key];
    }
    for (const t of tasks) t.done = isDone(t);
    try { localStorage.setItem('taxcal-done', JSON.stringify(done)); } catch (err) { /* режим приватного окна — отметка не сохранится */ }
    render();
  });

  // ————————————————— утилиты
  function iso(d) { return d.toISOString().slice(0, 10); }
  function diffDays(dateISO) {
    if (!dateISO) return 9999;
    return Math.round((new Date(dateISO + 'T00:00:00') - today) / 86400000);
  }
  function declDays(n) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return 'дней';
    if (n1 === 1) return 'день';
    if (n1 >= 2 && n1 <= 4) return 'дня';
    return 'дней';
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replaceAll('"', '&quot;'); }

  render();
})();