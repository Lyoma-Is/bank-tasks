
(function(){
  let quill = null;
  let quillSolution = null;
  let modalMode = 'insert';
  let editingCode = null;

  function getQueryEdit(){
    try{
      const u = new URL(location.href);
      return u.searchParams.get('edit') || null;
    }catch(e){ return null; }
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
            // В редакторе ячейки можно заполнять; после сохранения — только просмотр
            cell.setAttribute('contenteditable','true');
            cell.style.textAlign = 'center';
            cell.style.verticalAlign = 'middle';
            cell.onmousedown = e => e.stopPropagation();
            cell.onclick = e => { e.stopPropagation(); cell.focus(); };
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

  function buildTableHtml(rows, cols, colors){
    rows = Math.max(1, Math.min(20, rows|0));
    cols = Math.max(1, Math.min(12, cols|0));
    colors = colors || {};
    let html = '<table><tbody>';
    for(let r=0;r<rows;r++){
      html += '<tr>';
      for(let c=0;c<cols;c++){
        let bg = '';
        if(colors.col && c===0) bg = colors.col;
        if(colors.row && r===0) bg = colors.row;
        if(colors.diag && r===c) bg = colors.diag;
        const style = 'text-align:center;vertical-align:middle;'+(bg?'background-color:'+bg+';':'');
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
    if(modalMode==='paint'){
      const wrap=findFocusedTableWrap();
      if(!wrap){ alert('Сначала кликните по ячейке таблицы'); return; }
      const table=wrap.querySelector('table');
      if(table) applyTableColors(table, colors);
      closeTableModal(); return;
    }
    const rows=Math.min(20,Math.max(1,parseInt(document.getElementById('modalRows').value,10)||3));
    const cols=Math.min(12,Math.max(1,parseInt(document.getElementById('modalCols').value,10)||3));
    const align=document.querySelector('input[name=tableAlign]:checked').value;
    const tableHtml=buildTableHtml(rows,cols,colors);
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

  ensureTableBlot();
  quill=new Quill('#editor',{
    theme:'snow',
    placeholder:'Введите текст задания…',
    modules:{
      toolbar:{
        container:[
          [{header:[1,2,3,false]}],
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
          align:function(value){
            const wrap=findFocusedTableWrap();
            if(wrap) setTableAlign(wrap, value);
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

  const bar=document.querySelector('.ql-toolbar');
  if(bar){
    [['.ql-table','▦','Вставить таблицу'],['.ql-table-paint','🎨','Заливка'],['.ql-table-delete','🗑','Удалить таблицу']].forEach(([sel,icon,title])=>{
      bar.querySelectorAll(sel).forEach(n=>{ n.setAttribute('title',title); n.innerHTML=icon; n.style.fontSize='14px'; });
    });
  }
  // Quill для решения — упрощённая панель
  const solEl = document.getElementById('solutionEditor');
  if(solEl){
    quillSolution = new Quill('#solutionEditor', {
      theme: 'snow',
      placeholder: 'Ход решения, пояснения…',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ script: 'sub' }, { script: 'super' }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          [{ color: [] }, { background: [] }],
          ['link', 'image'],
          ['clean']
        ]
      }
    });
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
    const el=document.getElementById('message'); el.textContent=text; el.className='message '+type;
    setTimeout(()=>{ el.className='message'; },4000);
  }
  function generateCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code='';
    for(let i=0;i<6;i++) code+=chars[Math.floor(Math.random()*chars.length)];
    return code;
  }
  document.getElementById('taskCode').value=generateCode();
  renderAnswerTable();

  document.getElementById('taskForm').addEventListener('submit',function(e){
    e.preventDefault();
    const number=Number(document.getElementById('taskNumber').value);
    const code=document.getElementById('taskCode').value.trim()||generateCode();
    const tmp=document.createElement('div'); tmp.innerHTML=quill.root.innerHTML;
    tmp.querySelectorAll('.ql-table-del').forEach(b=>b.remove());
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
    if(!number||number<1){ showMessage('Укажите номер типа задания','error'); return; }
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
    const difficulty=document.getElementById('taskDifficulty').value||'medium';
    const title=(document.getElementById('taskTitle')&&document.getElementById('taskTitle').value.trim())||'';
    const taskObj={code,number,difficulty,title,text:cleanHtml,answer,answerTable,answerType,solution:solutionHtml,addedAt:new Date().toISOString()};
    try {
      if(editingCode){
        if(editingCode && code !== editingCode){
          try { await dbDeleteTask(editingCode); } catch(e) { console.warn(e); }
        }
        await dbUpsertTask(taskObj);
        showMessage('Задание сохранено!','success');
        setTimeout(()=>{ location.href='bank.html'; }, 700);
        return;
      }
      await dbUpsertTask(taskObj);
      showMessage('Задание добавлено!','success');
      await updateCount();
    } catch(err) {
      console.error(err);
      showMessage('Ошибка сохранения: '+(err.message||err),'error');
      return;
    }
    document.getElementById('taskNumber').value='';
    document.getElementById('taskCode').value=generateCode();
    const t=document.getElementById('taskTitle'); if(t) t.value='';
    const d=document.getElementById('taskDifficulty'); if(d) d.value='medium';
    document.getElementById('taskAnswer').value='';
    quill.setText('');
    if(quillSolution) quillSolution.setText('');
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

  // --- Режим редактирования ---
  async function loadTaskForEdit(code){
    if(!code) return;
    let task = null;
    try {
      const list = await getLocalTasks();
      task = list.find(t => t.code === code);
    } catch(e){}
    if(!task){
      try{
        const raw = sessionStorage.getItem('bank_edit_task');
        if(raw){
          const t = JSON.parse(raw);
          if(t && t.code === code) task = t;
        }
      }catch(e){}
    }
    if(!task){
      showMessage('Задание не найдено. Можно создать новое.','error');
      return;
    }
    editingCode = code;
    document.getElementById('taskNumber').value = task.number || '';
    document.getElementById('taskCode').value = task.code || generateCode();
    const titleEl = document.getElementById('taskTitle');
    if(titleEl) titleEl.value = task.title || '';
    const diffEl = document.getElementById('taskDifficulty');
    if(diffEl) diffEl.value = task.difficulty || 'medium';
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

