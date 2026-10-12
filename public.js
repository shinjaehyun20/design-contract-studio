(() => {
  'use strict';
  const api=window.CanvasStudio,$=id=>document.getElementById(id);
  if(!api)return;
  const input=(accept,handler)=>{const node=document.createElement('input');node.type='file';node.accept=accept;node.hidden=true;document.body.appendChild(node);node.addEventListener('change',async()=>{if(node.files[0])try{await handler(node.files[0]);api.fitCanvas();sync();}catch(error){$('showcaseStatus').textContent=error.message;}node.value='';});return node;};
  const pptx=input('.pptx',file=>api.openPresentation(file));
  const md=input('.md',file=>api.importContract(file));
  document.querySelectorAll('[data-tool]').forEach(b=>{b.title={select:'Select',text:'Text',rectangle:'Rectangle',oval:'Ellipse',arrow:'Arrow',line:'Line'}[b.dataset.tool]||b.dataset.tool;b.setAttribute('aria-label',b.title);});
  $('publicOpen').onclick=()=>pptx.click();$('publicContract').onclick=()=>md.click();
  $('publicExport').onclick=()=>api.downloadPresentation();$('publicSaveJson').onclick=()=>api.saveProject();
  const nav=document.createElement('div');nav.className='public-edit-actions';nav.innerHTML='<button id="publicUndo" aria-label="Undo" title="Undo">↶</button><button id="publicRedo" aria-label="Redo" title="Redo">↷</button><select id="publicSlide" aria-label="Slide"></select><button id="publicFit" title="Fit slide to screen">Fit ↗</button>';
  $('editModeBar').appendChild(nav);$('publicUndo').onclick=()=>api.undo();$('publicRedo').onclick=()=>api.redo();$('publicFit').onclick=()=>api.fitCanvas();$('publicSlide').onchange=event=>api.selectSlide(Number(event.target.value));
  let previousSelection='';
  function sync(){
    const project=api.getProject(),editor=api.getEditorState(),selected=api.getSelection(),first=selected[0];
    const menu=$('publicSlide');if(menu.options.length!==project.slides.length||menu.dataset.project!==project.id){menu.replaceChildren();project.slides.forEach((slide,index)=>{const opt=document.createElement('option');opt.value=index;opt.textContent=`${String(index+1).padStart(2,'0')} / ${String(project.slides.length).padStart(2,'0')}   ${slide.title}`;menu.appendChild(opt);});menu.dataset.project=project.id;}menu.value=editor.activeSlide;
    $('publicFileName').textContent=project.name;
    const contract=project.designSystem;if(contract){const colors=contract.tokens?.colors||[],row=document.querySelector('.color-row');row.replaceChildren();colors.slice(0,5).forEach(c=>{const dot=document.createElement('span');dot.style.setProperty('--swatch',c.value);dot.title=`${c.name}: ${c.value}`;row.appendChild(dot);});const label=document.createElement('small');label.textContent=contract.name;row.appendChild(label);const fonts=contract.spec?.frontmatter?.typography||{};document.querySelector('.font-preview>span').textContent=[fonts.heading?.fontFamily,fonts.body?.fontFamily].filter(Boolean).map(f=>f.split(',')[0]).join(' · ')||'Imported typography';}
    const signature=JSON.stringify(selected.map(o=>({id:o.id,content:o.content,style:o.style})));
    if(signature===previousSelection)return;previousSelection=signature;
    $('selectionHint').textContent=first?(selected.length===1?first.name:`${selected.length} objects selected`):'Click an object on the slide to edit it.';
    $('selectionFields').hidden=!first;
    if(first){const isText=first.type==='text';$('publicText').parentElement.hidden=!isText;$('publicSize').parentElement.hidden=!isText;$('publicText').value=first.content||'';$('publicSize').value=first.style.fontSize||18;const color=isText?first.style.color:first.style.fill;$('publicColor').value=/^#[0-9a-f]{6}$/i.test(color||'')?color:'#1d5d46';}

  }
  $('publicUpdate').onclick=()=>{const selected=api.getSelection();if(!selected.length)return;const first=selected[0],style=first.type==='text'?{color:$('publicColor').value,fontSize:Math.min(160,Math.max(6,Number($('publicSize').value)||18))}:{fill:$('publicColor').value};api.editSelected({...(first.type==='text'?{content:$('publicText').value}:{}),style});};
  document.addEventListener('contractstate',sync);
  document.addEventListener('pointerup',()=>setTimeout(sync,0));document.addEventListener('keyup',()=>setTimeout(sync,0));
  window.addEventListener('resize',()=>api.fitCanvas());
  document.querySelector('.canvas-toolbar').setAttribute('aria-label','Canvas selection');
  for(const [id,label] of Object.entries({shapeMenuButton:'Shapes',addImage:'Image',strikeButton:'Strike',rulerButton:'Rulers'})){if($(id))$(id).textContent=label;}
  api.fitCanvas();sync();
})();
