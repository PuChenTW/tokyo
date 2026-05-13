// Shared checklist logic for luggage.html and shopping.html
// Each page calls initChecklist(config) after loading this file.

function initChecklist({ dbName, categories, defaults, clearLabel }) {
  const DB_VER = 1;
  const STORE_NAME = 'items';
  let db;
  let items = [];

  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(dbName, DB_VER);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME))
          d.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = e => { db = e.target.result; res(); };
      r.onerror = e => rej(e.target.error);
    });
  }

  function st(mode) { return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME); }

  function dbGetAll() {
    return new Promise((res, rej) => {
      const r = st('readonly').getAll();
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    });
  }

  function dbAdd(item) {
    return new Promise((res, rej) => {
      const r = st('readwrite').add(item);
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    });
  }

  function dbPut(item) {
    return new Promise((res, rej) => {
      const r = st('readwrite').put(item);
      r.onsuccess = () => res();
      r.onerror = e => rej(e.target.error);
    });
  }

  function dbDelete(id) {
    return new Promise((res, rej) => {
      const r = st('readwrite').delete(id);
      r.onsuccess = () => res();
      r.onerror = e => rej(e.target.error);
    });
  }

  function updateProg() {
    const done = items.filter(i => i.checked).length;
    document.getElementById('prog-text').textContent = `${done} / ${items.length}`;
  }

  function sorted() {
    return [...items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      const ci = categories.indexOf(a.category) - categories.indexOf(b.category);
      if (ci !== 0) return ci;
      return a.order - b.order;
    });
  }

  async function render() {
    items = await dbGetAll();
    const list = document.getElementById('list');
    const arr = sorted();

    if (arr.length === 0) {
      list.innerHTML = '<div class="empty-msg">還沒有項目，從上方輸入後按加入 ☝</div>';
      updateProg();
      return;
    }

    list.innerHTML = '';
    arr.forEach(item => {
      const row = document.createElement('div');
      row.className = 'item-row';

      const checkBtn = document.createElement('button');
      checkBtn.className = 'check-btn';
      checkBtn.setAttribute('aria-label', `標記 ${item.name}`);
      const circle = document.createElement('div');
      circle.className = 'check-circle' + (item.checked ? ' checked' : '');
      checkBtn.appendChild(circle);
      checkBtn.addEventListener('click', () => toggleCheck(item.id));

      const badge = document.createElement('span');
      badge.className = `cat-badge cat-${item.category}`;
      badge.textContent = item.category;

      const nameEl = document.createElement('div');
      nameEl.className = 'item-name' + (item.checked ? ' done' : '');
      nameEl.textContent = item.name;

      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn edit';
      editBtn.textContent = '✏️';
      editBtn.title = '編輯';
      editBtn.addEventListener('click', () => startEdit(item, row));

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn del';
      delBtn.textContent = '🗑';
      delBtn.title = '刪除';
      delBtn.addEventListener('click', () => removeItem(item.id));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(checkBtn);
      row.appendChild(badge);
      row.appendChild(nameEl);
      row.appendChild(actions);
      list.appendChild(row);
    });

    updateProg();
  }

  function startEdit(item, row) {
    const badge = row.querySelector('.cat-badge');
    const nameEl = row.querySelector('.item-name');

    const catSelect = document.createElement('select');
    catSelect.className = 'item-edit-cat';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === item.category) opt.selected = true;
      catSelect.appendChild(opt);
    });

    const nameInput = document.createElement('input');
    nameInput.className = 'item-edit-input';
    nameInput.type = 'text';
    nameInput.value = item.name;
    nameInput.maxLength = 80;

    badge.replaceWith(catSelect);
    nameEl.replaceWith(nameInput);
    nameInput.focus();
    nameInput.select();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const newName = nameInput.value.trim();
      const newCat = catSelect.value;
      if (newName && (newName !== item.name || newCat !== item.category)) {
        item.name = newName;
        item.category = newCat;
        await dbPut(item);
      }
      render();
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement !== nameInput && document.activeElement !== catSelect)
          save();
      }, 0);
    };

    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; render(); }
    });
    catSelect.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; render(); }
    });
    nameInput.addEventListener('blur', handleBlur);
    catSelect.addEventListener('blur', handleBlur);
  }

  async function toggleCheck(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.checked = !item.checked;
    await dbPut(item);
    render();
  }

  async function removeItem(id) {
    await dbDelete(id);
    render();
  }

  async function addItem() {
    const input = document.getElementById('add-input');
    const catEl = document.getElementById('add-cat');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    await dbAdd({ name, category: catEl.value, checked: false, order: Date.now() });
    input.value = '';
    input.focus();
    render();
  }

  async function clearChecked() {
    const checked = items.filter(i => i.checked);
    if (checked.length === 0) return;
    if (!confirm(`刪除 ${checked.length} 個已${clearLabel}項目？`)) return;
    await Promise.all(checked.map(i => dbDelete(i.id)));
    render();
  }

  document.getElementById('add-btn').addEventListener('click', addItem);
  document.getElementById('add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addItem();
  });
  document.getElementById('clear-btn').addEventListener('click', clearChecked);

  openDB().then(async () => {
    if (defaults) {
      const existing = await dbGetAll();
      if (existing.length === 0) {
        let t = Date.now();
        for (const d of defaults)
          await dbAdd({ ...d, checked: false, order: t++ });
      }
    }
    render();
  });
}

function toggleNight() {
  const on = document.documentElement.toggleAttribute('data-dark');
  document.getElementById('nm-btn').textContent = on ? '☀️' : '🌙';
  localStorage.setItem('dark', on ? '1' : '');
}

(() => {
  if (localStorage.getItem('dark') === '1') {
    document.documentElement.setAttribute('data-dark', '');
    const b = document.getElementById('nm-btn');
    if (b) b.textContent = '☀️';
  }
})();

// ─── Data export / import ────────────────────────────────────────────────────

function _idbGetAll(dbName) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains('items'))
        e.target.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = e => {
      const req = e.target.result.transaction('items', 'readonly').objectStore('items').getAll();
      req.onsuccess = ev => res(ev.target.result);
      req.onerror = ev => rej(ev.target.error);
    };
    r.onerror = e => rej(e.target.error);
  });
}

function _idbReplaceAll(dbName, items) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains('items'))
        e.target.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = e => {
      const tx = e.target.result.transaction('items', 'readwrite');
      const store = tx.objectStore('items');
      store.clear();
      items.forEach(item => store.put(item));
      tx.oncomplete = () => res();
      tx.onerror = ev => rej(ev.target.error);
    };
    r.onerror = e => rej(e.target.error);
  });
}

async function _exportData() {
  const itinerary = window.__itineraryDays
    || JSON.parse(localStorage.getItem('tokyo-itinerary') || 'null');
  const [shopping, luggage] = await Promise.all([
    _idbGetAll('tokyo-shopping'),
    _idbGetAll('tokyo-luggage'),
  ]);
  const payload = { version: 1, exportedAt: new Date().toISOString() };
  if (itinerary) payload.itinerary = itinerary;
  payload.shopping = shopping;
  payload.luggage = luggage;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tokyo-trip-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function _importData(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); }
  catch { alert('匯入失敗：JSON 格式無效'); return; }
  if (typeof payload !== 'object' || payload === null) {
    alert('匯入失敗：資料格式錯誤');
    return;
  }
  if (Array.isArray(payload.itinerary))
    localStorage.setItem('tokyo-itinerary', JSON.stringify(payload.itinerary));
  if (Array.isArray(payload.shopping))
    await _idbReplaceAll('tokyo-shopping', payload.shopping);
  if (Array.isArray(payload.luggage))
    await _idbReplaceAll('tokyo-luggage', payload.luggage);
  location.reload();
}

function initDataControls() {
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) _importData(fileInput.files[0]);
    fileInput.value = '';
  });

  const exportBtn = document.createElement('button');
  exportBtn.className = 'nm-btn data-ctrl-btn';
  exportBtn.title = '匯出行程、購物、行李為 JSON';
  exportBtn.textContent = '⬇ 匯出資料';
  exportBtn.addEventListener('click', _exportData);

  const importBtn = document.createElement('button');
  importBtn.className = 'nm-btn data-ctrl-btn';
  importBtn.title = '從 JSON 檔匯入資料';
  importBtn.textContent = '⬆ 匯入資料';
  importBtn.addEventListener('click', () => fileInput.click());

  const bar = document.createElement('div');
  bar.className = 'data-ctrl-bar';
  bar.appendChild(exportBtn);
  bar.appendChild(importBtn);

  mainEl.insertBefore(bar, mainEl.firstChild);
  document.body.appendChild(fileInput);
}
