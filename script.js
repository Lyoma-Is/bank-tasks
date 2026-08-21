// ============================================
// Банк заданий — Firebase Realtime Database
// ============================================

const localTasks = [];

const tasksList = document.getElementById("tasksList");
const searchInput = document.getElementById("searchInput");
const taskNumberSelect = document.getElementById("taskNumberSelect");
const noResults = document.getElementById("noResults");
const btnSearch = document.getElementById("btnSearch");

let tasks = [];

const DIFFICULTY_LABELS = {
    basic: 'Базовый',
    medium: 'Средний',
    hard: 'Сложный',
    coffin: 'Гроб'
};

const DEFAULT_TYPE_NAMES = {
    1: 'Анализ информационных моделей',
    2: 'Построение таблиц и графов',
    3: 'Поиск информации в базах данных',
    5: 'Анализ алгоритмов',
    11: 'Вычисление количества информации'
};

// Кэш из Supabase (заполняется в init)
let _typeNamesCache = { ...DEFAULT_TYPE_NAMES };
let _numberMapCache = {};

function getTypeNames() {
    return { ...DEFAULT_TYPE_NAMES, ..._typeNamesCache };
}

function getTypeName(number, task) {
    const names = getTypeNames();
    const n = (typeof resolveNumber === 'function') ? resolveNumber(number) : number;
    return names[String(n)] || names[n] || names[String(number)] || names[number] || '';
}

function getNumberMap() {
    return { ..._numberMapCache };
}

function resolveNumber(num) {
    if (num == null || num === '') return num;
    const raw = String(num).trim().replace(',', '.').replace(/[–—−]/g, '-').replace(/\s+/g, '');
    // 13.1, 19-21 — не гоняем через Number (будет NaN)
    if (/^\d+\.\d+$/.test(raw) || /^\d+-\d+$/.test(raw)) {
        const map = getNumberMap();
        if (map[raw] != null) return map[raw];
        return raw;
    }
    const map = getNumberMap();
    let n = Number(raw);
    if (!Number.isFinite(n)) return raw; // не NaN
    const seen = new Set();
    while (map[String(n)] != null && !seen.has(n)) {
        seen.add(n);
        const next = Number(map[String(n)]);
        if (!Number.isFinite(next)) return map[String(n)];
        n = next;
    }
    return n;
}

function formatTaskNumber(num) {
    if (num == null || num === '') return '';
    if (typeof num === 'number' && !Number.isFinite(num)) return '';
    const s = String(num);
    if (s === 'NaN') return '';
    return s;
}

function applyNumberMapToTasks(list) {
    return list.map(t => ({
        ...t,
        number: resolveNumber(t.number)
    }));
}

async function renumberType(oldNum, newNum, newName) {
    oldNum = String(oldNum).trim();
    newNum = String(newNum).trim().replace(',', '.').replace(/[–—−]/g, '-');
    const oldN = Number(oldNum);
    const newN = Number(newNum);
    const oldOk = (/^\d+(\.\d+)?$/.test(oldNum) || /^\d+-\d+$/.test(oldNum) || (Number.isFinite(oldN) && oldN >= 1));
    const newOk = (/^\d+(\.\d+)?$/.test(newNum) || /^\d+-\d+$/.test(newNum) || (Number.isFinite(newN) && newN >= 1));
    if (!oldOk || !newOk) {
        alert('Укажите корректный номер');
        return false;
    }
    try {
        await dbRenumberTasks(oldNum, newNum);
        await dbSaveNumberMapEntry(oldNum, newNum);
        await dbMoveTypeName(oldNum, newNum, newName);
        _numberMapCache = await dbFetchNumberMap();
        _typeNamesCache = await dbFetchTypeNames();
        return true;
    } catch (e) {
        console.error(e);
        alert('Ошибка сохранения: ' + (e.message || e));
        return false;
    }
}

async function reloadTasksFromStorage() {
    try {
        _numberMapCache = await dbFetchNumberMap();
        _typeNamesCache = await dbFetchTypeNames();
        let raw = [];
        const remote = await dbFetchTasks();
        if (remote.length) {
            // убрать демо с теми же code
            const ids = new Set(remote.map(t => t.id || t.code));
            raw = raw.filter(t => !ids.has(t.id || t.code)).concat(remote);
        }
        raw = applyNumberMapToTasks(raw);
        tasks = assignFixedSeq(raw);
        updateDropdown(tasks);
        filterTasks();
    } catch (e) {
        console.error(e);
        alert('Не удалось загрузить задания');
    }
}


// Совместимость: синхронные заглушки не используются — данные через db* (async)
function getAddedTasks() { return []; }
function getDeletedCodes() { return []; }


function assignFixedSeq(list) {
    return list.map((task, index) => ({
        ...task,
        seq: index + 1
    }));
}



function updateDropdown(allTasks) {
    const numbers = [...new Set(allTasks.map(t => t.number))].sort((a, b) => {
        const na = parseFloat(String(a).replace(',', '.')) || 0;
        const nb = parseFloat(String(b).replace(',', '.')) || 0;
        if (na !== nb) return na - nb;
        return String(a).localeCompare(String(b), 'ru', { numeric: true });
    });
    const current = taskNumberSelect.value;
    const typeNames = getTypeNames();

    taskNumberSelect.innerHTML = '<option value="all">Все</option>';
    numbers.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        const name = typeNames[String(n)] || typeNames[n] || '';
        opt.textContent = name ? `${n}. ${name}` : String(n);
        taskNumberSelect.appendChild(opt);
    });

    if ([...taskNumberSelect.options].some(o => o.value === current)) {
        taskNumberSelect.value = current;
    }
}

function isHtml(str) {
    return /<\/?[a-z][\s\S]*>/i.test(str);
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

window.editTask = function (id, seq) {
    if (typeof BankAuth !== "undefined" && !BankAuth.isAdmin()) { alert("Доступно только администратору"); return; }
    const task = tasks.find(t => t.id === id)
        || tasks.find(t => t.id === id && t.seq === seq)
        || tasks.find(t => t.seq === seq);
    if (!task) {
        alert('Задание не найдено');
        return;
    }
    try {
        sessionStorage.setItem('bank_edit_task', JSON.stringify({
            id: task.id,
            code: task.code,
            number: task.number,
            text: task.text,
            answer: task.answer || '',
            answerTable: task.answerTable || null,
            answerType: task.answerType || (task.answerTable ? 'table' : 'text'),
            solution: task.solution || '',
            difficulty: task.difficulty || 'medium',
            title: task.title || '',
            codeColor: task.codeColor || 'fipi',
            subtype: task.subtype || '',
            files: task.files || [],
            typeName: task.typeName || getTypeName(task.number, task) || ''
        }));
    } catch (e) {
        console.error(e);
    }
    const exam = (typeof getExam === 'function' ? getExam() : (window.__BANK_EXAM__ || 'ege'));
    location.href = 'add.html?exam=' + exam + '&edit=' + encodeURIComponent(task.id || task.code || '');
};

window.deleteTask = async function (id, seq) {
    if (typeof BankAuth !== "undefined" && !BankAuth.isAdmin()) { alert("Доступно только администратору"); return; }
    if (!confirm("Удалить это задание?")) return;
    try {
        if (id) await dbDeleteTask(id);
        tasks = tasks.filter(t => t.id !== id);
        updateDropdown(tasks);
        filterTasks();
    } catch (e) {
        console.error(e);
        alert('Не удалось удалить: ' + (e.message || e));
    }
};

function buildAnswerTableHtml(data) {
    if (!data || !data.length) return "";

    let html = '<table class="result-answer-table"><tbody>';
    data.forEach(row => {
        html += "<tr>";
        row.forEach(cell => {
            html += `<td>${escapeHtml(cell || "")}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
}


function typesetMath(root) {
    if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
        const el = root || document.getElementById('tasksList');
        MathJax.typesetPromise(el ? [el] : undefined).catch(function (err) {
            console.warn('MathJax:', err);
        });
    }
}
window.typesetMath = typesetMath;

function renderTasks(filtered) {
    tasksList.innerHTML = "";

    if (filtered.length === 0) {
        noResults.hidden = false;
        return;
    }

    noResults.hidden = true;

    filtered.forEach(task => {
        const card = document.createElement("div");
        card.className = "task-card";

        let answerHtml = "";
        const hasTextAnswer = task.answer && task.answer.length > 0;
        const hasTableAnswer = task.answerTable && task.answerTable.length > 0;
        const hasSolution = task.solution && String(task.solution).replace(/<[^>]+>/g, '').trim().length > 0;

        if (hasTextAnswer || hasTableAnswer || hasSolution) {
            let content = "";
            if (hasSolution) {
                const solHtml = isHtml(task.solution) ? task.solution : escapeHtml(task.solution);
                content += `<div class="solution-block"><div class="solution-label">Решение</div><div class="solution-body">${solHtml}</div></div>`;
            }
            if (hasTableAnswer) {
                content += `<div class="answer-block">${buildAnswerTableHtml(task.answerTable)}</div>`;
            } else if (hasTextAnswer) {
                content += `<div class="answer-block">${escapeHtml(task.answer)}</div>`;
            }

            answerHtml = `
                <div class="task-answer">
                    <button class="btn-show-answer" onclick="(function(btn){ var box=btn.nextElementSibling; box.hidden=!box.hidden; btn.textContent=box.hidden?'Показать ответ':'Скрыть ответ'; if(!box.hidden && window.typesetMath) typesetMath(box); })(this)">
                        Показать ответ
                    </button>
                    <div class="answer-text" hidden>${content}</div>
                </div>
            `;
        }

        const diffKey = task.difficulty || 'medium';
        const diffLabel = DIFFICULTY_LABELS[diffKey] || DIFFICULTY_LABELS.medium;
        const diffHtml = `<span class="task-difficulty diff-${diffKey}">${diffLabel}</span>`;

        const codeColor = task.codeColor || 'fipi';
        const codeHtml = task.code
            ? `<span class="task-code code-${codeColor}">Номер: ${task.code}</span>`
            : "";

        const textContent = isHtml(task.text) ? task.text : escapeHtml(task.text);
        const safeId = String(task.id || "").replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="task-header">
                <div class="task-title">
                    <span class="task-seq">${formatTaskNumber(task.number)}</span>
                    <span class="task-number">№ ${task.seq}${task.title ? ` <span class="task-title-name">(${escapeHtml(task.title)})</span>` : ''}</span>
                </div>
                <div class="task-actions">
                    ${diffHtml}
                    ${codeHtml}
                    ${(typeof BankAuth !== 'undefined' && BankAuth.isAdmin()) ? `
                    <button type="button" class="btn-edit" title="Редактировать"
                        onclick="editTask('${safeId}', ${task.seq})">Изменить</button>
                    <button class="btn-delete" title="Удалить задание"
                        onclick="deleteTask('${safeId}', ${task.seq})">
                        Удалить
                    </button>` : ''}
                </div>
            </div>
            <div class="task-text">${textContent}</div>
            ${(() => {
                if (!task.files || !task.files.length) return '';
                const items = task.files.map(f => {
                    const name = escapeHtml(f.name || 'файл');
                    const url = f.dataUrl || '';
                    if (!url) return `<li>${name}</li>`;
                    const isImg = (f.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(f.name || '');
                    if (isImg) {
                        return `<li class="task-file-img"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}"></a><span>${name}</span></li>`;
                    }
                    return `<li><a href="${url}" target="_blank" rel="noopener" download="${name}">${name}</a></li>`;
                }).join('');
                return `<div class="task-files"><div class="task-files-label">Файлы</div><ul>${items}</ul></div>`;
            })()}
            ${answerHtml}
        `;
        tasksList.appendChild(card);
    });
    typesetMath(tasksList);
}

function updateSubtypeOptions(typeNumber) {
    const wrap = document.getElementById('subtypeFilterWrap');
    const sel = document.getElementById('subtypeSelect');
    if (!wrap || !sel) return;

    if (typeNumber === 'all' || typeNumber == null) {
        wrap.hidden = true;
        sel.innerHTML = '<option value="all">Все</option>';
        return;
    }

    const list = tasks.filter(t => String(t.number).replace(',', '.') === String(typeNumber).replace(',', '.'));
    const subtypes = [...new Set(list.map(t => (t.subtype || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'ru', { numeric: true })
    );

    if (!subtypes.length) {
        wrap.hidden = true;
        sel.innerHTML = '<option value="all">Все</option>';
        return;
    }

    const current = sel.value;
    sel.innerHTML = '<option value="all">Все</option>';
    subtypes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
    else sel.value = 'all';
    wrap.hidden = false;
}

function filterTasks() {
    const searchValue = searchInput.value.trim();
    const selectedNumber = taskNumberSelect.value;
    const subtypeSel = document.getElementById('subtypeSelect');
    const sortSel = document.getElementById('sortSelect');
    const diffSel = document.getElementById('difficultySelect');
    const selectedSubtype = subtypeSel ? subtypeSel.value : 'all';
    const sortMode = sortSel ? sortSel.value : 'desc';
    const selectedDiff = diffSel ? diffSel.value : 'all';

    let filtered = tasks.slice();

    if (selectedNumber !== "all") {
        filtered = filtered.filter(t => String(t.number).replace(',', '.') === String(selectedNumber).replace(',', '.'));
    }

    if (selectedSubtype && selectedSubtype !== 'all') {
        filtered = filtered.filter(t => (t.subtype || '').trim() === selectedSubtype);
    }

    if (selectedDiff && selectedDiff !== 'all') {
        filtered = filtered.filter(t => (t.difficulty || 'medium') === selectedDiff);
    }

    if (searchValue) {
        const isPureNumber = /^\d+$/.test(searchValue);

        if (isPureNumber) {
            const num = Number(searchValue);
            const exactSeq = filtered.filter(t => t.seq === num);

            if (exactSeq.length > 0) {
                filtered = exactSeq;
            } else {
                const byType = filtered.filter(t => t.number === num);
                filtered = byType.length > 0 ? byType : [];
            }
        } else {
            const q = searchValue.toLowerCase();
            filtered = filtered.filter(t => {
                const plainText = isHtml(t.text)
                    ? t.text.replace(/<[^>]+>/g, " ")
                    : t.text;
                return (
                    (t.code && t.code.toLowerCase().includes(q)) ||
                    plainText.toLowerCase().includes(q) ||
                    String(t.number).includes(q) ||
                    String(t.seq).includes(q) ||
                    (t.answer && t.answer.toLowerCase().includes(q))
                );
            });
        }
    }

    // Сортировка по порядковому № (seq)
    if (sortMode === 'asc') {
        filtered.sort((a, b) => a.seq - b.seq);
    } else if (sortMode === 'desc') {
        filtered.sort((a, b) => b.seq - a.seq);
    } else if (sortMode === 'random') {
        for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = filtered[i];
            filtered[i] = filtered[j];
            filtered[j] = tmp;
        }
    }

    renderTasks(filtered);
}

async function init() {
    tasksList.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:40px 0;">Загрузка заданий...</p>';

    try {
        if (typeof initSupabase === 'function') initSupabase();

        _numberMapCache = await dbFetchNumberMap();
        _typeNamesCache = await dbFetchTypeNames();

        let raw = [];

        const remote = await dbFetchTasks();
        if (remote && remote.length) {
            const ids = new Set(remote.map(t => t.id || t.code));
            raw = raw.filter(t => !ids.has(t.id || t.code)).concat(remote);
        }

        raw = applyNumberMapToTasks(raw);
        tasks = assignFixedSeq(raw);
        updateDropdown(tasks);
        updateSubtypeOptions(taskNumberSelect ? taskNumberSelect.value : 'all');
        filterTasks();
        setupTypeEditor();
 

        if (typeof isSupabaseReady === 'function' && isSupabaseReady()) {
            console.log('Firebase: подключено, заданий:', remote ? remote.length : 0);
        } else {
            console.warn('Firebase не настроен — localStorage fallback');
        }
    } catch (e) {
        console.error(e);
        tasksList.innerHTML = '<p style="text-align:center;color:#b91c1c;padding:40px 0;">Ошибка загрузки. Проверьте Firebase.</p>';
    }
}

// Поиск ТОЛЬКО по кнопке «Найти» или Enter
if (btnSearch) {
    btnSearch.addEventListener("click", filterTasks);
}

searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        filterTasks();
    }
});

// Выпадающий список — сразу фильтрует
taskNumberSelect.addEventListener("change", () => {
    updateSubtypeOptions(taskNumberSelect.value);
    filterTasks();
    syncTypeEditor();
});

['subtypeSelect', 'sortSelect', 'difficultySelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', filterTasks);
});

function syncTypeEditor() {
    const panel = document.getElementById('typeEditPanel');
    const numInput = document.getElementById('editTypeNumber');
    const nameInput = document.getElementById('editTypeName');
    if (!panel || !numInput || !nameInput) return;

    const val = taskNumberSelect.value;
    if (val === 'all') {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    numInput.value = val;
    nameInput.value = getTypeName(val) || '';
}

function setupTypeEditor() {
    const btn = document.getElementById('btnSaveType');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
        const oldNum = taskNumberSelect.value;
        if (oldNum === 'all') return;
        const newNum = document.getElementById('editTypeNumber').value;
        const newName = document.getElementById('editTypeName').value;
        btn.disabled = true;
        btn.textContent = 'Сохранение…';
        const ok = await renumberType(oldNum, newNum, newName);
        btn.disabled = false;
        btn.textContent = 'Сохранить';
        if (!ok) return;
        await reloadTasksFromStorage();
        if ([...taskNumberSelect.options].some(o => o.value === String(Number(newNum)))) {
            taskNumberSelect.value = String(Number(newNum));
        } else {
            taskNumberSelect.value = 'all';
        }
        filterTasks();
        syncTypeEditor();
        alert('Сохранено: все задания типа ' + oldNum + (Number(oldNum) !== Number(newNum) ? ' → ' + newNum : '') + ' обновлены');
    });
    syncTypeEditor();
}

init();
