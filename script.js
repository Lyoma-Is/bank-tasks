// ============================================
// Google Sheets (опционально) + Supabase
// ============================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/ВАШ_SHEET_ID/export?format=csv&gid=0";
const USE_LOCAL_DATA = true;
// Данные: Firebase Realtime Database (firebase-config.js, firebase-db.js)

const localTasks = [
    { code: "301FE5", number: 1,  text: "Решите уравнение: 2x + 5 = 17", answer: "x = 6" },
    { code: "A12B3C", number: 1,  text: "Найдите корень уравнения: 3x − 9 = 0", answer: "x = 3" },
    { code: "7K9M2P", number: 1,  text: "Решите уравнение: 5(x − 2) = 15", answer: "x = 5" },
    { code: "Q4R8T1", number: 1,  text: "Найдите значение x: x/4 + 3 = 7", answer: "x = 16" },

    { code: "B2C4D6", number: 11, text: "Упростите выражение: (a + b)² − (a − b)²", answer: "4ab" },
    { code: "E8F0G2", number: 11, text: "Раскройте скобки: 3(x − 4) + 2(x + 1)", answer: "5x − 10" },
    { code: "H3J5K7", number: 11, text: "Приведите подобные: 5x − 3y + 2x + 7y", answer: "7x + 4y" },

    { code: "L9M1N3", number: 2,  text: "Найдите площадь прямоугольника со сторонами 8 см и 5 см", answer: "40 см²" },
    { code: "P5Q7R9", number: 2,  text: "Вычислите площадь треугольника с основанием 10 и высотой 6", answer: "30" },
    { code: "S2T4U6", number: 2,  text: "Найдите периметр квадрата со стороной 12 см", answer: "48 см" },

    { code: "V8W0X2", number: 3,  text: "Решите систему уравнений: { x + y = 10; x − y = 2 }", answer: "x = 6, y = 4" },
    { code: "Y4Z6A8", number: 3,  text: "Решите систему: { 2x + y = 7; x − y = 2 }", answer: "x = 3, y = 1" },

    { code: "C1D3E5", number: 5,  text: "Найдите производную функции f(x) = x³ − 4x + 1", answer: "3x² − 4" },
    { code: "F7G9H1", number: 5,  text: "Вычислите производную: f(x) = sin(x) + cos(2x)", answer: "cos(x) − 2sin(2x)" },
    { code: "J3K5L7", number: 5,  text: "Найдите f'(x), если f(x) = eˣ · x²", answer: "eˣ(x² + 2x)" },
];

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
    const map = getNumberMap();
    let n = Number(num);
    const seen = new Set();
    while (map[String(n)] != null && !seen.has(n)) {
        seen.add(n);
        n = Number(map[String(n)]);
    }
    return n;
}

function applyNumberMapToTasks(list) {
    return list.map(t => ({
        ...t,
        number: resolveNumber(t.number)
    }));
}

async function renumberType(oldNum, newNum, newName) {
    oldNum = Number(oldNum);
    newNum = Number(newNum);
    if (!oldNum || !newNum || newNum < 1) {
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
        let raw = USE_LOCAL_DATA ? [...localTasks] : [];
        const remote = await dbFetchTasks();
        if (remote.length) {
            // убрать демо с теми же code
            const codes = new Set(remote.map(t => t.code));
            raw = raw.filter(t => !codes.has(t.code)).concat(remote);
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


function parseCSV(text) {
    const rows = [];
    let current = "";
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                current += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ",") {
                row.push(current.trim());
                current = "";
            } else if (char === "\n" || char === "\r") {
                if (current || row.length) {
                    row.push(current.trim());
                    rows.push(row);
                    row = [];
                    current = "";
                }
                if (char === "\r" && next === "\n") i++;
            } else {
                current += char;
            }
        }
    }
    if (current || row.length) {
        row.push(current.trim());
        rows.push(row);
    }
    return rows;
}

async function loadTasksFromSheet() {
    try {
        const response = await fetch(SHEET_CSV_URL + "&_t=" + Date.now());
        if (!response.ok) throw new Error("Ошибка загрузки: " + response.status);

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length < 2) throw new Error("Таблица пуста или неверный формат");

        const headers = rows[0].map(h => h.toLowerCase().trim());
        const codeIdx   = headers.indexOf("code");
        const numberIdx = headers.indexOf("number");
        const textIdx   = headers.indexOf("text");
        const answerIdx = headers.indexOf("answer");

        if (numberIdx === -1 || textIdx === -1) {
            throw new Error("В таблице должны быть колонки: number и text");
        }

        const loaded = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row[textIdx]) continue;

            loaded.push({
                code:   codeIdx >= 0 ? (row[codeIdx] || "") : "",
                number: Number(row[numberIdx]) || 0,
                text:   row[textIdx] || "",
                answer: answerIdx >= 0 ? (row[answerIdx] || "") : ""
            });
        }
        return loaded;
    } catch (err) {
        console.error("Не удалось загрузить Google Sheets:", err);
        alert("Не удалось загрузить задания из Google Таблицы.\nИспользуются локальные данные.");
        return localTasks;
    }
}

function assignFixedSeq(list) {
    return list.map((task, index) => ({
        ...task,
        seq: index + 1
    }));
}

function updateDropdown(allTasks) {
    const numbers = [...new Set(allTasks.map(t => t.number))].sort((a, b) => a - b);
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

window.editTask = function (code, seq) {
    const task = tasks.find(t => t.code === code && t.seq === seq)
        || tasks.find(t => t.code === code)
        || tasks.find(t => t.seq === seq);
    if (!task) {
        alert('Задание не найдено');
        return;
    }
    try {
        sessionStorage.setItem('bank_edit_task', JSON.stringify({
            code: task.code,
            number: task.number,
            text: task.text,
            answer: task.answer || '',
            answerTable: task.answerTable || null,
            answerType: task.answerType || (task.answerTable ? 'table' : 'text'),
            solution: task.solution || '',
            difficulty: task.difficulty || 'medium',
            title: task.title || '',
            typeName: task.typeName || getTypeName(task.number, task) || ''
        }));
    } catch (e) {
        console.error(e);
    }
    location.href = 'add.html?edit=' + encodeURIComponent(task.code || '');
};

window.deleteTask = async function (code, seq) {
    if (!confirm("Удалить это задание?")) return;
    try {
        if (code) await dbDeleteTask(code);
        tasks = tasks.filter(t => !(t.code === code && t.seq === seq));
        // если это было только демо — убрать из списка
        tasks = tasks.filter(t => !(t.code === code));
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
                content += `<div class="answer-block"><strong>Ответ:</strong> ${buildAnswerTableHtml(task.answerTable)}</div>`;
            } else if (hasTextAnswer) {
                content += `<div class="answer-block"><strong>Ответ:</strong> ${escapeHtml(task.answer)}</div>`;
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

        const codeHtml = task.code
            ? `<span class="task-code">Номер: ${task.code}</span>`
            : "";

        const textContent = isHtml(task.text) ? task.text : escapeHtml(task.text);
        const safeCode = (task.code || "").replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="task-header">
                <div class="task-title">
                    <span class="task-seq">${task.number}</span>
                    <span class="task-number">№ ${task.seq}${task.title ? ` <span class="task-title-name">(${escapeHtml(task.title)})</span>` : ''}</span>
                </div>
                <div class="task-actions">
                    ${diffHtml}
                    ${codeHtml}
                    <button type="button" class="btn-edit" title="Редактировать"
                        onclick="editTask('${safeCode}', ${task.seq})">Изменить</button>
                    <button class="btn-delete" title="Удалить задание"
                        onclick="deleteTask('${safeCode}', ${task.seq})">
                        Удалить
                    </button>
                </div>
            </div>
            <div class="task-text">${textContent}</div>
            ${answerHtml}
        `;
        tasksList.appendChild(card);
    });
    typesetMath(tasksList);
}

function filterTasks() {
    const searchValue = searchInput.value.trim();
    const selectedNumber = taskNumberSelect.value;

    let filtered = tasks;

    if (selectedNumber !== "all") {
        filtered = filtered.filter(t => t.number === Number(selectedNumber));
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

    renderTasks(filtered);
}

async function init() {
    tasksList.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:40px 0;">Загрузка заданий...</p>';

    try {
        if (typeof initSupabase === 'function') initSupabase();

        _numberMapCache = await dbFetchNumberMap();
        _typeNamesCache = await dbFetchTypeNames();

        let raw = USE_LOCAL_DATA ? [...localTasks] : [];

        if (!USE_LOCAL_DATA) {
            try {
                raw = await loadTasksFromSheet();
            } catch (e) {
                raw = [...localTasks];
            }
        }

        const remote = await dbFetchTasks();
        if (remote && remote.length) {
            const codes = new Set(remote.map(t => t.code));
            raw = raw.filter(t => !codes.has(t.code)).concat(remote);
        }

        raw = applyNumberMapToTasks(raw);
        tasks = assignFixedSeq(raw);
        updateDropdown(tasks);
        renderTasks(tasks);
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
    filterTasks();
    syncTypeEditor();
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
