// Слой данных: Firebase Realtime Database + fallback localStorage

const LS = {
  tasks: 'bank_added_tasks',
  deleted: 'bank_deleted_codes',
  typeNames: 'bank_type_names',
  numberMap: 'bank_number_map'
};

function rowToTask(code, row) {
  if (!row) return null;
  return {
    code: code || row.code,
    number: Number(row.number),
    title: row.title || '',
    difficulty: row.difficulty || 'medium',
    text: row.text || '',
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
    code: task.code,
    number: Number(task.number),
    title: task.title || '',
    difficulty: task.difficulty || 'medium',
    text: task.text || '',
    answer: task.answer || '',
    answerTable: task.answerTable || null,
    answerType: task.answerType || 'text',
    solution: task.solution || '',
    addedAt: task.addedAt || task.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function safeCodeKey(code) {
  // Firebase keys cannot contain . # $ [ ]
  return String(code).replace(/[.#$\[\]]/g, '_');
}

// ---------- tasks ----------
async function dbFetchTasks() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref('tasks').once('value');
    const val = snap.val() || {};
    return Object.keys(val).map(k => rowToTask(val[k].code || k, val[k]));
  }
  try {
    return JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  } catch {
    return [];
  }
}

async function dbUpsertTask(task) {
  const db = getFirebaseDb();
  const row = taskToRow(task);
  if (db) {
    const key = safeCodeKey(task.code);
    await db.ref('tasks/' + key).set(row);
    return true;
  }
  const list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  const idx = list.findIndex(t => t.code === task.code);
  if (idx >= 0) list[idx] = { ...list[idx], ...task };
  else list.push(task);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return true;
}

async function dbDeleteTask(code) {
  const db = getFirebaseDb();
  if (db) {
    await db.ref('tasks/' + safeCodeKey(code)).remove();
    return true;
  }
  let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  list = list.filter(t => t.code !== code);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return true;
}

async function dbDeleteAllUserTasks() {
  const db = getFirebaseDb();
  if (db) {
    await db.ref('tasks').remove();
    return true;
  }
  localStorage.removeItem(LS.tasks);
  return true;
}

async function dbRenumberTasks(oldNum, newNum) {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref('tasks').once('value');
    const val = snap.val() || {};
    const updates = {};
    Object.keys(val).forEach(k => {
      if (Number(val[k].number) === Number(oldNum)) {
        updates['tasks/' + k + '/number'] = Number(newNum);
        updates['tasks/' + k + '/updatedAt'] = new Date().toISOString();
      }
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
    return true;
  }
  let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
  list = list.map(t => Number(t.number) === Number(oldNum) ? { ...t, number: newNum } : t);
  localStorage.setItem(LS.tasks, JSON.stringify(list));
  return true;
}

// ---------- type names ----------
async function dbFetchTypeNames() {
  const db = getFirebaseDb();
  if (db) {
    const snap = await db.ref('type_names').once('value');
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
      await db.ref('type_names/' + n).set(String(name).trim());
    } else {
      await db.ref('type_names/' + n).remove();
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
      const snap = await db.ref('type_names/' + o).once('value');
      name = snap.val() || '';
      if (name && typeof name === 'object') name = name.name || '';
    }
    if (o !== n) await db.ref('type_names/' + o).remove();
    if (name && String(name).trim()) {
      await db.ref('type_names/' + n).set(String(name).trim());
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
    const snap = await db.ref('number_map').once('value');
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
    const snap = await db.ref('number_map').once('value');
    const val = snap.val() || {};
    const updates = {};
    Object.keys(val).forEach(k => {
      if (Number(val[k]) === Number(oldNum)) {
        updates['number_map/' + k] = Number(newNum);
      }
    });
    if (Number(oldNum) !== Number(newNum)) {
      updates['number_map/' + String(oldNum)] = Number(newNum);
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
