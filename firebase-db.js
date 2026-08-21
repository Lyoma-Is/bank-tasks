// Слой данных: Firebase Realtime Database + fallback localStorage

function getExam() {
  try {
    const p = new URLSearchParams(location.search).get('exam');
    if (p === 'oge' || p === 'ege') {
      sessionStorage.setItem('bank_exam', p);
      return p;
    }
  } catch (e) {}
  try {
    const s = sessionStorage.getItem('bank_exam');
    if (s === 'oge' || s === 'ege') return s;
  } catch (e) {}
  return 'ege';
}

function examPrefix() {
  return getExam(); // oge | ege
}

function lsKey(base) {
  return base + '_' + getExam();
}

const LS = {
  get tasks() { return lsKey('bank_added_tasks'); },
  get deleted() { return lsKey('bank_deleted_codes'); },
  get typeNames() { return lsKey('bank_type_names'); },
  get numberMap() { return lsKey('bank_number_map'); },
  get deletedSeqs() { return lsKey('bank_deleted_seqs'); }
};

function makeId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}


function normalizeTaskNumber(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && !Number.isFinite(v)) return '';
  let s = String(v).trim().replace(',', '.').replace(/[–—−]/g, '-').replace(/\s+/g, '');
  if (!s || s === 'NaN') return '';
  // диапазон 19-21 или дробный 13.1 — строка
  if (/^\d+\.\d+$/.test(s) || /^\d+-\d+$/.test(s)) return s;
  // целое — число (без NaN)
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return s;
}

function rowToTask(key, row) {
  if (!row) return null;
  return {
    id: row.id || key,
    seq: row.seq != null ? Number(row.seq) : null,
    code: row.code || '',
    number: normalizeTaskNumber(row.number),
    title: row.title || '',
    codeColor: row.codeColor || 'fipi',
    subtype: row.subtype || '',
    difficulty: row.difficulty || 'medium',
    text: row.text || '',
    files: row.files || [],
    answer: row.answer || '',
    answerTable: row.answerTable || row.answer_table || null,
    answerType: row.answerType || row.answer_type || 'text',
    solution: row.solution || '',
    addedAt: row.addedAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null
  };
}

function taskToRow(task) {
  return {
    id: task.id || makeId(),
    seq: task.seq != null ? Number(task.seq) : null,
    code: task.code || '',
    number: normalizeTaskNumber(task.number),
    title: task.title || '',
    codeColor: task.codeColor || 'fipi',
    subtype: task.subtype || '',
    difficulty: task.difficulty || 'medium',
    text: task.text || '',
    files: task.files || [],
    answer: task.answer || '',
    answerTable: task.answerTable || null,
    answerType: task.answerType || 'text',
    solution: task.solution || '',
    addedAt: task.addedAt || task.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function safeIdKey(id) {
  // Firebase keys cannot contain . # $ [ ]
  return String(id || makeId()).replace(/[.#$\[\]]/g, '_');
}

// ---------- tasks ----------
async function dbFetchTasks() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/tasks').once('value');
    const val = snap.val() || {};
    return Object.keys(val).map(k => rowToTask(k, val[k]));
  }
  try {
    return JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  } catch {
    return [];
  }
}

async function dbUpsertTask(task) {
  const db = getFirebaseDb();
  if (!task.id) task.id = makeId();
  const row = taskToRow(task);
  row.id = task.id;
  if (db) {
    const key = safeIdKey(task.id);
    await db.ref(examPrefix() + '/tasks/' + key).set(row);
    return task.id;
  }
  const list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  const idx = list.findIndex(t => t.id === task.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...task };
  else list.push(task);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return task.id;
}

async function dbDeleteTask(id) {
  const db = getFirebaseDb();
  if (db) {
    await db.ref(examPrefix() + '/tasks/' + safeIdKey(id)).remove();
    return true;
  }
  let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  list = list.filter(t => t.id !== id && t.code !== id);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return true;
}

async function dbDeleteAllUserTasks() {
  const db = getFirebaseDb();
  if (db) {
    await db.ref(examPrefix() + '/tasks').remove();
    return true;
  }
  localStorage.removeItem(LS.tasks);
  return true;
}

async function dbRenumberTasks(oldNum, newNum) {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/tasks').once('value');
    const val = snap.val() || {};
    const updates = {};
    Object.keys(val).forEach(k => {
      if (String(val[k].number) === String(oldNum) || Number(val[k].number) === Number(oldNum)) {
        const nn = normalizeTaskNumber(newNum);
        if (nn === '' || (typeof nn === 'number' && !Number.isFinite(nn))) return;
        updates[examPrefix() + '/tasks/' + k + '/number'] = nn;
        updates[examPrefix() + '/tasks/' + k + '/updatedAt'] = new Date().toISOString();
      }
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
    return true;
  }
  let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  list = list.map(t => (String(t.number) === String(oldNum) || Number(t.number) === Number(oldNum)) ? { ...t, number: normalizeTaskNumber(newNum) } : t);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return true;
}

// ---------- type names ----------
async function dbFetchTypeNames() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/type_names').once('value');
    const val = snap.val() || {};
    const map = {};
    Object.keys(val).forEach(k => {
      map[String(k)] = typeof val[k] === 'string' ? val[k] : (val[k].name || '');
    });
    return map;
  }
  try {
    return JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
  } catch {
    return {};
  }
}

async function dbSaveTypeName(number, name) {
  const db = getFirebaseDb();
  const n = String(number);
  if (db) {
    if (name && String(name).trim()) {
      await db.ref(examPrefix() + '/type_names/' + n).set(String(name).trim());
    } else {
      await db.ref(examPrefix() + '/type_names/' + n).remove();
    }
    return true;
  }
  const names = JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
  if (name && String(name).trim()) names[n] = String(name).trim();
  else delete names[n];
  localStorage.setItem(LS.typeNames, JSON.stringify(names));
  return true;
}

async function dbMoveTypeName(oldNum, newNum, newName) {
  const db = getFirebaseDb();
  const o = String(oldNum);
  const n = String(newNum);
  if (db) {
    let name = newName;
    if (name == null || !String(name).trim()) {
      const snap = await db.ref(examPrefix() + '/type_names/' + o).once('value');
      name = snap.val() || '';
      if (name && typeof name === 'object') name = name.name || '';
    }
    if (o !== n) await db.ref(examPrefix() + '/type_names/' + o).remove();
    if (name && String(name).trim()) {
      await db.ref(examPrefix() + '/type_names/' + n).set(String(name).trim());
    }
    return true;
  }
  const names = JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
  const oldName = names[o] || '';
  if (o !== n) delete names[o];
  const finalName = (newName != null && String(newName).trim()) ? String(newName).trim() : oldName;
  if (finalName) names[n] = finalName;
  localStorage.setItem(LS.typeNames, JSON.stringify(names));
  return true;
}

// ---------- number map ----------
async function dbFetchNumberMap() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/number_map').once('value');
    const val = snap.val() || {};
    const map = {};
    Object.keys(val).forEach(k => { map[String(k)] = Number(val[k]); });
    return map;
  }
  try {
    return JSON.parse(localStorage.getItem(LS.numberMap) || '{}');
  } catch {
    return {};
  }
}

async function dbSaveNumberMapEntry(oldNum, newNum) {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/number_map').once('value');
    const val = snap.val() || {};
    const updates = {};
    Object.keys(val).forEach(k => {
      if (Number(val[k]) === Number(oldNum)) {
        updates[examPrefix() + '/number_map/' + k] = Number(newNum);
      }
    });
    if (Number(oldNum) !== Number(newNum)) {
      updates[examPrefix() + '/number_map/' + String(oldNum)] = Number(newNum);
    }
    if (Object.keys(updates).length) await db.ref().update(updates);
    return true;
  }
  const map = JSON.parse(localStorage.getItem(LS.numberMap) || '{}');
  Object.keys(map).forEach(k => {
    if (Number(map[k]) === Number(oldNum)) map[k] = Number(newNum);
  });
  if (Number(oldNum) !== Number(newNum)) map[String(oldNum)] = Number(newNum);
  localStorage.setItem(LS.numberMap, JSON.stringify(map));
  return true;
}

async function dbCountTasks() {
  const list = await dbFetchTasks();
  return list.length;
}


// ---------- deleted sequential numbers ----------
async function dbFetchDeletedSeqs() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref(examPrefix() + '/deleted_seqs').once('value');
    const val = snap.val();
    if (Array.isArray(val)) return val.map(Number).filter(n => Number.isFinite(n));
    if (val && typeof val === 'object') return Object.keys(val).map(Number).filter(n => Number.isFinite(n) && val[String(n)]);
    return [];
  }
  try {
    return JSON.parse(localStorage.getItem(LS.deletedSeqs || lsKey('bank_deleted_seqs')) || '[]');
  } catch {
    return [];
  }
}

async function dbAddDeletedSeq(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) return;
  const db = getFirebaseDb();
  if (db) {
    await db.ref(examPrefix() + '/deleted_seqs/' + n).set(true);
    return true;
  }
  const key = lsKey('bank_deleted_seqs');
  let list = [];
  try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  if (!list.includes(n)) list.push(n);
  list.sort((a,b)=>a-b);
  localStorage.setItem(key, JSON.stringify(list));
  return true;
}
