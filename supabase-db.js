// Слой данных: Supabase с fallback на localStorage

const LS = {
    tasks: 'bank_added_tasks',
    deleted: 'bank_deleted_codes',
    typeNames: 'bank_type_names',
    numberMap: 'bank_number_map'
};

function rowToTask(row) {
    if (!row) return null;
    return {
        code: row.code,
        number: Number(row.number),
        title: row.title || '',
        difficulty: row.difficulty || 'medium',
        text: row.text || '',
        answer: row.answer || '',
        answerTable: row.answer_table || null,
        answerType: row.answer_type || 'text',
        solution: row.solution || '',
        addedAt: row.created_at || null,
        updatedAt: row.updated_at || null
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
        answer_table: task.answerTable || task.answer_table || null,
        answer_type: task.answerType || task.answer_type || 'text',
        solution: task.solution || '',
        updated_at: new Date().toISOString()
    };
}

// ---------- tasks ----------
async function dbFetchTasks() {
    const sb = getSupabase();
    if (sb) {
        const { data, error } = await sb.from('tasks').select('*').order('number').order('created_at');
        if (error) {
            console.error('dbFetchTasks', error);
            throw error;
        }
        return (data || []).map(rowToTask);
    }
    try {
        return JSON.parse(localStorage.getItem(LS.tasks) || '[]');
    } catch {
        return [];
    }
}

async function dbUpsertTask(task) {
    const sb = getSupabase();
    const row = taskToRow(task);
    if (sb) {
        if (!row.created_at && task.addedAt) row.created_at = task.addedAt;
        const { error } = await sb.from('tasks').upsert(row, { onConflict: 'code' });
        if (error) {
            console.error('dbUpsertTask', error);
            throw error;
        }
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
    const sb = getSupabase();
    if (sb) {
        const { error } = await sb.from('tasks').delete().eq('code', code);
        if (error) {
            console.error('dbDeleteTask', error);
            throw error;
        }
        return true;
    }
    let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
    list = list.filter(t => t.code !== code);
    localStorage.setItem(LS.tasks, JSON.stringify(list));
    let deleted = JSON.parse(localStorage.getItem(LS.deleted) || '[]');
    if (code && !deleted.includes(code)) {
        deleted.push(code);
        localStorage.setItem(LS.deleted, JSON.stringify(deleted));
    }
    return true;
}

async function dbDeleteAllUserTasks() {
    const sb = getSupabase();
    if (sb) {
        const { error } = await sb.from('tasks').delete().neq('code', '');
        if (error) throw error;
        return true;
    }
    localStorage.removeItem(LS.tasks);
    return true;
}

async function dbRenumberTasks(oldNum, newNum) {
    const sb = getSupabase();
    if (sb) {
        const { error } = await sb.from('tasks').update({ number: newNum, updated_at: new Date().toISOString() }).eq('number', oldNum);
        if (error) throw error;
        return true;
    }
    let list = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
    list = list.map(t => Number(t.number) === Number(oldNum) ? { ...t, number: newNum } : t);
    localStorage.setItem(LS.tasks, JSON.stringify(list));
    return true;
}

// ---------- type names ----------
async function dbFetchTypeNames() {
    const sb = getSupabase();
    if (sb) {
        const { data, error } = await sb.from('type_names').select('*');
        if (error) {
            console.error('dbFetchTypeNames', error);
            return {};
        }
        const map = {};
        (data || []).forEach(r => { map[String(r.number)] = r.name; });
        return map;
    }
    try {
        return JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
    } catch {
        return {};
    }
}

async function dbSaveTypeName(number, name) {
    const sb = getSupabase();
    const n = Number(number);
    if (sb) {
        if (name && String(name).trim()) {
            const { error } = await sb.from('type_names').upsert({ number: n, name: String(name).trim() }, { onConflict: 'number' });
            if (error) throw error;
        } else {
            await sb.from('type_names').delete().eq('number', n);
        }
        return true;
    }
    const names = JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
    if (name && String(name).trim()) names[String(n)] = String(name).trim();
    else delete names[String(n)];
    localStorage.setItem(LS.typeNames, JSON.stringify(names));
    return true;
}

async function dbMoveTypeName(oldNum, newNum, newName) {
    const sb = getSupabase();
    const o = Number(oldNum);
    const n = Number(newNum);
    if (sb) {
        // получить старое имя
        let name = newName;
        if (name == null || !String(name).trim()) {
            const { data } = await sb.from('type_names').select('name').eq('number', o).maybeSingle();
            name = data ? data.name : '';
        }
        if (o !== n) {
            await sb.from('type_names').delete().eq('number', o);
        }
        if (name && String(name).trim()) {
            await sb.from('type_names').upsert({ number: n, name: String(name).trim() }, { onConflict: 'number' });
        }
        return true;
    }
    const names = JSON.parse(localStorage.getItem(LS.typeNames) || '{}');
    const oldName = names[String(o)] || '';
    if (o !== n) delete names[String(o)];
    const finalName = (newName != null && String(newName).trim()) ? String(newName).trim() : oldName;
    if (finalName) names[String(n)] = finalName;
    localStorage.setItem(LS.typeNames, JSON.stringify(names));
    return true;
}

// ---------- number map ----------
async function dbFetchNumberMap() {
    const sb = getSupabase();
    if (sb) {
        const { data, error } = await sb.from('number_map').select('*');
        if (error) {
            console.error('dbFetchNumberMap', error);
            return {};
        }
        const map = {};
        (data || []).forEach(r => { map[String(r.old_number)] = r.new_number; });
        return map;
    }
    try {
        return JSON.parse(localStorage.getItem(LS.numberMap) || '{}');
    } catch {
        return {};
    }
}

async function dbSaveNumberMapEntry(oldNum, newNum) {
    const sb = getSupabase();
    if (sb) {
        // обновить существующие ссылки
        const { data: all } = await sb.from('number_map').select('*');
        for (const row of (all || [])) {
            if (Number(row.new_number) === Number(oldNum)) {
                await sb.from('number_map').update({ new_number: Number(newNum) }).eq('old_number', row.old_number);
            }
        }
        if (Number(oldNum) !== Number(newNum)) {
            await sb.from('number_map').upsert({
                old_number: Number(oldNum),
                new_number: Number(newNum)
            }, { onConflict: 'old_number' });
        }
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
