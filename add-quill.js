
(function(){
  let quill = null;
  let quillSolution = null;
  let modalMode = 'insert';
  let editingId = null;
  let taskFiles = []; // {name, type, size, dataUrl}
  const MAX_FILE_BYTES = 2 * 1024 * 1024;

  function formatFileSize(n){
    if(n < 1024) return n + ' Б';
    if(n < 1024*1024) return (n/1024).toFixed(1) + ' КБ';
    return (n/1024/1024).toFixed(1) + ' МБ';
  }

  function renderFilesList(){
    const ul = document.getElementById('filesList');
    if(!ul) return;
    ul.innerHTML = '';
    taskFiles.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span title="'+f.name.replace(/"/g,'&quot;')+'">'+f.name+' <small style="color:#9ca3af">('+formatFileSize(f.size)+')</small></span>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-remove';
      btn.textContent = 'Удалить';
      btn.onclick = () => { taskFiles.splice(i, 1); renderFilesList(); };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function readFileAsDataUrl(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }


  function getQueryEdit(){
    try{
      const u = new URL(location.href);
      return u.searchParams.get('edit') || null;
    }catch(e){ return null; }
  }


  function registerFontSizes(){
    if(typeof Quill === 'undefined' || Quill.__sizesReady) return;
    try{
      const Size = Quill.import('attributors/style/size');
      Size.whitelist = ['14px','15px','16px','17px','18px','19px','20px','21px','22px','23px','24px','25px','26px','27px','28px','29px','30px','31px','32px','33px','34px','35px','36px','37px','38px','39px','40px'];
      Quill.register(Size, true);
      Quill.__sizesReady = true;
    }catch(e){ console.warn('size register', e); }
  }

  function ensureTableBlot(){
    if(typeof Quill === 'undefined' || Quill.__tableBlotReady) return;
    try{
      const BlockEmbed = Quill.import('blots/block/embed');
      class TableBlot extends BlockEmbed {
        static create(value){
          const node = super.create();
          node.setAttribute('contenteditable','false');
          node.innerHTML = typeof value === 'string' ? value : (value && value.html) || '';
          TableBlot.decorate(node);
          return node;
        }
        static decorate(node){
          if(!node) return;
          let del = node.querySelector(':scope > .ql-table-del');
          if(!del){
            del = document.createElement('button');
            del.type = 'button';
            del.className = 'ql-table-del';
            del.title = 'Удалить таблицу';
            del.textContent = '✕';
            node.insertBefore(del, node.firstChild);
          }
          del.onmousedown = e => e.preventDefault();
          del.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            if(!confirm('Удалить эту таблицу?')) return;
            const blot = Quill.find(node);
            if(blot) blot.remove(); else node.remove();
          };
          node.querySelectorAll('td, th').forEach(cell => {
            cell.setAttribute('contenteditable','true');
            cell.style.textAlign = 'center';
            cell.style.verticalAlign = 'middle';
            cell.onmousedown = e => e.stopPropagation();
            cell.onclick = e => { e.stopPropagation(); cell.focus(); };

            // Backspace/Delete — только содержимое ячейки, не всю таблицу
            cell.onkeydown = function(e) {
              e.stopPropagation();
              if (e.key === 'Backspace' || e.key === 'Delete') {
                // не даём событию уйти в Quill (иначе удалится embed-таблица)
                e.stopImmediatePropagation();
                const sel = window.getSelection();
                const hasSel = sel && !sel.isCollapsed && cell.contains(sel.anchorNode);
                if (hasSel) {
                  // стандартное удаление выделения
                  return;
                }
                // пустая ячейка — не удалять таблицу
                const text = (cell.textContent || '').replace(/\u00a0/g, ' ').trim();
                if (!text || text === '') {
                  e.preventDefault();
                  cell.innerHTML = '<br>';
                }
              }
            };

            // Вставка: текст или HTML-таблица → соответствующие ячейки
            cell.onpaste = function(e) {
              e.stopPropagation();
              e.preventDefault();
              const cd = e.clipboardData || window.clipboardData;
              let matrix = null;

              // 1) HTML-таблица (копирование из таблицы)
              const html = cd.getData('text/html') || '';
              if (html && /<table/i.test(html)) {
                try {
                  const doc = new DOMParser().parseFromString(html, 'text/html');
                  const srcTable = doc.querySelector('table');
                  if (srcTable) {
                    matrix = [...srcTable.querySelectorAll('tr')].map(tr =>
                      [...tr.querySelectorAll('td, th')].map(td => (td.textContent || '').trim())
                    );
                  }
                } catch (err) {}
              }

              // 2) обычный текст
              if (!matrix) {
                const text = cd.getData('text') || cd.getData('text/plain') || '';
                if (!text) return;
                const lines = String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
                // не отбрасываем пустые строки внутри блока — сохраняем структуру
                while (lines.length && !lines[0].trim()) lines.shift();
                while (lines.length && !lines[lines.length-1].trim()) lines.pop();
                matrix = lines.map(line => {
                  // табы или несколько пробелов — столбцы
                  if (/\t/.test(line)) return line.split('\t').map(s => s.trim());
                  return line.trim().split(/[\s,;]+/).filter(s => s.length > 0);
                });
              }

              if (!matrix || !matrix.length) return;

              const onlyOne = matrix.length === 1 && matrix[0].length <= 1;
              if (onlyOne) {
                const plain = (matrix[0] && matrix[0][0] != null) ? matrix[0][0] : '';
                if (document.execCommand) document.execCommand('insertText', false, plain);
                else cell.textContent = plain;
                return;
              }

              const table = cell.closest('table');
              if (!table) return;
              const rows = [...table.querySelectorAll('tr')];
              let startR = 0, startC = 0;
              rows.forEach((tr, ri) => {
                [...tr.querySelectorAll('td, th')].forEach((td, ci) => {
                  if (td === cell) { startR = ri; startC = ci; }
                });
              });
              for (let r = 0; r < matrix.length; r++) {
                const tr = rows[startR + r];
                if (!tr) break;
                const cells = [...tr.querySelectorAll('td, th')];
                const rowVals = matrix[r] || [];
                for (let c = 0; c < rowVals.length; c++) {
                  const td = cells[startC + c];
                  if (!td) break;
                  td.textContent = rowVals[c] != null ? rowVals[c] : '';
                }
              }
            };
          });
        }
        static value(node){
          const clone = node.cloneNode(true);
          clone.querySelectorAll('.ql-table-del').forEach(b => b.remove());
          return clone.innerHTML;
        }
      }
      TableBlot.blotName = 'tableEmbed';
      TableBlot.tagName = 'DIV';
      TableBlot.className = 'ql-table-wrap';
      Quill.register(TableBlot, true);
      Quill.register({'formats/tableEmbed': TableBlot}, true);
      Quill.__tableBlotReady = true;
    }catch(e){ console.error(e); }
  }

  function getModalBorder(){
    const w = document.getElementById('tblBorderWidth');
    const s = document.getElementById('tblBorderStyle');
    const c = document.getElementById('tblBorderColor');
    const width = w ? parseInt(w.value, 10) : 1;
    const style = s ? s.value : 'solid';
    const color = c ? c.value : '#000000';
    if (!width || width <= 0) return 'none';
    return width + 'px ' + style + ' ' + color;
  }

  function applyTableBorders(tableEl, borderCss){
    if (!tableEl) return;
    const b = borderCss != null ? borderCss : getModalBorder();
    tableEl.style.borderCollapse = 'collapse';
    tableEl.querySelectorAll('td, th').forEach(cell => {
      cell.style.border = b;
    });
  }

  function buildTableHtml(rows, cols, colors, borderCss){
    rows = Math.max(1, Math.min(20, rows|0));
    cols = Math.max(1, Math.min(12, cols|0));
    colors = colors || {};
    const border = borderCss != null ? borderCss : getModalBorder();
    let html = '<table style="border-collapse:collapse"><tbody>';
    for(let r=0;r<rows;r++){
      html += '<tr>';
      for(let c=0;c<cols;c++){
        let bg = '';
        if(colors.col && c===0) bg = colors.col;
        if(colors.row && r===0) bg = colors.row;
        if(colors.diag && r===c) bg = colors.diag;
        const style = 'text-align:center;vertical-align:middle;border:'+border+';'+(bg?'background-color:'+bg+';':'');
        const paint = bg ? ' data-tbl-paint="1"' : '';
        html += '<td style="'+style+'" contenteditable="true"'+paint+'><br></td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function applyTableColors(tableEl, colors){
    if(!tableEl||!colors) return;
    [...tableEl.querySelectorAll('tr')].forEach((tr,ri)=>{
      [...tr.querySelectorAll('th,td')].forEach((cell,ci)=>{
        if(cell.dataset.tblPaint){ cell.style.backgroundColor=''; delete cell.dataset.tblPaint; }
        let bg='';
        if(colors.col && ci===0) bg=colors.col;
        if(colors.row && ri===0) bg=colors.row;
        if(colors.diag && ri===ci) bg=colors.diag;
        if(bg){ cell.style.backgroundColor=bg; cell.dataset.tblPaint='1'; }
      });
    });
  }

  function insertTableAt(q, index, tableHtml){
    ensureTableBlot();
    const len = q.getLength();
    index = Math.max(0, Math.min(index, Math.max(0, len-1)));
    try{
      const Delta = Quill.import('delta');
      q.updateContents(new Delta().retain(index).insert('\n').insert({tableEmbed:tableHtml}).insert('\n'), 'user');
      q.setSelection(index+3, 0, 'silent');
      return true;
    }catch(e1){
      try{ q.insertEmbed(index,'tableEmbed',tableHtml,'user'); q.insertText(index+1,'\n','user'); return true; }
      catch(e2){
        try{
          q.clipboard.dangerouslyPasteHTML(index,'<div class="ql-table-wrap">'+tableHtml+'</div><p><br></p>');
          setTimeout(()=>{
            q.root.querySelectorAll('.ql-table-wrap').forEach(w=>{
              w.setAttribute('contenteditable','false');
              try{ const B=Quill.import('formats/tableEmbed'); if(B&&B.decorate) B.decorate(w); }catch(e){}
            });
          },0);
          return true;
        }catch(e3){ return false; }
      }
    }
  }

  function findFocusedTableCell(){
    const sel = window.getSelection();
    if(sel && sel.anchorNode){
      const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      if(el){
        const cell = el.closest && el.closest('td, th');
        if(cell && cell.closest('.ql-table-wrap, .ql-editor table')) return cell;
      }
    }
    const active = document.activeElement;
    if(active && (active.tagName === 'TD' || active.tagName === 'TH')) return active;
    return null;
  }
  function findFocusedTableWrap(){
    if(!quill) return null;
    const sel = quill.getSelection(true);
    let wrap=null;
    if(sel){
      const leaf=quill.getLeaf(sel.index);
      let node=leaf&&leaf[0]&&leaf[0].domNode;
      while(node&&node!==quill.root){
        if(node.classList&&node.classList.contains('ql-table-wrap')){ wrap=node; break; }
        node=node.parentNode;
      }
    }
    if(!wrap){
      const f=quill.root.querySelector('.ql-table-wrap td:focus, .ql-table-wrap th:focus');
      if(f) wrap=f.closest('.ql-table-wrap');
    }
    if(!wrap){
      const all=quill.root.querySelectorAll('.ql-table-wrap');
      wrap=all.length?all[all.length-1]:null;
    }
    return wrap;
  }

  function setTableAlign(wrap, align){
    if(!wrap) return;
    const a=(!align||align===false||align==='left')?'left':String(align);
    wrap.setAttribute('data-align', a);
    if(a==='center'){ wrap.style.marginLeft='auto'; wrap.style.marginRight='auto'; }
    else if(a==='right'){ wrap.style.marginLeft='auto'; wrap.style.marginRight='0'; }
    else { wrap.style.marginLeft='0'; wrap.style.marginRight='auto'; }
  }

  const tableModal=document.getElementById('tableModal');
  function openTableModal(mode){
    modalMode=mode||'insert';
    document.getElementById('modalTitle').textContent=modalMode==='paint'?'Заливка таблицы':'Вставить таблицу';
    document.getElementById('modalOk').textContent=modalMode==='paint'?'Применить':'Вставить';
    document.getElementById('sizeFields').style.display=modalMode==='paint'?'none':'flex';
    document.getElementById('alignBlock').style.display=modalMode==='paint'?'none':'block';
    const bb = document.getElementById('borderBlock');
    if (bb) bb.style.display = 'block';
    tableModal.classList.add('open');
  }
  function closeTableModal(){ tableModal.classList.remove('open'); }
  function getModalColors(){
    return {
      row: document.getElementById('tblColorRowOn').checked?document.getElementById('tblColorRow').value:'',
      col: document.getElementById('tblColorColOn').checked?document.getElementById('tblColorCol').value:'',
      diag: document.getElementById('tblColorDiagOn').checked?document.getElementById('tblColorDiag').value:''
    };
  }
  document.getElementById('modalCancel').onclick=closeTableModal;
  tableModal.addEventListener('click',e=>{ if(e.target===tableModal) closeTableModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&tableModal.classList.contains('open')) closeTableModal(); });

  document.getElementById('modalOk').onclick=()=>{
    const colors=getModalColors();
    const borderCss=getModalBorder();
    if(modalMode==='paint'){
      const wrap=findFocusedTableWrap();
      if(!wrap){ alert('Сначала кликните по ячейке таблицы'); return; }
      const table=wrap.querySelector('table');
      applyTableBorders(table, borderCss);
      if(table) applyTableColors(table, colors);
      closeTableModal(); return;
    }
    const rows=Math.min(20,Math.max(1,parseInt(document.getElementById('modalRows').value,10)||3));
    const cols=Math.min(12,Math.max(1,parseInt(document.getElementById('modalCols').value,10)||3));
    const align=document.querySelector('input[name=tableAlign]:checked').value;
    const tableHtml=buildTableHtml(rows,cols,colors,borderCss);
    const before=quill.getSelection(true);
    const idx=before?before.index:Math.max(0,quill.getLength()-1);
    try{quill.focus();}catch(e){}
    if(insertTableAt(quill, idx, tableHtml)){
      setTimeout(()=>{
        const wraps=quill.root.querySelectorAll('.ql-table-wrap');
        const last=wraps[wraps.length-1];
        if(last) setTableAlign(last, align);
      },30);
    }
    closeTableModal();
  };

  if(typeof Quill === 'undefined'){
    console.error('Quill не загружен');
    const ed=document.getElementById('editor');
    if(ed) ed.innerHTML='<p style="color:#b91c1c;padding:12px">Ошибка: редактор Quill не загрузился. Проверьте интернет / CDN.</p>';
  } else {
    try { ensureTableBlot(); } catch(e){ console.error('TableBlot', e); }
    try { registerFontSizes(); } catch(e){ console.error('sizes', e); }
    try {
      quill=new Quill('#editor',{
        theme:'snow',
        placeholder:'Введите текст задания…',
        modules:{
          toolbar:{
            container:[
              [{header:[1,2,3,false]}],
              [{size: ['14px','15px','16px','17px','18px','19px','20px','21px','22px','23px','24px','25px','26px','27px','28px','29px','30px','31px','32px','33px','34px','35px','36px','37px','38px','39px','40px']}],
              ['bold','italic','underline','strike'],
              [{script:'sub'},{script:'super'}],
              [{list:'ordered'},{list:'bullet'}],
              [{indent:'-1'},{indent:'+1'}],
              [{align:[]}],
              ['blockquote','code-block'],
              [{color:[]},{background:[]}],
              ['link','image','table','table-paint','table-delete'],
              ['clean']
            ],
            handlers:{
              size:function(value){
                const cell = findFocusedTableCell();
                const wrap = cell ? cell.closest('.ql-table-wrap') : findFocusedTableWrap();
                if(wrap){
                  // размер для всех ячеек таблицы
                  wrap.querySelectorAll('td, th').forEach(td => {
                    if(value) td.style.fontSize = value;
                    else td.style.fontSize = '';
                  });
                  return;
                }
                this.quill.format('size', value || false);
              },
              align:function(value){
                const wrap=findFocusedTableWrap();
                if(wrap) setTableAlign(wrap, value);
                const cell = findFocusedTableCell();
                if(cell && value){
                  cell.style.textAlign = value || 'center';
                }
                this.quill.format('align', value||false);
              },
              table:function(){ openTableModal('insert'); },
              'table-paint':function(){
                if(!findFocusedTableWrap()){ alert('Сначала кликните по ячейке таблицы'); return; }
                openTableModal('paint');
              },
              'table-delete':function(){
                const wrap=findFocusedTableWrap();
                if(!wrap){ alert('Таблица не выбрана'); return; }
                if(!confirm('Удалить таблицу?')) return;
                const blot=Quill.find(wrap);
                if(blot) blot.remove(); else wrap.remove();
              }
            }
          }
        }
      });
    } catch(e) {
      console.error('Quill init failed, fallback', e);
      // Упрощённый редактор без таблиц
      quill=new Quill('#editor',{
        theme:'snow',
        placeholder:'Введите текст задания…',
        modules:{ toolbar: [
          [{header:[1,2,3,false]}],
          ['bold','italic','underline'],
          [{list:'ordered'},{list:'bullet'}],
          [{align:[]}],
          [{color:[]},{background:[]}],
          ['link','image'],
          ['clean']
        ]}
      });
    }

    if (quill && quill.root) {
      quill.root.addEventListener('keydown', function(e) {
        if (e.key !== 'Backspace' && e.key !== 'Delete') return;
        const t = e.target;
        if (t && t.closest && t.closest('.ql-table-wrap td, .ql-table-wrap th, td, th')) {
          e.stopPropagation();
        }
      }, true);
    }

    let bar=null;
    const edEl=document.querySelector('#editor');
    if(edEl && edEl.parentElement){
      bar=edEl.parentElement.querySelector('.ql-toolbar');
    }
    if(!bar) bar=document.querySelector('.ql-toolbar');
    if(bar){
      [['.ql-table','▦','Вставить таблицу'],['.ql-table-paint','🎨','Заливка'],['.ql-table-delete','🗑','Удалить таблицу']].forEach(([sel,icon,title])=>{
        bar.querySelectorAll(sel).forEach(n=>{ n.setAttribute('title',title); n.innerHTML=icon; n.style.fontSize='14px'; });
      });
    }
    // Quill для решения
    const solEl = document.getElementById('solutionEditor');
    if(solEl){
      try {
        try { registerFontSizes(); } catch(e){}
        quillSolution = new Quill('#solutionEditor', {
          theme: 'snow',
          placeholder: 'Ход решения, пояснения…',
          modules: {
            toolbar: [
              ['bold', 'italic', 'underline'],
              [{ script: 'sub' }, { script: 'super' }],
              [{ list: 'ordered' }, { list: 'bullet' }],
              [{ size: ['14px','15px','16px','17px','18px','19px','20px','21px','22px','23px','24px','25px','26px','27px','28px','29px','30px','31px','32px','33px','34px','35px','36px','37px','38px','39px','40px'] }],
              [{ align: [] }],
              [{ color: [] }, { background: [] }],
              ['link', 'image'],
              ['clean']
            ]
          }
        });
      } catch(e){ console.error('solution Quill', e); }
    }
  }


  // Answer table
  let ansRows=2, ansCols=2;
  function renderAnswerTable(){
    const header=document.getElementById('tableHeader');
    const body=document.getElementById('tableBody');
    header.innerHTML='';
    for(let c=0;c<ansCols;c++){ const th=document.createElement('th'); th.textContent=String.fromCharCode(65+c); header.appendChild(th); }
    const old=[];
    body.querySelectorAll('tr').forEach((tr,r)=>{ old[r]=[]; tr.querySelectorAll('input').forEach((inp,c)=>{ old[r][c]=inp.value; }); });
    body.innerHTML='';
    for(let r=0;r<ansRows;r++){
      const tr=document.createElement('tr');
      for(let c=0;c<ansCols;c++){
        const td=document.createElement('td'); const inp=document.createElement('input'); inp.type='text';
        if(old[r]&&old[r][c]!==undefined) inp.value=old[r][c];
        td.appendChild(inp); tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }
  function getAnswerTableData(){
    const data=[];
    document.getElementById('tableBody').querySelectorAll('tr').forEach(tr=>{
      const row=[]; tr.querySelectorAll('input').forEach(inp=>row.push(inp.value.trim())); data.push(row);
    });
    return data;
  }
  document.getElementById('btnAddRow').onclick=()=>{ ansRows++; renderAnswerTable(); };
  document.getElementById('btnAddCol').onclick=()=>{ ansCols++; renderAnswerTable(); };
  document.getElementById('btnRemoveRow').onclick=()=>{ if(ansRows>1){ ansRows--; renderAnswerTable(); } };
  document.getElementById('btnRemoveCol').onclick=()=>{ if(ansCols>1){ ansCols--; renderAnswerTable(); } };
  document.querySelectorAll('input[name=answerType]').forEach(radio=>{
    radio.addEventListener('change',()=>{
      const isTable=document.querySelector('input[name=answerType]:checked').value==='table';
      document.getElementById('answerTextBlock').style.display=isTable?'none':'block';
      document.getElementById('answerTableBlock').style.display=isTable?'block':'none';
      if(isTable) renderAnswerTable();
    });
  });

  async function getLocalTasks(){
    try { return await dbFetchTasks(); }
    catch(e){ console.error(e); return []; }
  }

  function fillDatalist(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    const uniq = [...new Set(values.map(v => String(v).trim()).filter(Boolean))];
    uniq.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    dl.innerHTML = uniq.map(v => '<option value="' + v.replace(/"/g, '&quot;') + '"></option>').join('');
  }

  async function loadExistingFieldOptions() {
    let tasks = [];
    let typeNames = {};
    try { tasks = await getLocalTasks(); } catch (e) {}
    try {
      if (typeof dbFetchTypeNames === 'function') typeNames = await dbFetchTypeNames() || {};
    } catch (e) {}

    const numbers = [];
    const names = [];
    const subtypes = [];
    const authors = [];

    Object.keys(typeNames).forEach(k => {
      numbers.push(k);
      if (typeNames[k]) names.push(typeNames[k]);
    });
    tasks.forEach(t => {
      if (t.number != null && t.number !== '') numbers.push(t.number);
      if (t.subtype) subtypes.push(t.subtype);
      if (t.title) authors.push(t.title);
    });

    fillDatalist('listNumbers', numbers);
    fillDatalist('listTypeNames', names);
    fillDatalist('listSubtypes', subtypes);
    fillDatalist('listAuthors', authors);

    // при выборе номера подставить известное название типа
    const numEl = document.getElementById('taskNumber');
    const nameEl = document.getElementById('taskTypeName');
    if (numEl && nameEl && !numEl._typeNameBound) {
      numEl._typeNameBound = true;
      numEl.addEventListener('change', function () {
        const key = String(numEl.value || '').trim().replace(',', '.');
        if (typeNames[key]) nameEl.value = typeNames[key];
        else if (typeNames[numEl.value]) nameEl.value = typeNames[numEl.value];
      });
      numEl.addEventListener('input', function () {
        const key = String(numEl.value || '').trim().replace(',', '.');
        if (typeNames[key]) nameEl.value = typeNames[key];
      });
    }
  }


  async function updateCount(){
    try {
      const n = await dbCountTasks();
      const el = document.getElementById('localCount');
      if(!el) return;
      const mode = (typeof isFirebaseReady==='function' && isFirebaseReady()) ? 'Firebase' : 'браузере (localStorage)';
      el.textContent = n>0 ? ('В '+mode+' заданий: '+n) : ('Пока нет заданий в '+mode);
    } catch(e) {
      document.getElementById('localCount').textContent = 'Не удалось подсчитать задания';
    }
  }
  function showMessage(text,type){
    const el=document.getElementById('message');
    if(!el) return;
    el.textContent=text;
    el.className='message '+type;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e) {}
    setTimeout(()=>{ el.className='message'; },5000);
  }
  function generateCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code='';
    for(let i=0;i<6;i++) code+=chars[Math.floor(Math.random()*chars.length)];
    return code;
  }
  document.getElementById('taskCode').value=generateCode();
  renderAnswerTable();
  const filesInput = document.getElementById('taskFiles');
  if(filesInput){
    filesInput.addEventListener('change', async function(){
      const files = Array.from(filesInput.files || []);
      filesInput.value = '';
      for(const file of files){
        if(file.size > MAX_FILE_BYTES){
          showMessage('Файл «'+file.name+'» больше 2 МБ','error');
          continue;
        }
        try{
          const dataUrl = await readFileAsDataUrl(file);
          taskFiles.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl });
        }catch(e){
          showMessage('Ошибка чтения «'+file.name+'»','error');
        }
      }
      renderFilesList();
    });
  }

  // Выбор цвета кода (кружки рядом с полем)
  (function(){
    const root=document.getElementById('colorSwatches');
    const hidden=document.getElementById('taskCodeColor');
    if(!root||!hidden) return;
    root.addEventListener('click',function(e){
      const btn=e.target.closest('.color-swatch');
      if(!btn) return;
      root.querySelectorAll('.color-swatch').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      hidden.value=btn.getAttribute('data-color')||'fipi';
    });
  })();


  document.getElementById('taskForm').addEventListener('submit',async function(e){
    e.preventDefault();
    let numberRaw=(document.getElementById('taskNumber').value||'').trim();
    // нормализация: запятая→точка, длинное тире→дефис
    numberRaw = numberRaw.replace(',', '.').replace(/[–—−]/g, '-').replace(/\s+/g, '');
    // 13.1, 19-21 — строки; целые — число
    let number;
    if(/^\d+\.\d+$/.test(numberRaw) || /^\d+-\d+$/.test(numberRaw)) number = numberRaw;
    else {
      number = Number(numberRaw);
      if(!Number.isFinite(number)) number = numberRaw;
    }
    const code=document.getElementById('taskCode').value.trim()||generateCode();
    const tmp=document.createElement('div'); tmp.innerHTML=quill.root.innerHTML;
    tmp.querySelectorAll('.ql-table-del').forEach(b=>b.remove());
    // Сохранить выравнивание таблицы в style (для банка и генерации)
    tmp.querySelectorAll('.ql-table-wrap').forEach(w => {
      const a = w.getAttribute('data-align') || 'left';
      w.setAttribute('data-align', a);
      if (a === 'center') { w.style.marginLeft = 'auto'; w.style.marginRight = 'auto'; }
      else if (a === 'right') { w.style.marginLeft = 'auto'; w.style.marginRight = '0'; }
      else { w.style.marginLeft = '0'; w.style.marginRight = 'auto'; }
      w.style.display = 'table';
      w.style.maxWidth = '100%';
    });
    // После сохранения таблица только для просмотра — без редактирования
    tmp.querySelectorAll('td, th').forEach(cell => {
      cell.setAttribute('contenteditable', 'false');
      cell.removeAttribute('contenteditable');
    });
    tmp.querySelectorAll('.ql-table-wrap').forEach(w => {
      w.setAttribute('contenteditable', 'false');
    });
    const cleanHtml=tmp.innerHTML;
    const textPlain=quill.getText().trim();
    const answerType=document.querySelector('input[name=answerType]:checked').value;
    if(!numberRaw){ showMessage('Укажите номер типа задания','error'); return; }
    if(typeof number==='number' && !(number>=1)){ showMessage('Укажите корректный номер типа','error'); return; }
    if(typeof number==='string' && !/^\d+(\.\d+)?$/.test(number) && !/^\d+-\d+$/.test(number)){ showMessage('Номер типа: 1, 13.1, 19-21…','error'); return; }
    if(!textPlain){ showMessage('Введите текст задания','error'); return; }
    let answer='', answerTable=null;
    if(answerType==='text') answer=document.getElementById('taskAnswer').value.trim();
    else {
      answerTable=getAnswerTableData();
      if(!answerTable.some(row=>row.some(cell=>cell))) answerTable=null;
    }
    let solutionHtml='';
    if(quillSolution){
      const sTmp=document.createElement('div');
      sTmp.innerHTML=quillSolution.root.innerHTML;
      sTmp.querySelectorAll('.ql-table-del').forEach(b=>b.remove());
      const plain=(quillSolution.getText()||'').trim();
      solutionHtml=plain?sTmp.innerHTML:'';
    }
    const difficulty=document.getElementById('taskDifficulty').value||'basic';
    const title=(document.getElementById('taskTitle')&&document.getElementById('taskTitle').value.trim())||'';
    const codeColor=(document.getElementById('taskCodeColor')&&document.getElementById('taskCodeColor').value)||'fipi';
    const typeName=(document.getElementById('taskTypeName')&&document.getElementById('taskTypeName').value.trim())||'';
    const subtype=(document.getElementById('taskSubtype')&&document.getElementById('taskSubtype').value.trim())||'';
    if(typeName && number && typeof dbSaveTypeName==='function'){
      try{ await dbSaveTypeName(number, typeName); }catch(e){ console.warn(e); }
    }
    const taskObj={id:editingId||undefined,code,number,difficulty,title,subtype,codeColor,text:cleanHtml,files:taskFiles.slice(),answer,answerTable,answerType,solution:solutionHtml,addedAt:new Date().toISOString()};
    try {
      if(editingId){
        taskObj.id = editingId;
        await dbUpsertTask(taskObj);
        showMessage('Задание сохранено','success');
        setTimeout(()=>{ const ex=(typeof getExam==='function'?getExam():(window.__BANK_EXAM__||'ege')); location.href='bank.html?exam='+ex; }, 700);
        return;
      }
      await dbUpsertTask(taskObj);
      showMessage('Задание добавлено','success');
      await updateCount();
      await loadExistingFieldOptions();
    } catch(err) {
      console.error(err);
      showMessage('Ошибка сохранения: '+(err.message||err),'error');
      return;
    }
    document.getElementById('taskNumber').value='';
    document.getElementById('taskCode').value=generateCode();
    const cc=document.getElementById('taskCodeColor'); if(cc) cc.value='fipi';
    document.querySelectorAll('.color-swatch').forEach(b=>b.classList.toggle('active', b.getAttribute('data-color')==='fipi'));
    const tn=document.getElementById('taskTypeName'); if(tn) tn.value='';
    const st=document.getElementById('taskSubtype'); if(st) st.value='';
    const t=document.getElementById('taskTitle'); if(t) t.value='';
    const d=document.getElementById('taskDifficulty'); if(d) d.value='basic';
    document.getElementById('taskAnswer').value='';
    quill.setText('');
    if(quillSolution) quillSolution.setText('');
    taskFiles=[]; renderFilesList();
    ansRows=2; ansCols=2; renderAnswerTable();
    document.querySelector('input[name=answerType][value=text]').checked=true;
    document.getElementById('answerTextBlock').style.display='block';
    document.getElementById('answerTableBlock').style.display='none';
  });
  document.getElementById('btnClear').onclick=()=>{
    document.getElementById('taskForm').reset();
    document.getElementById('taskCode').value=generateCode();
    quill.setText('');
    if(quillSolution) quillSolution.setText('');
    taskFiles=[]; renderFilesList();
    ansRows=2; ansCols=2; renderAnswerTable();
    document.getElementById('answerTextBlock').style.display='block';
    document.getElementById('answerTableBlock').style.display='none';
  };
  document.getElementById('btnClearAll').onclick=async ()=>{
    if(confirm('Удалить ВСЕ задания из базы?')){
      try {
        await dbDeleteAllUserTasks();
        await updateCount();
        showMessage('Все задания удалены','success');
      } catch(e) {
        showMessage('Ошибка: '+(e.message||e),'error');
      }
    }
  };
  updateCount();
  if(typeof initFirebase==='function') initFirebase();
  loadExistingFieldOptions();

  // --- Режим редактирования ---
  async function loadTaskForEdit(editKey){
    if(!editKey) return;
    let task = null;
    try {
      const list = await getLocalTasks();
      task = list.find(t => t.id === editKey) || list.find(t => t.code === editKey);
    } catch(e){}
    if(!task){
      try{
        const raw = sessionStorage.getItem('bank_edit_task');
        if(raw){
          const t = JSON.parse(raw);
          if(t && (t.id === editKey || t.code === editKey)) task = t;
        }
      }catch(e){}
    }
    if(!task){
      showMessage('Задание не найдено. Можно создать новое.','error');
      return;
    }
    editingId = task.id || editKey;
    document.getElementById('taskNumber').value = task.number || '';
    document.getElementById('taskCode').value = task.code || generateCode();
    const colorVal = task.codeColor || 'fipi';
    const colorEl = document.getElementById('taskCodeColor');
    if(colorEl) colorEl.value = colorVal;
    document.querySelectorAll('.color-swatch').forEach(b=>b.classList.toggle('active', b.getAttribute('data-color')===colorVal));
    const typeNameEl = document.getElementById('taskTypeName');
    if(typeNameEl){
      let tn = '';
      try {
        if(typeof dbFetchTypeNames==='function'){
          const names = await dbFetchTypeNames();
          tn = names[String(task.number)] || '';
        }
      } catch(e){}
      typeNameEl.value = tn;
    }
    const stEl = document.getElementById('taskSubtype');
    if(stEl) stEl.value = task.subtype || '';
    const titleEl = document.getElementById('taskTitle');
    if(titleEl) titleEl.value = task.title || '';
    const diffEl = document.getElementById('taskDifficulty');
    if(diffEl) diffEl.value = task.difficulty || 'basic';
    taskFiles = Array.isArray(task.files) ? task.files.slice() : [];
    renderFilesList();
    // Quill HTML
    if(task.text){
      quill.root.innerHTML = task.text;
      // Сделать ячейки редактируемыми снова
      quill.root.querySelectorAll('.ql-table-wrap').forEach(w=>{
        w.setAttribute('contenteditable','false');
        try{
          const Blot = Quill.import('formats/tableEmbed');
          if(Blot && Blot.decorate) Blot.decorate(w);
        }catch(e){}
        w.querySelectorAll('td, th').forEach(cell=>{
          cell.setAttribute('contenteditable','true');
        });
      });
    }
    if(task.solution && quillSolution){
      quillSolution.root.innerHTML = task.solution;
    } else if(quillSolution){
      quillSolution.setText('');
    }
    const at = task.answerType || (task.answerTable ? 'table' : 'text');
    if(at === 'table'){
      document.querySelector('input[name=answerType][value=table]').checked = true;
      document.getElementById('answerTextBlock').style.display = 'none';
      document.getElementById('answerTableBlock').style.display = 'block';
      if(task.answerTable && task.answerTable.length){
        ansRows = task.answerTable.length;
        ansCols = Math.max(...task.answerTable.map(r => r.length), 1);
        renderAnswerTable();
        const body = document.getElementById('tableBody');
        body.querySelectorAll('tr').forEach((tr, ri)=>{
          tr.querySelectorAll('input').forEach((inp, ci)=>{
            if(task.answerTable[ri] && task.answerTable[ri][ci] != null) inp.value = task.answerTable[ri][ci];
          });
        });
      } else {
        renderAnswerTable();
      }
    } else {
      document.querySelector('input[name=answerType][value=text]').checked = true;
      document.getElementById('taskAnswer').value = task.answer || '';
    }
    const btn = document.querySelector('#taskForm button[type=submit]');
    if(btn) btn.textContent = 'Сохранить изменения';
    const h1 = document.querySelector('.add-form h1');
    if(h1) h1.textContent = 'Редактировать задание';
    showMessage('Редактирование задания ' + code, 'success');
  }

  const editCode = getQueryEdit();
  if(editCode) loadTaskForEdit(editCode);
})();

