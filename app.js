(() => {
  'use strict';

  const STORAGE_KEY = 'design-canvas-studio:v1';
  const IS_SHOWCASE_MODE = true;
  const SHOWCASE_CONTRACT_URL = 'DESIGN.md';
  const STAGE_W = 960;
  const STAGE_H = 540;
  const SLIDE_PRESETS = Object.freeze({
    wide: {label:'Wide 16:9', width:960, height:540},
    standard: {label:'Standard 4:3', width:960, height:720},
    'a4-landscape': {label:'A4 landscape', width:960, height:679},
    'a4-portrait': {label:'A4 portrait', width:679, height:960}
  });
  const MAX_HISTORY = 60;
  const COMPONENT_MIME = 'application/x-canvas-component';
  const CLIPBOARD_PREFIX = 'CANVAS_IR_V1:';
  const PASTEBOARD_MARGIN = 360;
  const stageMargin = () => IS_SHOWCASE_MODE ? 40 : PASTEBOARD_MARGIN;
  // Keep a scrollable buffer on every axis. A short/landscape slide can fit
  // vertically while still overflowing horizontally; without this buffer the
  // pan tool has no Y scroll range at all.
  const PAN_VIEWPORT_GUTTER = 240;
  const showcaseZoom = () => {const v=document.getElementById('canvasViewport'),s=state.project?.slides?.[state.activeSlide]||{width:960,height:540};return Math.min(1.08,Math.max(.2,Math.min(((v?.clientWidth||window.innerWidth)-48)/(s.width+80),((v?.clientHeight||800)-40)/(s.height+80))));};
  const SHAPE_LIBRARY = Object.freeze([
    {kind:'rectangle', label:'사각형', glyph:'□'},
    {kind:'rounded', label:'둥근 사각형', glyph:'▢'},
    {kind:'oval', label:'타원', glyph:'○'},
    {kind:'triangle', label:'삼각형', glyph:'△'},
    {kind:'diamond', label:'마름모', glyph:'◇'},
    {kind:'hexagon', label:'육각형', glyph:'⬡'},
    {kind:'right-arrow', label:'오른쪽 화살표', glyph:'➜'},
    {kind:'chevron', label:'갈매기형', glyph:'❯'},
    {kind:'callout', label:'설명선', glyph:'▰'}
  ]);
  const SYMBOLS = Object.freeze(['©','®','™','✓','✕','●','○','◆','◇','→','←','↑','↓','±','×','÷','§','※','₩','€','∞','∑','Ω','Δ']);
  // Proposal recipes are a semantic layer for presentation slides.
  // A recipe never changes canvas geometry until an explicit apply creates a tracked slide brief.
  const PROPOSAL_RECIPES = Object.freeze([
    {id:'proposal-understanding',label:'사업 이해',purpose:'발주기관의 문제와 이번 의사결정의 이유를 한 장에서 고정합니다.',emphasis:'문제 → 영향 → 결정',evidence:'RFP 사업목적·현황 근거'},
    {id:'proposal-requirement-map',label:'요구사항 대응',purpose:'요구사항, 대응전략, 산출물을 1:1로 연결합니다.',emphasis:'요구사항 → 대응 → 산출물',evidence:'요구사항 ID·평가기준'},
    {id:'proposal-differentiator',label:'차별화',purpose:'경쟁 대안과 비교 가능한 차별점을 근거와 함께 제시합니다.',emphasis:'비교 → 선택 근거',evidence:'벤치마크·실적·제약'},
    {id:'proposal-approach',label:'수행 전략',purpose:'단계·역할·산출물을 실행 흐름으로 설명합니다.',emphasis:'방법 → 통제 → 검증',evidence:'수행계획·WBS·품질계획'},
    {id:'proposal-architecture',label:'서비스 구조',purpose:'사용자·운영·데이터·통제 구조를 연결합니다.',emphasis:'구조 → 흐름 → 운영',evidence:'요구사항·아키텍처 근거'},
    {id:'proposal-governance',label:'일정·거버넌스',purpose:'일정, 역할, 위험 대응과 승인 구조를 명확히 합니다.',emphasis:'일정 → 책임 → 리스크',evidence:'WBS·투입계획·위험대장'},
    {id:'proposal-assurance',label:'품질·보안',purpose:'검증·접근성·보안·운영 품질을 측정 가능하게 제시합니다.',emphasis:'기준 → 검증 → 개선',evidence:'품질/보안 요구사항·시험계획'},
    {id:'proposal-proof',label:'정량·실적 증빙',purpose:'수치와 실적을 발행기관·기간·제약과 함께 제시합니다.',emphasis:'증빙 → 해석 → 신뢰',evidence:'정량 증빙·실적 원본'},
    {id:'proposal-outcome',label:'기대효과·Ask',purpose:'근거가 있는 기대효과와 평가자에게 요청할 결정을 정리합니다.',emphasis:'효과 → 조건 → Ask',evidence:'RFP 목표·KPI·제안 범위'}
  ]);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

  function textObject(name, content, x, y, w, h, style = {}, extra = {}) {
    return {
      id: uid('text'), type: 'text', name, content, x, y, w, h, z: 10,
      style: {
        fontFamily: 'Pretendard, Noto Sans KR, sans-serif', fontSize: 18, fontWeight: 400,
        color: '#222320', textAlign: 'left', lineHeight: 1.45, background: 'transparent',
        borderColor: 'transparent', borderWidth: 0, radius: 0, padding: 0,
        ...style
      },
      ...extra
    };
  }

  function shapeObject(name, x, y, w, h, style = {}, extra = {}) {
    return {
      id: uid('shape'), type: 'shape', name, x, y, w, h, z: 1,
      style: { fill: '#f1f0ec', borderColor: '#d5d4cf', borderWidth: 1, radius: 0, opacity: 1, ...style },
      ...extra
    };
  }

  function pathObject(name, x, y, w, h, points, style = {}, extra = {}) {
    return {
      id: uid('path'), type: 'path', name, x, y, w, h, z: 10,
      points: points || [{x:0, y:0}, {x:w, y:h}],
      style: {stroke:'#315ce7', strokeWidth:3, fill:'none', opacity:1, ...style},
      ...extra
    };
  }

  function createDefaultProject() { return createShowcaseProject(); }

  function createShowcaseProject() {
    const text=(id,name,content,x,y,w,h,size=18,extra={})=>({id,type:'text',name,content,x,y,w,h,z:5,role:id==='headline'?'heading':'body',style:{fontFamily:'Arial, sans-serif',fontSize:size,fontWeight:400,color:'#303B38',textAlign:'left',lineHeight:1.12,background:'transparent',borderColor:'transparent',borderWidth:0,radius:0,padding:0},...extra});
    const shape=(id,name,x,y,w,h,fill,kind='rectangle',extra={})=>({id,type:'shape',name,x,y,w,h,z:2,kind,style:{fill,borderColor:'transparent',borderWidth:0,radius:kind==='oval'?999:0,opacity:1},...extra});
    return {version:3,editingMode:'pptx',id:'northstar',name:'Northstar — a calmer workday',fileName:'northstar-workday',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',slides:[{id:'slide-1',title:'A calmer workday',background:'#F5F3EA',notes:'Northstar is an invented studio used in this sample presentation.',sizePreset:'wide',width:960,height:540,sectionId:'section-1',masterId:'master-1',layoutId:'layout-1',objects:[
      shape('paper','Paper',0,0,960,540,'#F5F3EA'),
      text('wordmark','Wordmark','N O R T H S T A R',54,44,340,28,14),
      text('edition','Edition','SPACES FOR A CALMER WORKDAY',580,48,330,22,10),
      text('headline','Headline','A little space.\nA better day.',54,135,525,160,62),
      text('body','Description','A place to focus, connect, and find your rhythm.\nMake room for the work that matters.',58,331,485,64,16),
      shape('accent-panel','Brand panel',618,130,280,312,'#727F76','rectangle',{role:'accent-fill'}),
      shape('arch','Soft arch',654,165,210,250,'#D5DBC1','oval'),
      shape('arch-cutout','Arch opening',690,201,140,222,'#F5F3EA','oval'),
      shape('arch-foot','Arch base',654,323,210,100,'#D5DBC1'),
      shape('door','Open doorway',690,281,140,142,'#F5F3EA'),
      shape('sun','Morning light',744,234,40,40,'#E7AA62','oval'),
      shape('button','Visit card',58,433,224,43,'transparent','rectangle',{role:'primary-action',style:{fill:'transparent',borderColor:'#727F76',borderWidth:1.5,radius:0,opacity:1}}),
      text('button-label','Visit label','FIND YOUR NEXT SPACE   ↗',75,448,208,22,10),
      text('footnote','Footer','A quieter kind of ambition.',625,477,285,22,12)
    ]}],sections:[{id:'section-1',name:'Northstar',collapsed:false}],masters:[{id:'master-1',title:'Northstar',background:'#F5F3EA',sizePreset:'wide',width:960,height:540,objects:[],layouts:[{id:'layout-1',name:'Blank',background:'#F5F3EA',sizePreset:'wide',width:960,height:540,objects:[]}]}],themes:[],comments:[],components:[],designSystem:null,conversation:[],tweaks:{descriptionWidth:24,radius:4,density:100,accent:'#727F76'}};
  }

  const state = {
    project: null,
    activeSlide: 0,
    activeMaster: 0,
    activeLayoutId: null,
    selectedIds: [],
    editorMode: 'pptx',
    mode: 'edit',
    viewMode: 'normal',
    showRulers: true,
    editPanel: 'simple',
    tool: 'select',
    editBaseline: null,
    inspectorTab: 'properties',
    zoom: 0.72,
    history: [],
    future: [],
    drag: null,
    pan: null,
    spaceDown: false,
    suppressPanelClick: null,
    layerDragId: null,
    slideDragId: null,
    sectionDragId: null,
    suppressStageClick: false,
    chatCollapsed: false,
    railCollapsed: false,
    saveTimer: null,
    toastTimer: null,
    presentSlide: 0,
    showResolved: false,
    activeCommentId: null,
    commentDraft: null,
    commentAttachment: null,
    commentDrawing: null,
    pathDrawing: null,
    clipboard: null,
    recipeDraft: null,
    viewportPanInitialized: false,
    designSyncPreview: null,
    showcase: {phase:'ready', busy:null, contractSummary:null, changes:[], provenance:null, openai:{checked:false,available:false,model:null}, aiReview:null, aiRepairs:[], roundTrip:null, error:null, errorStage:null, operationEpoch:0}
  };

  function loadProject() {
    if (IS_SHOWCASE_MODE) {
      state.project = createShowcaseProject();
      state.activeSlide = 0;
      state.zoom = showcaseZoom();
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.project?.slides?.length) {
        state.project = saved.project;
        state.activeSlide = clamp(saved.activeSlide || 0, 0, state.project.slides.length - 1);
        state.zoom = saved.zoom || 0.72;
        return;
      }
    } catch (error) {
      console.warn('Saved project was invalid; using default.', error);
    }
    state.project = createDefaultProject();
  }

  function normalizeProject() {
    state.project.version = Math.max(3, Number(state.project.version || 1));
    state.project.editingMode = ['pptx','figma'].includes(state.project.editingMode) ? state.project.editingMode : 'pptx';
    state.editorMode = state.project.editingMode;
    ensureImportReview();
    state.project.comments ||= [];
    state.project.components ||= [];
    state.project.designSystemApplications ||= [];
    state.project.sourceComponentCatalogs ||= [];
    if (!('designSystem' in state.project)) state.project.designSystem = null;
    state.project.themes ||= [];
    const firstSlide = state.project.slides[0];
    state.project.sections ||= [{id:uid('section'), name:'Section 1', collapsed:false}];
    if (!state.project.sections.length) state.project.sections.push({id:uid('section'), name:'Section 1', collapsed:false});
    state.project.masters ||= [{id:uid('master'), title:'Office Theme Master', background:'#ffffff', sizePreset:firstSlide?.sizePreset || 'wide', width:firstSlide?.width || STAGE_W, height:firstSlide?.height || STAGE_H, objects:[]}];
    state.project.comments.forEach(comment => {
      comment.replies ||= [];
      comment.w ||= 0;
      comment.h ||= 0;
      comment.createdAt ||= new Date().toISOString();
    });
    state.project.tweaks ||= {descriptionWidth:24, radius:4, density:100, accent:'#315ce7'};
    state.project.masters.forEach(master => {
      master.title ||= 'Slide Master'; master.background ||= '#ffffff'; master.objects ||= [];
      master.sizePreset ||= firstSlide?.sizePreset || 'wide'; master.width ||= firstSlide?.width || STAGE_W; master.height ||= firstSlide?.height || STAGE_H;
      master.layouts = (master.layouts || []).map((layout,index) => typeof layout === 'string' ? {id:uid('layout'),name:layout,background:master.background,objects:[],sizePreset:master.sizePreset,width:master.width,height:master.height} : {...layout,id:layout.id||uid('layout'),name:layout.name||`Layout ${index+1}`,background:layout.background||master.background,objects:layout.objects||[],sizePreset:layout.sizePreset||master.sizePreset,width:layout.width||master.width,height:layout.height||master.height});
      if(!master.layouts.length)master.layouts.push({id:uid('layout'),name:'Blank layout',background:master.background,objects:[],sizePreset:master.sizePreset,width:master.width,height:master.height});
    });
    state.project.slides.forEach(slide => {
      slide.sizePreset ||= 'wide';
      slide.width ||= SLIDE_PRESETS[slide.sizePreset]?.width || STAGE_W;
      slide.height ||= SLIDE_PRESETS[slide.sizePreset]?.height || STAGE_H;
      slide.sectionId ||= state.project.sections[0].id;
      slide.masterId ||= state.project.masters[0].id;
      const master=state.project.masters.find(item=>item.id===slide.masterId)||state.project.masters[0];
      slide.layoutId ||= master.layouts?.[0]?.id || '';
    });
    state.activeMaster = clamp(state.activeMaster, 0, state.project.masters.length - 1);
  }

  function ensureImportReview() {
    const report = state.project?.importReport;
    if (!report || report.schema !== 'canvas-import-report/1' || !report.sourceSha256) return;
    const sourceChanged = state.project.importReview?.sourceSha256 !== report.sourceSha256;
    if (!state.project.importReview || sourceChanged) {
      state.project.importReview = {
        schema: 'canvas-import-review/1',
        sourceSha256: report.sourceSha256,
        candidates: (report.warnings || []).map((warning, index) => ({
          id: `${warning.code || 'review'}-${index}`,
          code: warning.code || 'import-review',
          severity: warning.severity || 'review',
          message: warning.message || '내보내기 전 검토가 필요합니다.',
          decision: 'pending',
          decidedAt: null,
        })),
      };
    }
  }

  function setImportReviewDecision(candidateId, decision) {
    const candidate = state.project.importReview?.candidates?.find(item => item.id === candidateId);
    if (!candidate || !['reviewed', 'hold'].includes(decision)) return;
    checkpoint(`원본 잠금선 검토: ${candidate.code}`);
    candidate.decision = decision;
    candidate.decidedAt = new Date().toISOString();
    renderInspector(); scheduleSave();
    toast(decision === 'reviewed' ? '검토 후보를 확인 완료로 기록했습니다.' : '검토 후보를 보류로 기록했습니다.');
  }

  function scheduleSave() {
    if (IS_SHOWCASE_MODE) {
      $('#saveStatus').textContent = 'Showcase session · not persisted';
      return;
    }
    $('#saveStatus').textContent = '저장 중…';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      state.project.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({project: state.project, activeSlide: state.activeSlide, zoom: state.zoom}));
        $('#saveStatus').textContent = '로컬에 저장됨';
      } catch (error) {
        console.warn('Local storage quota exceeded; use JSON export.', error);
        $('#saveStatus').textContent = 'JSON 내보내기 필요';
      }
    }, 180);
  }

  function checkpoint(label) {
    state.history.push({label, project: JSON.stringify(state.project), activeSlide: state.activeSlide});
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future = [];
    updateHistoryButtons();
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return toast('실행 취소할 변경이 없습니다.');
    state.future.push({label: previous.label, project: JSON.stringify(state.project), activeSlide: state.activeSlide});
    state.project = JSON.parse(previous.project);
    state.activeSlide = clamp(previous.activeSlide, 0, state.project.slides.length - 1);
    state.selectedIds = [];
    renderAll();
    scheduleSave();
    toast(`실행 취소: ${previous.label}`);
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return toast('다시 실행할 변경이 없습니다.');
    state.history.push({label: next.label, project: JSON.stringify(state.project), activeSlide: state.activeSlide});
    state.project = JSON.parse(next.project);
    state.activeSlide = clamp(next.activeSlide, 0, state.project.slides.length - 1);
    state.selectedIds = [];
    renderAll();
    scheduleSave();
    toast(`다시 실행: ${next.label}`);
  }

  function currentSlide() { return state.project.slides[state.activeSlide]; }
  function activeMaster() { return state.project.masters[state.activeMaster] || state.project.masters[0]; }
  function activeLayout() { return activeMaster()?.layouts?.find(layout => layout.id === state.activeLayoutId) || null; }
  function activeSlide() { return state.viewMode === 'master' ? (activeLayout() || activeMaster()) : currentSlide(); }
  function masterForSlide(slide = currentSlide()) { return state.project.masters.find(master => master.id === slide?.masterId) || state.project.masters[0]; }
  function layoutForSlide(slide = currentSlide()) { return masterForSlide(slide)?.layouts?.find(layout => layout.id === slide?.layoutId) || null; }
  function inheritedObjects(slide = currentSlide()) {
    const visible = objects => (objects || []).filter(object => !object.placeholder);
    return [...visible(masterForSlide(slide)?.objects), ...visible(layoutForSlide(slide)?.objects)];
  }
  function stageWidth(slide = activeSlide()) { return slide.width || STAGE_W; }
  function stageHeight(slide = activeSlide()) { return slide.height || STAGE_H; }
  function selectedObjects() { return activeSlide().objects.filter(object => state.selectedIds.includes(object.id)); }
  function selectedObject() { return selectedObjects()[0] || null; }

  function expandGroupedIds(ids) {
    const selected = new Set(ids);
    const groupIds = new Set(activeSlide().objects.filter(object => selected.has(object.id) && object.groupId).map(object => object.groupId));
    activeSlide().objects.forEach(object => { if (object.groupId && groupIds.has(object.groupId)) selected.add(object.id); });
    let found = true;
    while (found) {
      found = false;
      activeSlide().objects.forEach(object => { if (object.parentId && selected.has(object.parentId) && !selected.has(object.id)) { selected.add(object.id); found = true; } });
    }
    return [...selected];
  }

  function groupSelection() {
    const objects = selectedObjects();
    if (objects.length < 2) return toast('그룹화할 객체를 2개 이상 선택하세요.');
    checkpoint('객체 그룹화');
    const groupId = uid('group');
    const groupName = `Group ${activeSlide().objects.filter(object => object.groupId).map(object => object.groupId).filter((id,index,array)=>array.indexOf(id)===index).length + 1}`;
    objects.forEach(object => { object.groupId = groupId; object.groupName = groupName; });
    state.selectedIds = objects.map(object => object.id);
    renderAll(); scheduleSave(); toast(`${objects.length}개 객체를 그룹화했습니다. Ctrl+Shift+G로 해제할 수 있습니다.`);
  }

  function ungroupSelection() {
    const groupIds = new Set(selectedObjects().map(object => object.groupId).filter(Boolean));
    if (!groupIds.size) return toast('그룹 객체를 선택하세요.');
    checkpoint('객체 그룹 해제');
    const affected = activeSlide().objects.filter(object => groupIds.has(object.groupId));
    affected.forEach(object => { delete object.groupId; delete object.groupName; });
    state.selectedIds = affected.map(object => object.id);
    renderAll(); scheduleSave(); toast(`${affected.length}개 객체의 그룹을 해제했습니다.`);
  }

  function reorderLayer(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const ordered = [...activeSlide().objects].sort((a,b) => (b.z || 0) - (a.z || 0));
    const from = ordered.findIndex(object => object.id === draggedId);
    if (from < 0) return;
    const [dragged] = ordered.splice(from, 1);
    const to = ordered.findIndex(object => object.id === targetId);
    if (to < 0) return;
    checkpoint(`레이어 순서: ${dragged.name}`);
    ordered.splice(to, 0, dragged);
    ordered.forEach((object, index) => { object.z = ordered.length - index; });
    state.selectedIds = expandGroupedIds([dragged.id]);
    renderStage(); renderInspector(); scheduleSave();
  }

  function renderAll() {
    renderHeader();
    renderMessages();
    renderSlideList();
    renderStage();
    renderInspector();
    updateModeUI();
    updateHistoryButtons();
    renderShowcase();
  }

  function showcaseStepState(element, status) {
    element.classList.toggle('is-current', status === 'current');
    element.classList.toggle('is-complete', status === 'complete');
    element.classList.toggle('is-failed', status === 'failed');
    element.classList.toggle('is-skipped', status === 'skipped');
  }

  function renderShowcase() {
    if (!IS_SHOWCASE_MODE) return;
    const d=state.showcase, loaded=Boolean(d.contractSummary), applied=Boolean(d.provenance), busy=Boolean(d.busy);
    $('#app').classList.add('is-showcase');$('.editor-shell').classList.add('showcase-open');$('#showcasePanel').classList.remove('is-hidden');
    const load=$('#showcaseLoad'),apply=$('#showcaseApply'),trip=$('#showcaseRoundTrip');
    load.disabled=busy;load.textContent=loaded?'Reload sample rules':'Load sample rules';
    apply.disabled=!loaded||busy;apply.textContent=selectedObjects().length?'Apply to selection':'Apply to slide';
    trip.disabled=busy;trip.textContent=d.busy==='showcaseRoundTrip'?'Opening PPTX…':'Export & reopen';
    $('#showcaseContractMeta').textContent=loaded?d.contractSummary.fileName:'Northstar · DESIGN.md';
    $('#showcaseApplyMeta').textContent=loaded?'Ready to apply':"Load rules or choose your own DESIGN.md.";
    const diffs=$('#showcaseDiffs');diffs.replaceChildren();
    const changes=applied?d.changes:loaded?previewDesignSystemTokens('auto').changes:[];
    $('#showcaseDiffCount').textContent=changes.length;
    $('#changeHeading').textContent=applied?'Applied changes':'Changes to apply';
    if(!changes.length){const p=document.createElement('p');p.className='empty-changes';p.textContent=loaded?'The current selection matches these rules.':'Load brand rules to see exactly what will change.';diffs.appendChild(p);}
    changes.forEach(c=>{const row=document.createElement('div');row.className='change-row';const head=document.createElement('strong');head.textContent=c.objectName;const prop=document.createElement('small');prop.textContent=c.property.replace('style.','');const vals=document.createElement('div');vals.className='change-values';const before=document.createElement('span'),after=document.createElement('span');before.textContent=String(c.before);after.textContent=String(c.after);vals.append(before,document.createTextNode('→'),after);row.append(head,prop,vals);diffs.appendChild(row);});
    $('#showcaseStatus').textContent=d.error?d.error:d.roundTrip?.pass?`Reopened ${d.roundTrip.slides} slide${d.roundTrip.slides===1?'':'s'} with ${d.roundTrip.editableObjects} editable objects.`:applied?`${d.changes.length} changes applied. Continue editing or download your presentation.`:loaded?'Rules loaded. Your slide is unchanged until you apply them.':'Select any object to edit. Double-click text to write.';
    $('#showcaseStatus').classList.toggle('is-error',Boolean(d.error));
    $('#saveStatus').textContent='In this browser session';
    if($('#publicFileName'))$('#publicFileName').textContent=state.project.name;
    document.dispatchEvent(new CustomEvent('contractstate'));
  }

  function centerShowcaseCanvas() {
    if (!IS_SHOWCASE_MODE) return;
    requestAnimationFrame(() => {
      const viewport = $('#canvasViewport');
      if (!viewport) return;
      const frameStart = stageMargin() * state.zoom;
      viewport.scrollLeft = Math.max(0, frameStart - 24);
      viewport.scrollTop = Math.max(0, frameStart - 16);
    });
  }

  function renderHeader() {
    $('#projectLabel').textContent = state.project.name;
    $('#projectNameInput').value = state.project.name;
    $('#fileName').textContent = state.project.fileName || state.project.name;
    $('#pageCount').textContent = `${state.project.slides.length} pages`;
    const masterSurface = activeLayout() ? `Layout · ${activeLayout().name}` : `Master ${state.activeMaster + 1} / ${state.project.masters.length}`;
    $('#slideCounter').textContent = state.viewMode === 'master' ? masterSurface : `${state.activeSlide + 1} / ${state.project.slides.length}`;
    $('#speakerNotes').value = state.viewMode === 'master' ? `${activeLayout() ? '레이아웃' : '마스터'} 편집 중 · 연결 슬라이드에 표시됩니다.` : (currentSlide().notes || '');
    $('#speakerNotes').disabled = state.viewMode === 'master' || state.viewMode === 'sorter';
    $('#zoomRange').value = Math.round(state.zoom * 100);
    $('#zoomValue').textContent = `${Math.round(state.zoom * 100)}%`;
    $('#stageScaler').style.setProperty('--zoom', state.zoom);
    $('#slideStage').style.setProperty('--zoom', state.zoom);
    if (state.viewMode !== 'sorter') {
      $('#stageScaler').style.width = `${(stageWidth() + stageMargin() * 2) * state.zoom}px`;
      $('#stageScaler').style.height = `${(stageHeight() + stageMargin() * 2) * state.zoom}px`;
    }
    $$('.view-tools button').forEach(button => button.classList.toggle('is-active', button.dataset.viewMode === state.viewMode));
    $$('.surface-mode-tools button').forEach(button=>button.classList.toggle('is-active',button.dataset.editorMode===state.editorMode));
    $('#app').dataset.editorMode=state.editorMode;
    $('#canvasWorkarea').classList.toggle('has-rulers', state.showRulers && state.viewMode !== 'sorter');
    $('#rulerButton').classList.toggle('is-active', state.showRulers);
  }

  function renderMessages() {
    const root = $('#chatMessages');
    root.replaceChildren();
    (state.project.conversation || []).forEach(message => {
      const item = document.createElement('article');
      item.className = `message ${message.role}`;
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.textContent = message.role === 'user' ? 'You' : message.role === 'action' ? 'Applied' : 'Canvas Studio';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = message.text;
      item.append(meta, bubble);
      root.append(item);
    });
    root.scrollTop = root.scrollHeight;
  }

  // Dynamic innerHTML below is limited to fixed templates; every imported/user string is passed through escapeHTML().
  function renderSlideList() {
    const root = $('#slideList');
    root.replaceChildren();
    if (state.viewMode === 'master') {
      state.project.masters.forEach((master, index) => {
        const button = document.createElement('button');
        button.className = `slide-thumb ${index === state.activeMaster && !state.activeLayoutId ? 'is-active' : ''}`;
        button.innerHTML = `<span class="slide-thumb-number">M${index + 1}</span><span class="slide-thumb-preview" data-title="${escapeHTML(master.title)}"><i class="thumb-band"></i><i class="thumb-block"></i><i class="thumb-line"></i></span>`;
        $('.slide-thumb-preview', button).style.aspectRatio = `${stageWidth(master)} / ${stageHeight(master)}`;
        button.addEventListener('click', () => { state.activeMaster=index; state.activeLayoutId=null; state.selectedIds=[]; renderAll(); });
        root.append(button);
        (master.layouts||[]).forEach((layout,layoutIndex)=>{
          const layoutButton=document.createElement('button');
          layoutButton.className=`slide-thumb layout-thumb ${layout.id===state.activeLayoutId?'is-active':''}`;
          layoutButton.innerHTML=`<span class="slide-thumb-number">L${layoutIndex+1}</span><span class="slide-thumb-preview" data-title="${escapeHTML(layout.name)}"><i class="thumb-band"></i><i class="thumb-block"></i><i class="thumb-line"></i></span>`;
          $('.slide-thumb-preview',layoutButton).style.aspectRatio=`${stageWidth(master)} / ${stageHeight(master)}`;
          layoutButton.addEventListener('click',()=>{state.activeMaster=index;state.activeLayoutId=layout.id;state.selectedIds=[];renderAll();});
          root.append(layoutButton);
        });
      });
      return;
    }
    state.project.sections.forEach((section, sectionIndex) => {
      const wrapper = document.createElement('section'); wrapper.className='slide-section'; wrapper.dataset.sectionId=section.id;
      const heading = document.createElement('header'); heading.className='section-heading'; heading.draggable=true;
      heading.innerHTML = `<span class="section-grip">⋮⋮</span><button class="section-name" title="더블클릭하여 이름 변경">${escapeHTML(section.name)}</button><button class="section-action" data-section-move="up" title="위로 이동">↑</button><button class="section-action" data-section-move="down" title="아래로 이동">↓</button><button class="section-action section-delete" title="섹션 삭제">×</button>`;
      $('.section-name',heading).addEventListener('click',()=>{section.collapsed=!section.collapsed;renderSlideList();scheduleSave();});
      $('.section-name',heading).addEventListener('dblclick',event=>{event.stopPropagation();const name=window.prompt('섹션 이름',section.name)?.trim();if(name){checkpoint('섹션 이름 변경');section.name=name;renderSlideList();scheduleSave();}});
      $$('[data-section-move]',heading).forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();moveSection(section.id,button.dataset.sectionMove==='up'?-1:1);}));
      $('.section-delete',heading).addEventListener('click',event=>{event.stopPropagation();deleteSection(section.id);});
      heading.addEventListener('dragstart',event=>{state.sectionDragId=section.id;heading.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`section:${section.id}`);});
      heading.addEventListener('dragover',event=>{if(!state.sectionDragId)return;event.preventDefault();heading.classList.add('is-drop-target');});
      heading.addEventListener('dragleave',()=>heading.classList.remove('is-drop-target'));
      heading.addEventListener('drop',event=>{event.preventDefault();heading.classList.remove('is-drop-target');reorderSection(state.sectionDragId,section.id);});
      heading.addEventListener('dragend',()=>{state.sectionDragId=null;heading.classList.remove('is-dragging');});
      wrapper.append(heading);
      if (!section.collapsed) state.project.slides.forEach((slide, index) => {
        if (slide.sectionId !== section.id) return;
        const button = document.createElement('button');
        button.className = `slide-thumb ${index === state.activeSlide ? 'is-active' : ''}`;
        button.dataset.index = index; button.draggable=true;
        button.innerHTML = `<span class="slide-thumb-number">${index + 1}</span><span class="slide-thumb-preview" data-title="${escapeHTML(slide.title)}"><i class="thumb-band"></i><i class="thumb-block"></i><i class="thumb-line"></i></span>`;
        $('.slide-thumb-preview', button).style.aspectRatio = `${stageWidth(slide)} / ${stageHeight(slide)}`;
        button.addEventListener('click', () => setActiveSlide(index));
        button.addEventListener('dblclick', () => duplicateSlide(index));
        button.addEventListener('dragstart',event=>{state.slideDragId=slide.id;button.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`slide:${slide.id}`);});
        button.addEventListener('dragover',event=>{if(!state.slideDragId)return;event.preventDefault();button.classList.add('is-drop-target');});
        button.addEventListener('dragleave',()=>button.classList.remove('is-drop-target'));
        button.addEventListener('drop',event=>{event.preventDefault();button.classList.remove('is-drop-target');reorderSlide(state.slideDragId,slide.id,section.id);});
        button.addEventListener('dragend',()=>{state.slideDragId=null;button.classList.remove('is-dragging');});
        wrapper.append(button);
      });
      root.append(wrapper);
    });
  }

  function objectStyle(object) {
    const style = object.style || {};
    return {
      left: `${object.x}px`, top: `${object.y}px`, width: `${object.w}px`, height: `${object.h}px`,
      zIndex: object.z || 1, transform: object.rotation ? `rotate(${object.rotation}deg)` : 'none',
      fontFamily: style.fontFamily, fontSize: `${style.fontSize || 14}px`, fontWeight: style.fontWeight || 400,
      color: style.color || '#222320', textAlign: style.textAlign || 'left', lineHeight: style.lineHeight || 1.4,
      letterSpacing: `${style.letterSpacing || 0}px`, textDecoration: style.strike ? 'line-through' : 'none',
      background: object.type === 'text' ? (style.background || 'transparent') : undefined,
      border: object.type === 'text' && style.borderWidth ? `${style.borderWidth}px solid ${style.borderColor}` : undefined,
      borderRadius: object.type === 'text' ? `${style.radius || 0}px` : undefined,
      padding: object.type === 'text' ? `${style.padding || 0}px` : undefined,
      display: object.type === 'text' ? 'block' : undefined,
      overflow: object.type === 'text' ? (style.overflow || 'hidden') : undefined,
      opacity: style.opacity ?? 1
    };
  }

  function textLayoutMetrics(object) {
    const style=object.style||{};
    return JSON.stringify([object.w,style.fontSize,style.fontFamily,style.fontWeight,style.letterSpacing||0]);
  }

  function fittedObjectText(object) {
    const content=String(object.content||''),lines=object.textLines;
    if(!Array.isArray(lines)||!lines.every(line=>typeof line==='string'))return null;
    if(lines.join('')!==content.replace(/\r\n?|\n/g,''))return null;
    if(object.textLayoutMetrics&&object.textLayoutMetrics!==textLayoutMetrics(object))return null;
    return lines.join('\n');
  }

  function makeObjectElement(object, interactive = true, offset = {x:0,y:0}) {
    const element = document.createElement('div');
    element.className = `canvas-object ${state.selectedIds.includes(object.id) && interactive ? 'is-selected' : ''}`;
    element.dataset.id = object.id;
    element.dataset.type = object.type;
    element.dataset.name = object.name;
    if (object.kind) element.dataset.shapeKind = object.kind;
    if (object.componentKind) element.dataset.componentKind = object.componentKind;
    if (object.layout?.mode) element.dataset.layoutMode = object.layout.mode;
    Object.assign(element.style, objectStyle(object));
    element.style.left = `${object.x + offset.x}px`;
    element.style.top = `${object.y + offset.y}px`;

    if (object.type === 'text') {
      const fittedText=fittedObjectText(object);
      element.textContent = fittedText ?? object.content ?? '';
      if(fittedText!==null)element.style.whiteSpace='pre';
    } else if (object.type === 'shape') {
      const content = document.createElement('div');
      content.className = 'shape-content';
      content.style.background = object.style.fill || '#f1f0ec';
      content.style.border = `${object.style.borderWidth || 0}px solid ${object.style.borderColor || 'transparent'}`;
      content.style.borderRadius = `${object.style.radius || 0}px`;
      element.append(content);
    } else if (object.type === 'image') {
      const image = document.createElement('img');
      image.src = object.src;
      image.alt = object.alt || object.name || 'Imported image';
      image.draggable = false;
      image.style.objectFit = object.style?.objectFit || 'cover';
      image.style.setProperty('--crop-zoom', object.style?.cropZoom || 1);
      image.style.setProperty('--crop-x', `${object.style?.cropX ?? 50}%`);
      image.style.setProperty('--crop-y', `${object.style?.cropY ?? 50}%`);
      element.style.setProperty('--crop-zoom', object.style?.cropZoom || 1);
      element.style.setProperty('--crop-x', `${object.style?.cropX ?? 50}%`);
      element.style.setProperty('--crop-y', `${object.style?.cropY ?? 50}%`);
      element.append(image);
    } else if (object.type === 'path') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${Math.max(1, object.w)} ${Math.max(1, object.h)}`);
      svg.classList.add('path-content');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', (object.points || []).map(point => `${point.x},${point.y}`).join(' '));
      polyline.setAttribute('fill', object.style?.fill || 'none');
      polyline.setAttribute('stroke', object.style?.stroke || '#315ce7');
      polyline.setAttribute('stroke-width', object.style?.strokeWidth || 3);
      polyline.setAttribute('stroke-linecap', 'round');
      polyline.setAttribute('stroke-linejoin', 'round');
      if (object.arrow) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', `arrowhead-${object.id}`);
        marker.setAttribute('markerWidth', '8'); marker.setAttribute('markerHeight', '6');
        marker.setAttribute('refX', '7'); marker.setAttribute('refY', '3'); marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 8 3, 0 6'); polygon.setAttribute('fill', 'currentColor');
        marker.append(polygon); defs.append(marker);
        svg.style.color = object.style?.stroke || '#315ce7';
        polyline.setAttribute('marker-end', `url(#arrowhead-${object.id})`);
        svg.append(defs);
      }
      svg.append(polyline);
      element.append(svg);
    }

    if (interactive) {
      element.addEventListener('pointerdown', event => startObjectInteraction(event, object));
      if (object.type === 'text' && !object.locked) element.addEventListener('dblclick', event => beginTextEdit(event, object));
      if (state.selectedIds.includes(object.id) && state.mode === 'edit' && !object.locked) {
        const handle = document.createElement('span');
        handle.className = 'resize-handle';
        handle.title = '크기 조절';
        handle.addEventListener('pointerdown', event => startResize(event, object));
        element.append(handle);
      }
    }
    return element;
  }

  function renderSorter(stage) {
    stage.removeAttribute('style');
    stage.className = 'slide-stage is-sorter';
    const rows = Math.max(1, Math.ceil(state.project.slides.length / 3));
    $('#stageScaler').style.width = '1000px';
    $('#stageScaler').style.height = `${rows * 230 + 80}px`;
    state.project.slides.forEach((slide,index) => {
      const card=document.createElement('button'); card.className=`sorter-card ${index===state.activeSlide?'is-active':''}`; card.draggable=true;
      const preview=document.createElement('div'); preview.className='sorter-preview';
      const scale=220/stageWidth(slide); preview.style.height=`${stageHeight(slide)*scale}px`;
      const sheet=document.createElement('div'); sheet.className='sorter-sheet'; sheet.style.width=`${stageWidth(slide)}px`; sheet.style.height=`${stageHeight(slide)}px`; sheet.style.transform=`scale(${scale})`; sheet.style.background=slide.background||'#fff';
      inheritedObjects(slide).sort((a,b)=>(a.z||0)-(b.z||0)).forEach(object=>{const element=makeObjectElement(object,false);element.classList.add('is-master-object');sheet.append(element);});
      [...slide.objects].sort((a,b)=>(a.z||0)-(b.z||0)).forEach(object=>sheet.append(makeObjectElement(object,false)));
      preview.append(sheet);
      const footer=document.createElement('footer'); const number=document.createElement('span'); number.textContent=String(index+1); const title=document.createElement('b'); title.textContent=slide.title; footer.append(number,title);
      card.append(preview,footer);
      card.addEventListener('click',()=>{state.activeSlide=index;setViewMode('normal');});
      card.addEventListener('dragstart',event=>{state.slideDragId=slide.id;card.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';});
      card.addEventListener('dragover',event=>{if(state.slideDragId)event.preventDefault();});
      card.addEventListener('drop',event=>{event.preventDefault();reorderSlide(state.slideDragId,slide.id,slide.sectionId);renderStage();});
      card.addEventListener('dragend',()=>{state.slideDragId=null;card.classList.remove('is-dragging');});
      stage.append(card);
    });
    $('#selectionSummary').textContent=`${state.project.slides.length} slides`;
    $('#selectionPath').textContent='Deck / slide sorter';
    $('#structureStatus').className='structure-pass'; $('#structureStatus').textContent='Multiple slide view';
  }

  function renderStage() {
    const stage = $('#slideStage');
    stage.replaceChildren();
    if (state.viewMode === 'sorter') return renderSorter(stage);
    stage.className = 'slide-stage';
    stage.classList.toggle('is-master-view', state.viewMode === 'master');
    stage.classList.toggle('is-layout-view', state.viewMode === 'master' && Boolean(activeLayout()));
    const margin=stageMargin(),offset={x:margin,y:margin};
    const fullWidth=stageWidth()+margin*2, fullHeight=stageHeight()+margin*2;
    stage.style.width = `${fullWidth}px`; stage.style.height = `${fullHeight}px`; stage.style.background='';
    const viewport=$('#canvasViewport'), scaler=$('#stageScaler');
    // `place-items:center` used to hide this defect: for a landscape slide at
    // normal zoom, the stage was shorter than the viewport, so scrollHeight
    // equalled clientHeight and Space+drag could only pan left/right.
    const minPanWidth=(viewport?.clientWidth||0)+PAN_VIEWPORT_GUTTER*2;
    const minPanHeight=(viewport?.clientHeight||0)+PAN_VIEWPORT_GUTTER*2;
    scaler.style.width = `${Math.max(fullWidth * state.zoom,minPanWidth)}px`;
    scaler.style.height = `${Math.max(fullHeight * state.zoom,minPanHeight)}px`;
    if (!state.viewportPanInitialized) {
      requestAnimationFrame(() => {
        const maxLeft=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
        const maxTop=Math.max(0,viewport.scrollHeight-viewport.clientHeight);
        viewport.scrollLeft=Math.min(PAN_VIEWPORT_GUTTER,maxLeft);
        viewport.scrollTop=Math.min(PAN_VIEWPORT_GUTTER,maxTop);
        state.viewportPanInitialized=true;
      });
    }
    const frame=document.createElement('div'); frame.className='slide-frame'; Object.assign(frame.style,{left:`${offset.x}px`,top:`${offset.y}px`,width:`${stageWidth()}px`,height:`${stageHeight()}px`,background:activeSlide().background||'#fff'}); stage.append(frame);
    stage.classList.toggle('comment-cursor', state.mode === 'comment');
    stage.classList.toggle('draw-cursor', state.mode === 'edit' && state.tool === 'draw');
    stage.classList.toggle('interact-cursor', state.mode === 'edit' && state.tool === 'interact');
    if (state.viewMode === 'normal') inheritedObjects().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(object=>{const element=makeObjectElement(object,false,offset);element.classList.add('is-master-object');stage.append(element);});
    [...activeSlide().objects].sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(object => stage.append(makeObjectElement(object,true,offset)));
    if (state.drag?.kind === 'marquee') {
      const {start, current} = state.drag;
      const marquee = document.createElement('div'); marquee.className = 'selection-marquee';
      Object.assign(marquee.style, {left:`${Math.min(start.x,current.x)+offset.x}px`,top:`${Math.min(start.y,current.y)+offset.y}px`,width:`${Math.abs(current.x-start.x)}px`,height:`${Math.abs(current.y-start.y)}px`}); stage.append(marquee);
    }
    if (state.pathDrawing?.points?.length > 1) {
      const xs = state.pathDrawing.points.map(point => point.x), ys = state.pathDrawing.points.map(point => point.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const draftPath = {id:'draft-path', type:'path', name:'Drawing', x, y, w:Math.max(1, Math.max(...xs)-x), h:Math.max(1, Math.max(...ys)-y), points:state.pathDrawing.points.map(point=>({x:point.x-x,y:point.y-y})), style:{stroke:'#315ce7',strokeWidth:3,fill:'none'}};
      stage.append(makeObjectElement(draftPath, false, offset));
    }
    const comments = state.viewMode === 'normal' ? (state.project.comments || []).filter(comment => comment.slideId === currentSlide().id && (!comment.resolved || state.showResolved)) : [];
    comments.forEach((comment, index) => {
      if (comment.w > 3 || comment.h > 3) { const region = document.createElement('div'); region.className = `comment-region ${comment.resolved ? 'is-resolved' : ''}`; Object.assign(region.style, {left:`${comment.x+offset.x}px`, top:`${comment.y+offset.y}px`, width:`${comment.w}px`, height:`${comment.h}px`}); stage.append(region); }
      const pin = document.createElement('button'); pin.className = `comment-pin ${comment.resolved ? 'is-resolved' : ''}`; pin.style.left = `${comment.x+offset.x}px`; pin.style.top = `${comment.y+offset.y}px`; pin.textContent = index + 1; pin.title = comment.text;
      pin.addEventListener('pointerdown', event => event.stopPropagation()); pin.addEventListener('click', event => {event.stopPropagation();state.activeCommentId=comment.id;state.inspectorTab='comments';renderInspector();}); stage.append(pin);
    });
    if (state.commentDraft) { const draft = document.createElement('div'); draft.className = 'comment-region is-draft'; Object.assign(draft.style, {left:`${state.commentDraft.x+offset.x}px`, top:`${state.commentDraft.y+offset.y}px`, width:`${Math.max(18,state.commentDraft.w||18)}px`, height:`${Math.max(18,state.commentDraft.h||18)}px`}); stage.append(draft); }
    const selected = selectedObject(), selectedCount = state.selectedIds.length, surfaceLabel=state.viewMode==='master'?'Master':'Slide';
    $('#selectionSummary').textContent = selectedCount > 1 ? `${selectedCount} objects selected` : selected ? selected.name : activeSlide().title;
    $('#selectionPath').textContent = selectedCount > 1 ? `${surfaceLabel} / multi-selection${selected?.groupId ? ` / ${selected.groupName || 'group'}` : ''}` : selected ? `${surfaceLabel} / ${selected.type} / ${selected.role || 'element'}` : `${surfaceLabel} / pasteboard`;
    updateStructureStatus();
  }

  function updateStructureStatus() {
    const pasteboard = activeSlide().objects.filter(object => object.x < 0 || object.y < 0 || object.x + object.w > stageWidth() || object.y + object.h > stageHeight());
    const forbidden = activeSlide().objects.filter(object => object.role === 'footer-table' || object.role === 'auxiliary-panel');
    const status = $('#structureStatus');
    status.className = forbidden.length ? 'structure-warn' : 'structure-pass';
    status.textContent = `${pasteboard.length} pasteboard · ${forbidden.length ? `${forbidden.length} extra panel` : 'Structure OK'}`;
  }

  function startObjectInteraction(event, object) {
    if (state.mode === 'comment') return;
    if (state.mode === 'edit' && (state.tool === 'draw' || state.tool === 'interact')) return;
    if (event.target.isContentEditable) return;
    event.stopPropagation();
    focusCanvas();
    const now = Date.now();
    const isDirectTextEdit = object.type === 'text' && !object.locked && state.lastPointer?.id === object.id && now - state.lastPointer.at < 450;
    state.lastPointer = {id:object.id, at:now};
    const before = state.selectedIds.join('|');
    const scopeIds = object.groupId && !event.altKey ? activeSlide().objects.filter(item => item.groupId === object.groupId).map(item => item.id) : [object.id];
    if (!event.shiftKey) state.selectedIds = scopeIds;
    else if (scopeIds.every(id => state.selectedIds.includes(id))) state.selectedIds = state.selectedIds.filter(id => !scopeIds.includes(id));
    else state.selectedIds = [...new Set([...state.selectedIds, ...scopeIds])];
    if (isDirectTextEdit) {
      state.drag = null;
      event.preventDefault();
      event.currentTarget.classList.add('is-selected');
      renderInspector();
      beginTextEdit(event, object, event.currentTarget);
      return;
    }
    if (before !== state.selectedIds.join('|')) renderStage();
    renderInspector();
    if (state.mode !== 'edit' || object.locked || event.button !== 0) return;
    checkpoint(`이동: ${object.name}`);
    state.drag = {
      kind: 'move', startX: event.clientX, startY: event.clientY,
      origins: selectedObjects().map(item => ({id: item.id, x: item.x, y: item.y}))
    };
  }

  function startResize(event, object) {
    event.stopPropagation();
    checkpoint(`크기 조절: ${object.name}`);
    state.drag = {kind: 'resize', startX: event.clientX, startY: event.clientY, id: object.id, w: object.w, h: object.h};
  }

  function handlePointerMove(event) {
    if (state.pan) {
      const dx = event.clientX - state.pan.startX;
      const dy = event.clientY - state.pan.startY;
      state.pan.moved ||= Math.hypot(dx, dy) > 3;
      state.pan.container.scrollLeft = state.pan.scrollLeft - dx;
      state.pan.container.scrollTop = state.pan.scrollTop - dy;
      return;
    }
    if (state.commentDrawing) {
      const point = stagePoint(event);
      const start = state.commentDrawing;
      state.commentDraft = {x:Math.min(start.x, point.x), y:Math.min(start.y, point.y), w:Math.abs(point.x-start.x), h:Math.abs(point.y-start.y)};
      renderStage();
      return;
    }
    if (state.pathDrawing) {
      const point = stagePoint(event);
      const last = state.pathDrawing.points.at(-1);
      if (!last || Math.hypot(point.x-last.x, point.y-last.y) >= 3) state.pathDrawing.points.push(point);
      renderStage();
      return;
    }
    if (!state.drag) return;
    if (state.drag.kind === 'marquee') {
      state.drag.current = stagePoint(event);
      renderStage();
      return;
    }
    const dx = (event.clientX - state.drag.startX) / state.zoom;
    const dy = (event.clientY - state.drag.startY) / state.zoom;
    if (state.drag.kind === 'move') {
      state.drag.origins.forEach(origin => {
        const object = activeSlide().objects.find(item => item.id === origin.id);
        object.x = Math.round(clamp(origin.x + dx, -stageMargin(), stageWidth() + stageMargin() - object.w));
        object.y = Math.round(clamp(origin.y + dy, -stageMargin(), stageHeight() + stageMargin() - object.h));
      });
    } else {
      const object = activeSlide().objects.find(item => item.id === state.drag.id);
      object.w = Math.round(clamp(state.drag.w + dx, 20, stageWidth() + stageMargin() - object.x));
      object.h = Math.round(clamp(state.drag.h + dy, 20, stageHeight() + stageMargin() - object.y));
    }
    renderStage();
    renderInspector();
  }

  function finishPointerInteraction() {
    if (state.pan) {
      const {container, moved} = state.pan;
      state.pan = null;
      container.classList.remove('is-panning');
      if (moved) {
        state.suppressStageClick = true;
        state.suppressPanelClick = container;
        setTimeout(() => { state.suppressStageClick = false; state.suppressPanelClick = null; }, 0);
      }
      return;
    }
    if (state.commentDrawing) {
      state.commentDrawing = null;
      state.inspectorTab = 'comments';
      renderStage(); renderInspector();
      $('#commentText')?.focus();
      return;
    }
    if (state.pathDrawing) {
      const points = state.pathDrawing.points;
      state.pathDrawing = null;
      if (points.length > 1) {
        const xs = points.map(point => point.x), ys = points.map(point => point.y);
        const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(8, Math.max(...xs)-x), h = Math.max(8, Math.max(...ys)-y);
        checkpoint('자유 그리기');
        const object = pathObject('자유 그리기', x, y, w, h, points.map(point=>({x:point.x-x,y:point.y-y})));
        object.z = Math.max(...activeSlide().objects.map(item=>item.z||0),0)+1;
        activeSlide().objects.push(object);
        state.selectedIds = [object.id];
        state.tool = 'select';
        renderAll(); scheduleSave();
      } else renderStage();
      return;
    }
    if (!state.drag) return;
    if (state.drag.kind === 'marquee') {
      const drag = state.drag;
      state.drag = null;
      const left = Math.min(drag.start.x, drag.current.x), right = Math.max(drag.start.x, drag.current.x);
      const top = Math.min(drag.start.y, drag.current.y), bottom = Math.max(drag.start.y, drag.current.y);
      const crossing = drag.current.x < drag.start.x;
      const width = right - left, height = bottom - top;
      let ids = [];
      if (width >= 3 || height >= 3) {
        ids = activeSlide().objects.filter(object => crossing
          ? object.x < right && object.x + object.w > left && object.y < bottom && object.y + object.h > top
          : object.x >= left && object.x + object.w <= right && object.y >= top && object.y + object.h <= bottom
        ).map(object => object.id);
        ids = expandGroupedIds(ids);
      }
      state.selectedIds = drag.additive ? [...new Set([...drag.baseIds, ...ids])] : ids;
      state.suppressStageClick = true;
      setTimeout(() => { state.suppressStageClick = false; }, 0);
      renderStage(); renderInspector();
      return;
    }
    state.drag = null;
    scheduleSave();
  }

  function stagePoint(event) {
    const rect = $('#slideStage').getBoundingClientRect();
    return {
      x: Math.round(clamp((event.clientX - rect.left) / state.zoom - stageMargin(), -stageMargin(), stageWidth() + stageMargin())),
      y: Math.round(clamp((event.clientY - rect.top) / state.zoom - stageMargin(), -stageMargin(), stageHeight() + stageMargin()))
    };
  }

  function beginPan(event, container) {
    state.pan = {container, startX:event.clientX, startY:event.clientY, scrollLeft:container.scrollLeft, scrollTop:container.scrollTop, moved:false};
    container.classList.add('is-panning');
    event.preventDefault();
    event.stopPropagation();
  }

  function focusCanvas() {
    const viewport = $('#canvasViewport');
    if (document.activeElement !== viewport) viewport.focus({preventScroll:true});
  }

  function isCanvasKeyboardContext(event) {
    const viewport = $('#canvasViewport');
    return document.activeElement === viewport || viewport.contains(document.activeElement) || event.target === viewport || Boolean(event.target.closest?.('#canvasViewport'));
  }

  function panViewportByKey(dx, dy) {
    const viewport = $('#canvasViewport');
    const beforeLeft = viewport.scrollLeft, beforeTop = viewport.scrollTop;
    viewport.scrollLeft = clamp(beforeLeft + dx, 0, Math.max(0, viewport.scrollWidth - viewport.clientWidth));
    viewport.scrollTop = clamp(beforeTop + dy, 0, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
    return viewport.scrollLeft !== beforeLeft || viewport.scrollTop !== beforeTop;
  }

  function startViewportPan(event) {
    const viewport = $('#canvasViewport');
    const blankDrag = event.button === 0 && event.target === viewport;
    const handDrag = event.button === 0 && (state.spaceDown || state.tool === 'interact');
    if (event.button !== 1 && !blankDrag && !handDrag) return;
    focusCanvas();
    beginPan(event, viewport);
  }

  function bindPanelDragScroll(container, allowButtonDrag = false) {
    container.addEventListener('click', event => {
      if (state.suppressPanelClick !== container) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    container.addEventListener('pointerdown', event => {
      const blockers = allowButtonDrag ? 'input,textarea,select,a,[contenteditable="true"],[draggable="true"]' : 'button,input,textarea,select,a,[contenteditable="true"],[draggable="true"]';
      const interactive = event.target.closest(blockers);
      if (event.button !== 1 && (event.button !== 0 || interactive)) return;
      beginPan(event, container);
    });
  }

  function startStagePointer(event) {
    if (event.button !== 0 || state.viewMode === 'sorter') return;
    focusCanvas();
    if (state.viewMode === 'master' && state.mode === 'comment') return toast('마스터 보기에서는 댓글 대신 마스터 객체를 편집하세요.');
    if (state.mode === 'comment') {
      const point = stagePoint(event);
      state.commentDrawing = point;
      state.commentDraft = {x:point.x, y:point.y, w:0, h:0};
      state.inspectorTab = 'comments';
      renderStage(); renderInspector();
      event.preventDefault();
    } else if (state.mode === 'edit' && state.tool === 'draw') {
      state.pathDrawing = {points:[stagePoint(event)]};
      event.preventDefault();
    } else if (state.mode === 'edit' && state.tool === 'select') {
      const point = stagePoint(event);
      state.drag = {kind:'marquee', start:point, current:point, additive:event.shiftKey, baseIds:event.shiftKey ? [...state.selectedIds] : []};
      event.preventDefault();
    }
  }

  function beginTextEdit(event, object, targetElement = null) {
    event.stopPropagation();
    if (state.mode !== 'edit' || object.locked) return;
    checkpoint(`텍스트 편집: ${object.name}`);
    const element = targetElement || event.currentTarget;
    const original = object.content || '';
    if(Array.isArray(object.textLines)){element.textContent=original;element.style.whiteSpace='pre-wrap';}
    state.editingTextId = object.id;
    state.drag = null;
    element.contentEditable = 'plaintext-only';
    if (element.contentEditable !== 'plaintext-only') element.contentEditable = 'true';
    element.classList.add('is-text-editing');
    element.style.userSelect = 'text';
    element.title = 'Esc 취소 · Ctrl+Enter 완료';
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    let done = false;
    const finish = (commit = true) => {
      if (done) return;
      done = true;
      object.content = commit ? element.innerText.replace(/\n{3,}/g, '\n\n') : original;
      if (commit) syncComponentFromObject(object, 'content');
      state.editingTextId = null;
      element.contentEditable = 'false';
      element.classList.remove('is-text-editing');
      element.style.userSelect = '';
      element.removeEventListener('blur', onBlur);
      element.removeEventListener('keydown', onKeydown);
      renderStage();
      renderInspector();
      if (commit) scheduleSave();
    };
    const onBlur = () => finish(true);
    const onKeydown = keyEvent => {
      keyEvent.stopPropagation();
      if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); finish(false); }
      if (keyEvent.key === 'Enter' && (keyEvent.ctrlKey || keyEvent.metaKey)) { keyEvent.preventDefault(); finish(true); }
    };
    element.addEventListener('blur', onBlur);
    element.addEventListener('keydown', onKeydown);
  }

  function renderInspector() {
    $$('.inspector-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.tab === state.inspectorTab));
    const root = $('#inspectorContent');
    root.replaceChildren();
    if (state.inspectorTab === 'layers') return renderLayers(root);
    if (state.inspectorTab === 'components') return renderComponents(root);
    if (state.inspectorTab === 'recipe') return renderProposalRecipeConsole(root);
    if (state.inspectorTab === 'comments' || state.mode === 'comment') return renderComments(root);
    if (state.mode === 'tweaks' || state.editPanel === 'tweaks') return renderTweaks(root);
    const object = selectedObject();
    if (!object) return renderSlideProperties(root);
    if (state.editPanel === 'code') return renderCodeInspector(root, object);
    renderObjectProperties(root, object, state.editPanel === 'pro');
  }

  function section(title) {
    const wrapper = document.createElement('section');
    wrapper.className = 'inspector-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    wrapper.append(heading);
    return wrapper;
  }

  function field(label, property, value, type = 'number', wide = false) {
    const wrapper = document.createElement('div');
    wrapper.className = wide ? 'field-wide' : 'field';
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value ?? '';
    input.dataset.property = property;
    if (type === 'number') input.step = '1';
    wrapper.append(labelElement, input);
    return wrapper;
  }

  function renderProposalRecipeConsole(root) {
    const slide = currentSlide();
    if (!slide) return;
    const existing = slide.proposalRecipe || {};
    if (!state.recipeDraft || state.recipeDraft.slideId !== slide.id) {
      state.recipeDraft = {
        slideId: slide.id,
        recipeId: existing.recipeId || 'proposal-requirement-map',
        claim: existing.claim || slide.title || '',
        evidence: existing.evidence || '',
        evaluatorQuestion: existing.evaluatorQuestion || '',
        speakerIntent: existing.speakerIntent || '',
        backup: Boolean(existing.backup)
      };
    }
    const draft = state.recipeDraft;
    const recipe = PROPOSAL_RECIPES.find(item => item.id === draft.recipeId) || PROPOSAL_RECIPES[0];
    const header = section('Proposal recipe · explicit apply');
    const notice = document.createElement('p');
    notice.className = 'recipe-notice';
    notice.textContent = '제안 발표 전용 semantic layer입니다. 캔버스 객체를 자동으로 덮어쓰지 않습니다.';
    const selectWrap = document.createElement('div'); selectWrap.className = 'field-wide';
    const selectLabel = document.createElement('label'); selectLabel.textContent = '페이지 역할';
    const select = document.createElement('select'); select.id = 'proposalRecipeSelect';
    PROPOSAL_RECIPES.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; select.append(option); });
    select.value = recipe.id; selectWrap.append(selectLabel, select); header.append(notice, selectWrap);

    const guidance = section('Recipe guidance');
    const purpose = document.createElement('p'); purpose.className = 'recipe-guidance'; purpose.textContent = recipe.purpose;
    const meta = document.createElement('p'); meta.className = 'recipe-meta'; meta.textContent = `강조: ${recipe.emphasis} · 필요한 근거: ${recipe.evidence}`;
    guidance.append(purpose, meta);

    const brief = section('Claim / evidence / intent');
    const grid = document.createElement('div'); grid.className = 'field-grid';
    const makeText = (label, key, value, placeholder) => {
      const wrap = document.createElement('div'); wrap.className = 'field-wide';
      const nodeLabel = document.createElement('label'); nodeLabel.textContent = label;
      const input = document.createElement('textarea'); input.className = 'recipe-text'; input.dataset.recipeKey = key; input.value = value; input.placeholder = placeholder;
      wrap.append(nodeLabel, input); return wrap;
    };
    grid.append(
      makeText('핵심 주장', 'claim', draft.claim, '이 장표가 답할 한 문장 주장'),
      makeText('근거 포인터', 'evidence', draft.evidence, 'RFP 요구사항 ID · 증빙 ID · 원문 경로'),
      makeText('평가자 질문', 'evaluatorQuestion', draft.evaluatorQuestion, '평가자가 이 장표에서 확인할 질문'),
      makeText('발표자 의도', 'speakerIntent', draft.speakerIntent, '20초 안에 전달할 발표 의도')
    );
    const backupWrap = document.createElement('label'); backupWrap.className = 'recipe-check';
    const backup = document.createElement('input'); backup.type = 'checkbox'; backup.checked = draft.backup; backup.dataset.recipeKey = 'backup';
    backupWrap.append(backup, document.createTextNode('백업/Q&A 장표로 표시'));
    grid.append(backupWrap); brief.append(grid);

    const preview = section('Diff preview');
    const changes = [
      `recipe: ${existing.recipeId || '없음'} → ${recipe.label}`,
      `claim: ${existing.claim || '없음'} → ${draft.claim || '[HOLD: 입력 필요]'}`,
      `evidence: ${existing.evidence || '없음'} → ${draft.evidence || '[HOLD: 근거 포인터 필요]'}`,
      `presentation: ${draft.backup ? 'backup/Q&A' : 'main slide'}`
    ];
    const list = document.createElement('ul'); list.className = 'recipe-diff'; changes.forEach(change => { const item = document.createElement('li'); item.textContent = change; list.append(item); });
    const status = document.createElement('p'); status.className = `recipe-status ${draft.claim.trim() && draft.evidence.trim() ? 'is-ready' : 'is-hold'}`;
    status.textContent = draft.claim.trim() && draft.evidence.trim() ? 'READY · 승인 적용 시 slide metadata와 speaker notes에 traceable brief를 저장합니다.' : 'HOLD · 주장과 근거 포인터가 없으면 발표 proof가 완결되지 않습니다.';
    const apply = document.createElement('button'); apply.className = 'component-primary recipe-apply'; apply.textContent = '승인 적용 · Canvas 변경 없음';
    preview.append(list, status, apply);
    root.append(header, guidance, brief, preview);

    select.addEventListener('change', () => { draft.recipeId = select.value; renderInspector(); });
    $$('[data-recipe-key]', root).forEach(input => {
      const updateDraft = () => { draft[input.dataset.recipeKey] = input.type === 'checkbox' ? input.checked : input.value; };
      input.addEventListener('input', updateDraft);
      input.addEventListener('change', () => { updateDraft(); renderInspector(); });
    });
    apply.addEventListener('click', () => applyProposalRecipe(draft));
  }

  function applyProposalRecipe(draft) {
    const slide = currentSlide();
    const recipe = PROPOSAL_RECIPES.find(item => item.id === draft.recipeId);
    if (!slide || !recipe) return;
    checkpoint(`제안 Recipe 적용: ${recipe.label}`);
    const appliedAt = new Date().toISOString();
    slide.proposalRecipe = {recipeId: recipe.id, recipeLabel: recipe.label, claim: draft.claim.trim(), evidence: draft.evidence.trim(), evaluatorQuestion: draft.evaluatorQuestion.trim(), speakerIntent: draft.speakerIntent.trim(), backup: Boolean(draft.backup), appliedAt, proofState: draft.claim.trim() && draft.evidence.trim() ? 'ready' : 'hold'};
    const brief = `[PROPOSAL BRIEF]\nRole: ${recipe.label}\nClaim: ${slide.proposalRecipe.claim || '[HOLD]'}\nEvidence: ${slide.proposalRecipe.evidence || '[HOLD]'}\nEvaluator question: ${slide.proposalRecipe.evaluatorQuestion || '[HOLD]'}\nSpeaker intent: ${slide.proposalRecipe.speakerIntent || '[HOLD]'}\nMode: ${slide.proposalRecipe.backup ? 'backup/Q&A' : 'main'}\n[/PROPOSAL BRIEF]`;
    slide.notes = String(slide.notes || '').replace(/\n?\[PROPOSAL BRIEF\][\s\S]*?\[\/PROPOSAL BRIEF\]/, '').trim();
    slide.notes = [slide.notes, brief].filter(Boolean).join('\n\n');
    state.recipeDraft = null;
    renderAll(); scheduleSave();
    toast(slide.proposalRecipe.proofState === 'ready' ? `${recipe.label} Recipe와 proof brief를 적용했습니다.` : `${recipe.label} Recipe를 HOLD 상태로 적용했습니다. 근거 포인터를 보완하세요.`);
  }

  function renderObjectProperties(root, object, isPro = false) {
    const identity = section(`${object.type} · ${object.name}`);
    const identityGrid = document.createElement('div');
    identityGrid.className = 'field-grid';
    identityGrid.append(field('Name', 'name', object.name, 'text', true));
    if (object.type === 'text') {
      const contentField = document.createElement('div');
      contentField.className = 'field-wide';
      const contentLabel = document.createElement('label');
      contentLabel.textContent = 'Content · canvas double-click also edits';
      const contentEditor = document.createElement('textarea');
      contentEditor.className = 'content-editor';
      contentEditor.dataset.property = 'content';
      contentEditor.value = object.content || '';
      contentField.append(contentLabel, contentEditor);
      identityGrid.append(contentField);
    }
    if (object.componentId) {
      const badge = document.createElement('div');
      badge.className = 'field-wide component-badge';
      badge.textContent = `${object.componentKind === 'main' ? '◆ Main component' : '◇ Instance'} · ${object.componentId}`;
      identityGrid.append(badge);
    }
    identity.append(identityGrid);

    const geometry = section('Geometry');
    const grid = document.createElement('div');
    grid.className = 'field-grid';
    [['X','x'],['Y','y'],['W','w'],['H','h']].forEach(([label, key]) => grid.append(field(label, key, object[key])));
    geometry.append(grid);

    const appearance = section('Appearance');
    const appearanceGrid = document.createElement('div');
    appearanceGrid.className = 'field-grid';
    if (object.type === 'text') {
      appearanceGrid.append(
        field('Font size', 'style.fontSize', object.style.fontSize),
        field('Weight', 'style.fontWeight', object.style.fontWeight),
        field('Text color', 'style.color', object.style.color, 'color'),
        field('Background', 'style.background', normalizeColor(object.style.background), 'color'),
        field('Font family', 'style.fontFamily', object.style.fontFamily, 'text', true)
      );
      const align = document.createElement('div');
      align.className = 'field-wide';
      align.innerHTML = '<label>Alignment</label><select data-property="style.textAlign"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>';
      $('select', align).value = object.style.textAlign || 'left';
      appearanceGrid.append(align);
      const strike=document.createElement('div'); strike.className='field-wide'; strike.innerHTML='<label>Text decoration</label><select data-property="style.strike"><option value="false">None</option><option value="true">Strikethrough</option></select>'; $('select',strike).value=String(!!object.style.strike); appearanceGrid.append(strike);
    } else if (object.type === 'shape') {
      appearanceGrid.append(
        field('Fill', 'style.fill', normalizeColor(object.style.fill), 'color'),
        field('Border', 'style.borderColor', normalizeColor(object.style.borderColor), 'color'),
        field('Border px', 'style.borderWidth', object.style.borderWidth),
        field('Radius', 'style.radius', object.style.radius)
      );
      const kind=document.createElement('div'); kind.className='field-wide'; const label=document.createElement('label'); label.textContent='Change shape'; const select=document.createElement('select'); select.dataset.property='kind'; SHAPE_LIBRARY.forEach(item=>{const option=document.createElement('option');option.value=item.kind;option.textContent=item.label;select.append(option);}); select.value=object.kind||'rectangle'; kind.append(label,select); appearanceGrid.append(kind);
    } else if (object.type === 'path') {
      appearanceGrid.append(
        field('Stroke', 'style.stroke', normalizeColor(object.style.stroke), 'color'),
        field('Stroke px', 'style.strokeWidth', object.style.strokeWidth),
        field('Opacity', 'style.opacity', object.style.opacity ?? 1, 'number')
      );
    } else {
      const fit = document.createElement('div');
      fit.className = 'field-wide';
      fit.innerHTML = '<label>Image fit</label><select data-property="style.objectFit"><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select>';
      $('select', fit).value = object.style?.objectFit || 'cover';
      appearanceGrid.append(fit,
        field('Crop zoom', 'style.cropZoom', object.style?.cropZoom ?? 1, 'number'),
        field('Crop X %', 'style.cropX', object.style?.cropX ?? 50),
        field('Crop Y %', 'style.cropY', object.style?.cropY ?? 50)
      );
    }
    appearance.append(appearanceGrid);

    const advancedBlocks = [];
    if (isPro) {
      const typography = section('Typography & contents');
      const typoGrid = document.createElement('div');
      typoGrid.className = 'field-grid';
      if (object.type === 'text') {
        typoGrid.append(
          field('Leading', 'style.lineHeight', object.style.lineHeight ?? 1.4, 'number'),
          field('Tracking', 'style.letterSpacing', object.style.letterSpacing ?? 0, 'number'),
          field('Padding', 'style.padding', object.style.padding ?? 0, 'number'),
          field('Radius', 'style.radius', object.style.radius ?? 0, 'number')
        );
      } else if (object.type === 'path') {
        typoGrid.append(field('Stroke', 'style.stroke', object.style.stroke, 'color'), field('Stroke px', 'style.strokeWidth', object.style.strokeWidth));
      }
      typography.append(typoGrid);

      const layout = section('Sizing & position');
      const layoutGrid = document.createElement('div');
      layoutGrid.className = 'field-grid';
      layoutGrid.append(
        field('Z-index', 'z', object.z || 1),
        field('Rotation', 'rotation', object.rotation || 0),
        field('Opacity', 'style.opacity', object.style.opacity ?? 1, 'number'),
        field('Margin', 'style.margin', object.style.margin ?? 0, 'number')
      );
      const overflow = document.createElement('div');
      overflow.className = 'field-wide';
      overflow.innerHTML = '<label>Overflow</label><select data-property="style.overflow"><option value="visible">visible</option><option value="hidden">hidden</option><option value="auto">auto</option><option value="scroll">scroll</option></select>';
      $('select', overflow).value = object.style.overflow || (object.type === 'text' ? 'hidden' : 'visible');
      layoutGrid.append(overflow);
      layout.append(layoutGrid);
      const widthModes = document.createElement('div');
      widthModes.className = 'segmented';
      widthModes.innerHTML = '<button data-size-mode="hug">Hug</button><button data-size-mode="fixed" class="is-active">Fixed</button><button data-size-mode="fill">Fill</button>';
      layout.append(widthModes);

      const debug = section('Advanced');
      const pre = document.createElement('pre');
      pre.className = 'code-hint';
      pre.textContent = JSON.stringify({id:object.id, type:object.type, role:object.role || null, locked:!!object.locked}, null, 2);
      debug.append(pre);
      advancedBlocks.push(typography, layout, debug);
    }

    const actions = section('Arrange');
    actions.innerHTML += `<div class="inline-actions"><button data-action="front" title="앞으로">Front</button><button data-action="back" title="뒤로">Back</button><button data-action="duplicate">Copy</button><button data-action="delete" class="danger">Delete</button></div>`;

    root.append(identity, geometry, appearance, ...advancedBlocks, actions);
    $$('[data-property]', root).forEach(input => input.addEventListener('change', () => updateSelectedProperty(input.dataset.property, input.value, input.type)));
    $$('[data-action]', root).forEach(button => button.addEventListener('click', () => handleObjectAction(button.dataset.action)));
    $$('[data-size-mode]', root).forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.sizeMode;
      checkpoint(`Sizing: ${mode}`);
      if (mode === 'fill') { object.x = 0; object.w = stageWidth(); }
      if (mode === 'hug' && object.type === 'text') { object.w = Math.min(stageWidth()-object.x, Math.max(80, (object.content || '').length * (object.style.fontSize || 14) * .62)); }
      renderAll(); scheduleSave();
    }));
  }

  function objectToCode(object) {
    const style = object.style || {};
    const lines = [
      `@name: ${object.name};`,
      `@locked: ${!!object.locked};`,
      `left: ${object.x}px;`, `top: ${object.y}px;`, `width: ${object.w}px;`, `height: ${object.h}px;`,
      `z-index: ${object.z || 1};`, `rotation: ${object.rotation || 0}deg;`,
      `opacity: ${style.opacity ?? 1};`, `overflow: ${style.overflow || (object.type === 'text' ? 'hidden' : 'visible')};`
    ];
    if (object.type === 'text') lines.push(
      `font-family: ${style.fontFamily || 'sans-serif'};`, `font-size: ${style.fontSize || 14}px;`,
      `font-weight: ${style.fontWeight || 400};`, `color: ${style.color || '#222320'};`,
      `text-align: ${style.textAlign || 'left'};`, `line-height: ${style.lineHeight || 1.4};`,
      `letter-spacing: ${style.letterSpacing || 0}px;`, `background: ${style.background || 'transparent'};`,
      `padding: ${style.padding || 0}px;`, `border-radius: ${style.radius || 0}px;`
    );
    if (object.type === 'shape') lines.push(`background: ${style.fill || '#f1f0ec'};`, `border-color: ${style.borderColor || 'transparent'};`, `border-width: ${style.borderWidth || 0}px;`, `border-radius: ${style.radius || 0}px;`);
    if (object.type === 'path') lines.push(`stroke: ${style.stroke || '#315ce7'};`, `stroke-width: ${style.strokeWidth || 3}px;`);
    return lines.join('\n');
  }

  function applyObjectCode(object, code) {
    const numeric = value => Number.parseFloat(value) || 0;
    const map = {
      left:['x',numeric], top:['y',numeric], width:['w',numeric], height:['h',numeric], 'z-index':['z',numeric], rotation:['rotation',numeric],
      opacity:['style.opacity',numeric], overflow:['style.overflow',String], 'font-family':['style.fontFamily',String], 'font-size':['style.fontSize',numeric],
      'font-weight':['style.fontWeight',numeric], color:['style.color',String], 'text-align':['style.textAlign',String], 'line-height':['style.lineHeight',numeric],
      'letter-spacing':['style.letterSpacing',numeric], background:[object.type === 'shape' ? 'style.fill' : 'style.background',String], padding:['style.padding',numeric],
      'border-radius':['style.radius',numeric], 'border-color':['style.borderColor',String], 'border-width':['style.borderWidth',numeric], stroke:['style.stroke',String], 'stroke-width':['style.strokeWidth',numeric]
    };
    code.split(/\n+/).forEach(line => {
      const match = line.trim().replace(/;$/, '').match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const key = match[1].trim(), raw = match[2].trim();
      if (key === '@name') object.name = raw;
      else if (key === '@locked') object.locked = raw === 'true';
      else if (map[key]) setNested(object, map[key][0], map[key][1](raw));
    });
    object.x = clamp(object.x, 0, stageWidth() - 8); object.y = clamp(object.y, 0, stageHeight() - 8);
    object.w = clamp(object.w, 8, stageWidth() - object.x); object.h = clamp(object.h, 8, stageHeight() - object.y);
  }

  function renderCodeInspector(root, object) {
    const head = document.createElement('div');
    head.className = 'inspector-mode-head';
    head.innerHTML = '<strong>Code</strong><small>Selection styles</small>';
    const hint = document.createElement('p');
    hint.className = 'code-hint';
    hint.textContent = 'One declaration per line. @name and @locked edit attributes.';
    const editor = document.createElement('textarea');
    editor.className = 'code-editor'; editor.id = 'codeEditor'; editor.spellcheck = false; editor.value = objectToCode(object);
    const actions = document.createElement('div');
    actions.className = 'stack-actions';
    actions.innerHTML = '<button id="applyCode">Apply code</button><button id="exportSelection">Export selection JSON</button>';
    root.append(head, hint, editor, actions);
    $('#applyCode').addEventListener('click', () => {
      checkpoint('Code 편집'); applyObjectCode(object, editor.value); renderAll(); scheduleSave(); toast('코드 속성을 적용했습니다.');
    });
    $('#exportSelection').addEventListener('click', () => downloadBlob(`${safeFileName(object.name)}.json`, JSON.stringify(object, null, 2), 'application/json'));
  }

  function renderTweaks(root) {
    const tweaks = state.project.tweaks;
    const head = document.createElement('div');
    head.className = 'inspector-mode-head'; head.innerHTML = '<strong>Tweaks</strong><small>Live design controls</small>';
    root.append(head);
    const controls = [
      ['Description width','descriptionWidth',18,40,1,'%'],
      ['Corner radius','radius',0,28,1,'px'],
      ['Type density','density',80,120,5,'%']
    ];
    controls.forEach(([label,key,min,max,step,unit]) => {
      const wrap = document.createElement('div'); wrap.className = 'tweak-control';
      const lab = document.createElement('label'); lab.textContent = label;
      const out = document.createElement('output'); out.textContent = `${tweaks[key]}${unit}`;
      const input = document.createElement('input'); input.type='range'; input.min=min; input.max=max; input.step=step; input.value=tweaks[key]; input.dataset.tweak=key;
      wrap.append(lab,out,input); root.append(wrap);
      input.addEventListener('input', () => { out.textContent = `${input.value}${unit}`; });
      input.addEventListener('change', () => applyTweak(key, Number(input.value)));
    });
    const colorWrap = document.createElement('div'); colorWrap.className = 'field-wide';
    colorWrap.innerHTML = '<label>Accent</label><input type="color" data-tweak="accent">';
    $('input', colorWrap).value = tweaks.accent; root.append(colorWrap);
    $('input', colorWrap).addEventListener('change', event => applyTweak('accent', event.target.value));
    const promptSection = section('Describe a tweak');
    const prompt = document.createElement('textarea'); prompt.className='tweak-prompt'; prompt.placeholder='예: Description을 오른쪽 24%로 맞춰줘';
    const apply = document.createElement('button'); apply.className='save-edit-button'; apply.textContent='Request tweak';
    promptSection.append(prompt, apply); root.append(promptSection);
    apply.addEventListener('click', () => { applyPrompt(prompt.value); prompt.value=''; });
  }

  function applyTweak(key, value) {
    const tweaks = state.project.tweaks;
    checkpoint(`Tweak: ${key}`);
    if (key === 'descriptionWidth') {
      const x = Math.round(stageWidth() * (1 - value / 100));
      activeSlide().objects.filter(object => object.role === 'description').forEach(object => { object.x=x; object.w=stageWidth()-x-25; });
    } else if (key === 'radius') {
      const targets = selectedObjects().length ? selectedObjects() : activeSlide().objects.filter(object=>object.type==='shape');
      targets.filter(object=>object.style).forEach(object=>object.style.radius=value);
    } else if (key === 'density') {
      const ratio = value / (tweaks.density || 100);
      activeSlide().objects.filter(object=>object.type==='text').forEach(object=>object.style.fontSize=Math.max(8,Math.round(object.style.fontSize*ratio)));
    } else if (key === 'accent') {
      activeSlide().objects.forEach(object => {
        if (object.style?.color === tweaks.accent) object.style.color=value;
        if (object.style?.stroke === tweaks.accent) object.style.stroke=value;
        if (object.style?.borderColor === tweaks.accent) object.style.borderColor=value;
      });
    }
    tweaks[key]=value; renderAll(); scheduleSave();
  }

  function setSlidePreset(presetKey) {
    const preset = SLIDE_PRESETS[presetKey];
    if (!preset) return;
    const slide = activeSlide();
    const oldWidth = stageWidth(slide), oldHeight = stageHeight(slide);
    if (oldWidth === preset.width && oldHeight === preset.height) return;
    checkpoint(`슬라이드 크기: ${preset.label}`);
    const sx = preset.width / oldWidth, sy = preset.height / oldHeight, textScale = Math.min(sx, sy);
    slide.objects.forEach(object => {
      object.x = Math.round(object.x * sx); object.y = Math.round(object.y * sy);
      object.w = Math.max(8, Math.round(object.w * sx)); object.h = Math.max(8, Math.round(object.h * sy));
      if (object.type === 'path') object.points = (object.points || []).map(point=>({x:point.x*sx,y:point.y*sy}));
      if (object.style?.fontSize) object.style.fontSize = Math.max(6, Math.round(object.style.fontSize * textScale));
      if (object.style?.padding) object.style.padding = Math.round(object.style.padding * textScale);
      if (object.style?.strokeWidth) object.style.strokeWidth = Math.max(1, object.style.strokeWidth * textScale);
    });
    state.project.comments.filter(comment=>comment.slideId===slide.id).forEach(comment=>{comment.x*=sx;comment.y*=sy;comment.w*=sx;comment.h*=sy;});
    slide.sizePreset = presetKey; slide.width = preset.width; slide.height = preset.height;
    const viewport = $('#canvasViewport');
    if (viewport.clientWidth && viewport.clientHeight) state.zoom = clamp(Math.min((viewport.clientWidth-84)/preset.width,(viewport.clientHeight-84)/preset.height),.35,1.25);
    renderAll(); scheduleSave(); toast(`${preset.label} · ${preset.width}×${preset.height}`);
  }

  function renderSlideProperties(root) {
    const slide = activeSlide();
    const block = section(activeLayout() ? 'Layout' : state.viewMode==='master' ? 'Master' : 'Slide');
    const grid = document.createElement('div');
    grid.className = 'field-grid';
    grid.append(field('Title', activeLayout()?'slide.name':'slide.title', activeLayout()?.name||slide.title, 'text', true), field('Background', 'slide.background', slide.background||'#ffffff', 'color'));
    const presetField = document.createElement('div'); presetField.className='field-wide';
    const presetLabel = document.createElement('label'); presetLabel.textContent='Slide size';
    const presetSelect = document.createElement('select'); presetSelect.id='slidePreset';
    Object.entries(SLIDE_PRESETS).forEach(([key,preset])=>{const option=document.createElement('option');option.value=key;option.textContent=`${preset.label} · ${preset.width}×${preset.height}`;presetSelect.append(option);});
    presetSelect.value = slide.sizePreset || 'wide'; presetField.append(presetLabel,presetSelect); grid.append(presetField);
    let masterSelect=null,layoutSelect=null;
    if (state.viewMode !== 'master') {
      const sectionField=document.createElement('div'); sectionField.className='field-wide'; const sectionLabel=document.createElement('label'); sectionLabel.textContent='Section'; const sectionSelect=document.createElement('select'); sectionSelect.dataset.property='slide.sectionId'; state.project.sections.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;sectionSelect.append(option);}); sectionSelect.value=slide.sectionId; sectionField.append(sectionLabel,sectionSelect);
      const masterField=document.createElement('div'); masterField.className='field-wide'; const masterLabel=document.createElement('label'); masterLabel.textContent='Slide master'; masterSelect=document.createElement('select'); masterSelect.dataset.property='slide.masterId'; state.project.masters.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.title;masterSelect.append(option);}); masterSelect.value=slide.masterId; masterField.append(masterLabel,masterSelect);
      const layoutField=document.createElement('div');layoutField.className='field-wide';const layoutLabel=document.createElement('label');layoutLabel.textContent='Slide layout';layoutSelect=document.createElement('select');layoutSelect.dataset.property='slide.layoutId';(masterForSlide(slide)?.layouts||[]).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;layoutSelect.append(option);});layoutSelect.value=slide.layoutId||'';layoutField.append(layoutLabel,layoutSelect);grid.append(sectionField,masterField,layoutField);
    }
    block.append(grid);
    const stats = section('Structure');
    const roles = slide.objects.reduce((acc, object) => { if (object.role) acc[object.role] = (acc[object.role] || 0) + 1; return acc; }, {});
    stats.innerHTML += `<div class="stack-actions"><button>${stageWidth()} × ${stageHeight()} canvas</button><button>${slide.objects.length} objects</button><button>${roles['primary-screen'] || 0} primary screens</button><button>${roles['auxiliary-panel'] || 0} auxiliary panels</button><button>${roles['footer-table'] || 0} footer tables</button></div>`;
    const importReport = state.project.importReport;
    const sourceLock = importReport?.schema === 'canvas-import-report/1' ? section('원본 잠금선') : null;
    if (sourceLock) {
      const candidates = state.project.importReview?.candidates || [];
      const pending = candidates.filter(item => item.decision === 'pending').length;
      const meta = document.createElement('p'); meta.className = 'code-hint';
      meta.textContent = `${importReport.sourceFileName || state.project.fileName || 'PPTX'} · SHA-256 ${String(importReport.sourceSha256 || '').slice(0, 12)}… · 편집 객체 ${importReport.editableObjects || 0}개`;
      const lockState = document.createElement('p'); lockState.className = 'source-lock-state';
      lockState.textContent = pending ? `원본 잠금 완료 · 내보내기 전 검토 후보 ${pending}건` : '원본 잠금 완료 · 검토 후보 처리 상태 기록됨';
      sourceLock.append(meta, lockState);
      if (!candidates.length) {
        const clear = document.createElement('p'); clear.className = 'code-hint'; clear.textContent = '현재 가져오기에서 추가 검토 후보가 생성되지 않았습니다.'; sourceLock.append(clear);
      }
      candidates.forEach(candidate => {
        const item = document.createElement('article'); item.className = `import-review-candidate is-${candidate.decision}`;
        const title = document.createElement('strong'); title.textContent = candidate.code;
        const message = document.createElement('p'); message.textContent = candidate.message;
        const status = document.createElement('small'); status.textContent = candidate.decision === 'pending' ? '검토 대기' : candidate.decision === 'hold' ? '보류' : '확인 완료';
        const actions = document.createElement('div'); actions.className = 'inline-actions';
        const reviewed = document.createElement('button'); reviewed.textContent = '확인 완료'; reviewed.disabled = candidate.decision === 'reviewed'; reviewed.addEventListener('click', () => setImportReviewDecision(candidate.id, 'reviewed'));
        const hold = document.createElement('button'); hold.textContent = '보류'; hold.disabled = candidate.decision === 'hold'; hold.addEventListener('click', () => setImportReviewDecision(candidate.id, 'hold'));
        actions.append(reviewed, hold); item.append(title, message, status, actions); sourceLock.append(item);
      });
    }
    const actions = section(state.viewMode === 'master' ? 'Master status' : 'Slide actions');
    actions.innerHTML += state.viewMode === 'master' ? '<div class="stack-actions"><button disabled>연결 슬라이드에 자동 적용</button></div>' : '<div class="stack-actions"><button data-slide-action="duplicate">슬라이드 복제</button><button data-slide-action="delete">슬라이드 삭제</button></div>';
    root.append(block, stats, ...(sourceLock ? [sourceLock] : []), actions);
    $$('[data-property]', root).forEach(input => input.addEventListener('change', () => updateSelectedProperty(input.dataset.property, input.value, input.type)));
    masterSelect?.addEventListener('change',()=>{const master=state.project.masters.find(item=>item.id===masterSelect.value);currentSlide().layoutId=master?.layouts?.[0]?.id||'';renderAll();scheduleSave();});
    presetSelect.addEventListener('change',()=>setSlidePreset(presetSelect.value));
    $$('[data-slide-action]', root).forEach(button => button.addEventListener('click', () => button.dataset.slideAction === 'duplicate' ? duplicateSlide(state.activeSlide) : deleteSlide(state.activeSlide)));
  }

  function renderLayers(root) {
    const block = section('Layers · drag to reorder');
    const list = document.createElement('div');
    list.className = 'layer-list';
    [...activeSlide().objects].sort((a,b) => (b.z || 0) - (a.z || 0)).forEach(object => {
      const item = document.createElement('button');
      item.className = `layer-item ${state.selectedIds.includes(object.id) ? 'is-active' : ''}`;
      item.draggable = true;
      item.dataset.layerId = object.id;
      const glyph = object.componentKind === 'main' ? '◆' : object.componentKind === 'instance' ? '◇' : object.type === 'text' ? 'T' : object.type === 'shape' ? '□' : object.type === 'path' ? '⌁' : '▧';
      item.innerHTML = `<span class="layer-grip">⋮⋮</span><span class="layer-type">${glyph}</span><span class="layer-name">${escapeHTML(object.groupName ? `${object.groupName} / ${object.name}` : object.name)}</span><span>${object.locked ? '⌕' : ''}</span>`;
      item.addEventListener('click', event => {
        const ids = expandGroupedIds([object.id]);
        state.selectedIds = event.shiftKey ? [...new Set([...state.selectedIds, ...ids])] : ids;
        state.inspectorTab = 'layers'; renderStage(); renderInspector();
      });
      item.addEventListener('dragstart', event => {
        state.layerDragId = object.id;
        item.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', object.id);
      });
      item.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; item.classList.add('is-drop-target'); });
      item.addEventListener('dragleave', () => item.classList.remove('is-drop-target'));
      item.addEventListener('drop', event => {
        event.preventDefault();
        item.classList.remove('is-drop-target');
        reorderLayer(state.layerDragId || event.dataTransfer.getData('text/plain'), object.id);
      });
      item.addEventListener('dragend', () => { state.layerDragId = null; item.classList.remove('is-dragging'); });
      list.append(item);
    });
    block.append(list);
    root.append(block);
  }

  function createComponentFromSelection() {
    const objects = selectedObjects();
    if (!objects.length) return toast('컴포넌트로 만들 객체를 선택하세요.');
    if (objects.some(object => object.componentId)) return toast('이미 컴포넌트에 속한 객체가 포함되어 있습니다.');
    checkpoint('컴포넌트 생성');
    const minX = Math.min(...objects.map(object => object.x));
    const minY = Math.min(...objects.map(object => object.y));
    const maxX = Math.max(...objects.map(object => object.x + object.w));
    const maxY = Math.max(...objects.map(object => object.y + object.h));
    const componentId = uid('component');
    const grouped = objects[0]?.groupId && objects.every(object => object.groupId === objects[0].groupId);
    const component = {id:componentId, name:grouped ? (objects[0].groupName || `Component ${state.project.components.length + 1}`) : objects.length === 1 ? objects[0].name : `Component ${state.project.components.length + 1}`, w:maxX-minX, h:maxY-minY, createdAt:new Date().toISOString(), nodes:[]};
    const componentGroups = new Map();
    objects.forEach(object => {
      const nodeKey = uid('node');
      object.componentId = componentId;
      object.componentKind = 'main';
      object.componentNodeKey = nodeKey;
      const snapshot = deepCopy(object);
      delete snapshot.id; delete snapshot.componentKind;
      if (snapshot.groupId) {
        if (!componentGroups.has(snapshot.groupId)) componentGroups.set(snapshot.groupId, uid('component-group'));
        snapshot.componentGroupKey = componentGroups.get(snapshot.groupId);
        delete snapshot.groupId;
      }
      snapshot.x = object.x - minX; snapshot.y = object.y - minY;
      component.nodes.push({...snapshot, nodeKey});
    });
    state.project.components.push(component);
    state.inspectorTab = 'components';
    renderAll(); scheduleSave(); toast(`◆ ${component.name} 컴포넌트를 만들었습니다.`);
  }

  function insertComponentInstance(componentId, dropPoint = null) {
    const component = state.project.components.find(item => item.id === componentId);
    if (!component) return;
    checkpoint(`인스턴스 삽입: ${component.name}`);
    const instanceId = uid('instance');
    const offset = Math.min(80, (activeSlide().objects.filter(object => object.componentId === componentId && object.componentKind === 'instance').length + 1) * 18);
    const originX = dropPoint ? clamp(Math.round(dropPoint.x-component.w/2),-stageMargin(),stageWidth()+stageMargin()-component.w) : clamp(Math.round((stageWidth()-component.w)/2)+offset, 0, Math.max(0,stageWidth()-component.w));
    const originY = dropPoint ? clamp(Math.round(dropPoint.y-component.h/2),-stageMargin(),stageHeight()+stageMargin()-component.h) : clamp(Math.round((stageHeight()-component.h)/2)+offset, 0, Math.max(0,stageHeight()-component.h));
    const maxZ = Math.max(...activeSlide().objects.map(object=>object.z||0),0);
    const groupMap = new Map();
    const objects = component.nodes.map((node,index) => {
      const copy = {...deepCopy(node), id:uid(node.type || 'node'), x:originX+node.x, y:originY+node.y, z:maxZ+index+1, componentId, componentKind:'instance', componentNodeKey:node.nodeKey, instanceId, overrides:[]};
      const groupKey = node.componentGroupKey || node.groupId;
      if (groupKey) {
        if (!groupMap.has(groupKey)) groupMap.set(groupKey, uid('group'));
        copy.groupId = groupMap.get(groupKey);
      }
      delete copy.nodeKey; delete copy.componentGroupKey;
      return copy;
    });
    activeSlide().objects.push(...objects);
    state.selectedIds = objects.map(object => object.id);
    renderAll(); scheduleSave(); toast(`◇ ${component.name} 인스턴스를 삽입했습니다.`);
  }

  function syncComponentFromObject(object, changedPath) {
    if (!object?.componentId || !changedPath) return;
    const component = state.project.components.find(item => item.id === object.componentId);
    if (!component) return;
    if (object.componentKind === 'instance') {
      object.overrides ||= [];
      if (!object.overrides.includes(changedPath)) object.overrides.push(changedPath);
      return;
    }
    if (object.componentKind !== 'main') return;
    const node = component.nodes.find(item => item.nodeKey === object.componentNodeKey);
    if (!node) return;
    setNested(node, changedPath, deepCopy(changedPath.split('.').reduce((value,key)=>value?.[key], object)));
    state.project.slides.forEach(slide => slide.objects.filter(item => item.componentId === object.componentId && item.componentKind === 'instance' && item.componentNodeKey === object.componentNodeKey).forEach(instance => {
      if (!(instance.overrides || []).includes(changedPath)) setNested(instance, changedPath, deepCopy(changedPath.split('.').reduce((value,key)=>value?.[key], object)));
    }));
  }

  function resetInstance(instanceId) {
    checkpoint('인스턴스 override 초기화');
    const objects = activeSlide().objects.filter(object => object.instanceId === instanceId);
    if (!objects.length) return;
    const component = state.project.components.find(item => item.id === objects[0].componentId);
    if (!component) return;
    const originX = Math.min(...objects.map(object => object.x - (component.nodes.find(node=>node.nodeKey===object.componentNodeKey)?.x || 0)));
    const originY = Math.min(...objects.map(object => object.y - (component.nodes.find(node=>node.nodeKey===object.componentNodeKey)?.y || 0)));
    const groupMap = new Map();
    objects.forEach(object => {
      const node = component.nodes.find(item=>item.nodeKey===object.componentNodeKey);
      if (!node) return;
      const groupKey = node.componentGroupKey || node.groupId;
      if (groupKey && !groupMap.has(groupKey)) groupMap.set(groupKey, object.groupId || uid('group'));
      const identity = {id:object.id, instanceId, componentId:object.componentId, componentKind:'instance', componentNodeKey:object.componentNodeKey};
      Object.keys(object).forEach(key=>delete object[key]);
      Object.assign(object, deepCopy(node), identity, {x:originX+node.x,y:originY+node.y,overrides:[]});
      if (groupKey) object.groupId = groupMap.get(groupKey);
      delete object.nodeKey; delete object.componentGroupKey;
    });
    renderAll(); scheduleSave();
  }

  function detachInstance(instanceId) {
    checkpoint('인스턴스 분리');
    activeSlide().objects.filter(object=>object.instanceId===instanceId).forEach(object=>{
      delete object.componentId; delete object.componentKind; delete object.componentNodeKey; delete object.instanceId; delete object.overrides;
    });
    renderAll(); scheduleSave();
  }

  function deleteComponent(componentId) {
    checkpoint('컴포넌트 삭제');
    state.project.slides.forEach(slide=>slide.objects.filter(object=>object.componentId===componentId).forEach(object=>{
      delete object.componentId; delete object.componentKind; delete object.componentNodeKey; delete object.instanceId; delete object.overrides;
    }));
    state.project.components = state.project.components.filter(item=>item.id!==componentId);
    renderAll(); scheduleSave();
  }

  function previewDesignSystemTokens(scope='auto') {
    const design=state.project.designSystem;
    if(!design)return {ok:false,reason:'먼저 DESIGN.md를 가져오세요.',scope,changes:[]};
    if((design.report?.errors||[]).length)return {ok:false,reason:'DESIGN.md validation error를 먼저 해결하세요.',scope,changes:[]};
    const colors=design.tokens?.colors||[],font=(design.tokens?.typography||[]).find(item=>item.name==='font-family')?.value||(design.tokens?.typography||[])[0]?.value;
    const accent=colors.find(item=>!['#FFFFFF','#000000'].includes(String(item.value||'').toUpperCase()))?.value;
    const selected=selectedObjects();
    const effectiveScope=scope==='selection'?'selection':scope==='slide'?'slide':selected.length?'selection':'slide';
    const targets=effectiveScope==='selection'?selected:activeSlide().objects;
    if(effectiveScope==='selection'&&!targets.length)return {ok:false,reason:'선택 범위에 객체가 없습니다.',scope:effectiveScope,changes:[]};
    const changes=[];
    const propose=(object,property,value)=>{const before=object.style?.[property];if(value!==undefined&&before!==value)changes.push({objectId:object.id,objectName:object.name||object.id,property:`style.${property}`,before,after:value});};
    const fm=design.spec?.frontmatter||{},bodyFont=fm.typography?.body?.fontFamily||font,headingFont=fm.typography?.heading?.fontFamily||bodyFont;targets.forEach(object=>{if(object.type==='text'&&bodyFont)propose(object,'fontFamily',object.role==='heading'||object.style?.fontSize>=32?headingFont:bodyFont);if(accent&&object.type==='path')propose(object,'stroke',accent);if(accent&&object.type==='shape'&&object.role==='accent-fill')propose(object,'fill',accent);else if(accent&&object.type==='shape'&&(/action|accent|button/i.test(object.role||'')||object.style?.borderColor===state.project.tweaks.accent))propose(object,'borderColor',accent);});
    return {ok:true,scope:effectiveScope,targetCount:targets.length,changedObjects:new Set(changes.map(item=>item.objectId)).size,changedProperties:changes.length,changes,accent,sourceSha256:design.source?.sha256||''};
  }

  function applyDesignSystemTokens(scope='auto') {
    const preview=previewDesignSystemTokens(scope);if(!preview.ok){toast(preview.reason);return preview;}
    checkpoint('DESIGN.md token 적용');
    preview.changes.forEach(change=>{const object=activeSlide().objects.find(item=>item.id===change.objectId);if(!object)return;object.style||={};object.style[change.property.replace('style.','')]=change.after;});
    if(preview.accent){state.project.tweaks.accent=preview.accent;document.documentElement.style.setProperty('--accent',preview.accent);}
    state.project.designSystemApplications ||= [];
    state.project.designSystemApplications.push({schema:'canvas-design-system-application/1',at:new Date().toISOString(),sourceSha256:preview.sourceSha256,scope:preview.scope,targetCount:preview.targetCount,changedObjects:preview.changedObjects,changedProperties:preview.changedProperties,changes:deepCopy(preview.changes)});
    if(state.project.designSystemApplications.length>40)state.project.designSystemApplications.shift();
    state.designSyncPreview=null;renderAll();scheduleSave();toast(`${preview.changedProperties} style changes applied.`);return preview;
  }

  function buildLocalDesignSystemLibrary() {
    const design=state.project.designSystem;
    if(!design){toast('먼저 DESIGN.md를 가져오세요.');return {created:0,components:[]};}
    if((design.report?.errors||[]).length){toast('DESIGN.md validation error를 먼저 해결하세요.');return {created:0,components:[]};}
    const sourceHash=design.source?.sha256||'';
    const candidates=(design.components||[]).filter(item=>item?.name);
    if(!candidates.length){toast('DESIGN.md에 component 정의가 없습니다. token 적용은 계속 사용할 수 있습니다.');return {created:0,components:[]};}
    const colors=design.tokens?.colors||[];
    const accent=colors.find(item=>!['#FFFFFF','#000000'].includes(String(item.value||'').toUpperCase()))?.value||state.project.tweaks.accent||'#315CE7';
    const surface=colors.find(item=>String(item.value||'').toUpperCase()==='#FFFFFF')?.value||'#FFFFFF';
    const font=(design.tokens?.typography||[]).find(item=>item.name==='font-family')?.value||(design.tokens?.typography||[])[0]?.value||'Pretendard, sans-serif';
    const existing=new Set(state.project.components.filter(item=>item.provenance?.schema==='canvas-design-system-library/1'&&item.provenance.sourceSha256===sourceHash).map(item=>item.provenance.sourceComponent));
    const created=[];
    candidates.filter(item=>!existing.has(item.name)).forEach((definition,index)=>{
      const name=String(definition.name).trim(), semantic=name.toLowerCase();
      const groupId=uid('design-library-group'), componentId=uid('component');
      const isAction=/button|action|cta|submit|확인|저장/.test(semantic);
      const isPanel=/panel|card|description|summary|정보/.test(semantic);
      const width=isAction?220:isPanel?360:300, height=isAction?52:isPanel?148:96;
      const nodes=[];
      if(isAction){
        nodes.push({...shapeObject(`${name} surface`,0,0,width,height,{fill:accent,borderColor:accent,borderWidth:1,radius:8},{role:'primary-action',groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
        nodes.push({...textObject(`${name} label`,name,0,14,width,24,{fontFamily:font,fontSize:15,fontWeight:700,color:surface,textAlign:'center'},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
      }else if(isPanel){
        nodes.push({...shapeObject(`${name} surface`,0,0,width,height,{fill:surface,borderColor:accent,borderWidth:1,radius:10},{role:'description',groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
        nodes.push({...textObject(`${name} title`,name,18,18,width-36,24,{fontFamily:font,fontSize:15,fontWeight:800,color:accent},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
        nodes.push({...textObject(`${name} content`,'DESIGN.md 기반 내용',18,54,width-36,height-72,{fontFamily:font,fontSize:13,color:'#344054',lineHeight:1.5},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
      }else{
        nodes.push({...shapeObject(`${name} surface`,0,0,width,height,{fill:surface,borderColor:accent,borderWidth:1,radius:8},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
        nodes.push({...textObject(`${name} label`,name,16,Math.max(18,(height-24)/2),width-32,24,{fontFamily:font,fontSize:15,fontWeight:700,color:accent,textAlign:'center'},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});
      }
      nodes.forEach((node,nodeIndex)=>{delete node.id;node.componentGroupKey=groupId;node.z=nodeIndex+1;});
      created.push({id:componentId,name,w:width,h:height,createdAt:new Date().toISOString(),nodes,provenance:{schema:'canvas-design-system-library/1',sourceSha256:sourceHash,sourceComponent:name,generatedAt:new Date().toISOString(),generator:'deterministic-local'}});
    });
    if(!created.length){toast('현재 DESIGN.md 버전의 local component library가 이미 최신입니다.');return {created:0,components:[]};}
    checkpoint('DESIGN.md local component library 생성');
    state.project.components.push(...created);state.inspectorTab='components';renderAll();scheduleSave();
    const result={created:created.length,components:created.map(item=>item.name),sourceSha256:sourceHash};
    addMessage('action',`DESIGN.md local library: ${result.components.join(', ')} ${result.created}개를 생성했습니다. 외부 업로드 없이 Assets에서 instance로 삽입할 수 있습니다.`);
    toast(`DESIGN.md 기반 local component ${created.length}개를 만들었습니다.`);return result;
  }

  function attachComponentManifest(manifest) {
    if(!manifest||manifest.schema!=='source-component-manifest/1'||!Array.isArray(manifest.components)||!manifest.components.length)throw new Error('source-component-manifest/1 components contract가 필요합니다.');
    const sourceHash=String(manifest.source?.sha256||'');if(!/^[a-f0-9]{64}$/i.test(sourceHash))throw new Error('source manifest SHA-256이 필요합니다.');
    const catalog={schema:manifest.schema,name:String(manifest.name||'Source component catalog'),source:deepCopy(manifest.source),components:deepCopy(manifest.components),importedAt:new Date().toISOString()};
    const index=state.project.sourceComponentCatalogs.findIndex(item=>item.source?.sha256===sourceHash);checkpoint('source component manifest 연결');if(index>=0)state.project.sourceComponentCatalogs[index]=catalog;else state.project.sourceComponentCatalogs.push(catalog);state.inspectorTab='components';renderAll();scheduleSave();return catalog;
  }

  function buildSourceComponentLibrary() {
    const catalog=state.project.sourceComponentCatalogs.at(-1);if(!catalog){toast('먼저 source component manifest를 가져오세요.');return {created:0,components:[]};}
    const sourceHash=catalog.source.sha256,existing=new Set(state.project.components.filter(item=>item.provenance?.schema==='canvas-source-component-library/1'&&item.provenance.sourceSha256===sourceHash).map(item=>item.provenance.sourceComponent)),created=[];
    catalog.components.filter(item=>item?.name&&!existing.has(item.name)).forEach(source=>{const name=String(source.name),lower=name.toLowerCase(),id=uid('component'),groupId=uid('source-group'),isAction=/button|toggle/.test(lower),isInput=/input|selector|checkbox|radio|switch/.test(lower),isPanel=/card|panel|dialog|alert/.test(lower),w=isAction?220:isInput?300:isPanel?360:300,h=isAction?52:isInput?76:isPanel?150:96,nodes=[{...shapeObject(`${name} source surface`,0,0,w,h,{fill:isAction?'#315CE7':'#FFFFFF',borderColor:'#315CE7',borderWidth:1,radius:isAction?8:10},{role:isAction?'primary-action':'source-component',groupId,groupName:name}),id:undefined,nodeKey:uid('node')}];nodes.push({...textObject(`${name} source label`,name,16,isPanel?18:Math.max(14,(h-24)/2),w-32,24,{fontFamily:'Pretendard, sans-serif',fontSize:15,fontWeight:700,color:isAction?'#FFFFFF':'#315CE7',textAlign:isAction?'center':'left'},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});if(isPanel)nodes.push({...textObject(`${name} source note`,source.description||'Source-bound component contract',16,52,w-32,h-68,{fontFamily:'Pretendard, sans-serif',fontSize:12,color:'#344054',lineHeight:1.4},{groupId,groupName:name}),id:undefined,nodeKey:uid('node')});nodes.forEach((node,index)=>{delete node.id;node.componentGroupKey=groupId;node.z=index+1;});created.push({id,name,w,h,createdAt:new Date().toISOString(),nodes,provenance:{schema:'canvas-source-component-library/1',sourceSha256:sourceHash,sourceComponent:name,sourceFile:source.sourceFile||'',generator:'deterministic-local-reference',limitations:['Canvas representation is a local editable reference, not a React runtime render.']}});});
    if(!created.length){toast('현재 source manifest 버전의 local reference library가 이미 최신입니다.');return {created:0,components:[]};}checkpoint('source component local reference library 생성');state.project.components.push(...created);renderAll();scheduleSave();toast(`source-bound local reference ${created.length}개를 만들었습니다.`);return {created:created.length,components:created.map(item=>item.name),sourceSha256:sourceHash};
  }

  function renderDesignSystem(root) {
    const catalog=state.project.sourceComponentCatalogs.at(-1);
    if(catalog){const sourceBlock=section(`Source component catalog · ${catalog.name}`),meta=document.createElement('p');meta.className='code-hint';meta.textContent=`${catalog.components.length} components · ${catalog.source.sha256.slice(0,12)}… · ${catalog.source.root||'local source'}`;sourceBlock.append(meta);const build=document.createElement('button');build.className='component-primary';build.textContent=`Build source-bound local references (${catalog.components.length})`;build.addEventListener('click',buildSourceComponentLibrary);sourceBlock.append(build);const limitation=document.createElement('p');limitation.className='code-hint';limitation.textContent='Local editable references only · React runtime rendering is not claimed';sourceBlock.append(limitation);root.append(sourceBlock);}
    const design=state.project.designSystem;if(!design)return;
    const block=section(`DESIGN.md · ${design.name}`),meta=document.createElement('div');meta.className='design-source';const warnings=design.report?.summary?.warnings||0;meta.textContent=`${design.source.fileName} · ${design.source.parserVersion||'legacy parser'} · ${design.source.sha256.slice(0,12)}… · ${warnings} warnings`;block.append(meta);
    const colors=document.createElement('div');colors.className='design-token-grid';(design.tokens?.colors||[]).forEach(token=>{const item=document.createElement('div');item.className='design-token';const swatch=document.createElement('i');swatch.style.background=token.value;const label=document.createElement('span');label.textContent=`${token.name} · ${token.value}`;item.append(swatch,label);colors.append(item);});block.append(colors);
    const summary=document.createElement('p');summary.className='code-hint';summary.textContent=`${design.rules?.length||0} rules · ${design.components?.length||0} components · ${design.tokens?.typography?.length||0} typography tokens`;block.append(summary);
    const scopeField=document.createElement('div');scopeField.className='field-wide';const scopeLabel=document.createElement('label');scopeLabel.textContent='Apply scope';const scope=document.createElement('select');[['auto','Auto (selection, otherwise current slide)'],['selection','Selection only'],['slide','Current slide']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;scope.append(option);});scope.value=state.designSyncPreview?.scope||'auto';scopeField.append(scopeLabel,scope);block.append(scopeField);
    const preview=document.createElement('button');preview.className='component-primary';preview.textContent='Preview DESIGN.md token changes';preview.addEventListener('click',()=>{state.designSyncPreview=previewDesignSystemTokens(scope.value);renderInspector();});block.append(preview);
    const proposal=state.designSyncPreview;
    if(proposal){const panel=document.createElement('div');panel.className='design-sync-preview';const title=document.createElement('strong');title.textContent=proposal.ok?`${proposal.scope} · ${proposal.changedProperties} property changes`:'Preview unavailable';const detail=document.createElement('p');detail.textContent=proposal.ok?`${proposal.targetCount} targets · ${proposal.changedObjects} objects · ${proposal.sourceSha256.slice(0,12)}…`:proposal.reason;const list=document.createElement('ul');(proposal.changes||[]).slice(0,8).forEach(change=>{const item=document.createElement('li');item.textContent=`${change.objectName} · ${change.property.replace('style.','')}: ${change.before||'∅'} → ${change.after}`;list.append(item);});panel.append(title,detail,list);if(proposal.ok){const apply=document.createElement('button');apply.className='component-primary';apply.textContent='Apply preview';apply.disabled=!proposal.changedProperties;apply.addEventListener('click',()=>applyDesignSystemTokens(proposal.scope));panel.append(apply);}block.append(panel);}
    const library=document.createElement('button');library.className='component-primary';library.textContent=`Build local component library (${design.components?.length||0})`;library.addEventListener('click',buildLocalDesignSystemLibrary);block.append(library);
    const localOnly=document.createElement('p');localOnly.className='code-hint';localOnly.textContent='Deterministic local generation · no cloud upload or external design account';block.append(localOnly);
    (design.rules||[]).slice(0,5).forEach(rule=>{const item=document.createElement('p');item.className=`design-rule is-${rule.level}`;item.textContent=`${rule.level.toUpperCase()} · ${rule.text}`;block.append(item);});root.append(block);
  }

  function renderComponents(root) {
    renderDesignSystem(root);
    const create = document.createElement('button');
    create.className = 'component-primary';
    create.textContent = '◆ Create component from selection';
    create.addEventListener('click', createComponentFromSelection);
    root.append(create);
    const selected = selectedObject();
    if (selected?.componentKind === 'instance') {
      const instance = section('Selected instance');
      const actions = document.createElement('div'); actions.className='stack-actions';
      const reset=document.createElement('button'); reset.textContent='Reset overrides'; reset.addEventListener('click',()=>resetInstance(selected.instanceId));
      const detach=document.createElement('button'); detach.textContent='Detach instance'; detach.addEventListener('click',()=>detachInstance(selected.instanceId));
      actions.append(reset,detach); instance.append(actions); root.append(instance);
    }
    const list = document.createElement('div'); list.className='component-list';
    state.project.components.forEach(component=>{
      const card=document.createElement('article'); card.className='component-card'; card.draggable=true; card.dataset.componentId=component.id; card.title='캔버스로 드래그해 인스턴스 삽입';
      const header=document.createElement('header');
      const glyph=document.createElement('span'); glyph.className='component-glyph'; glyph.textContent='◆';
      const meta=document.createElement('div'); const name=document.createElement('b'); name.textContent=component.name;
      const count=document.createElement('small'); const instances=state.project.slides.flatMap(slide=>slide.objects).filter(object=>object.componentId===component.id&&object.componentKind==='instance').map(object=>object.instanceId).filter((id,index,array)=>array.indexOf(id)===index).length; count.textContent=`${component.nodes.length} layers · ${instances} instances`; meta.append(name,count); header.append(glyph,meta);
      const remove=document.createElement('button'); remove.className='component-delete'; remove.textContent='×'; remove.title=`${component.name} 라이브러리 삭제`; remove.setAttribute('aria-label',`${component.name} 라이브러리 삭제`); remove.addEventListener('click',event=>{event.stopPropagation();if(window.confirm(`“${component.name}” 컴포넌트 라이브러리를 삭제할까요? 기존 객체는 유지되고 연결만 해제됩니다.`))deleteComponent(component.id);}); header.append(remove);
      const footer=document.createElement('footer');
      const insert=document.createElement('button'); insert.textContent='Insert instance'; insert.addEventListener('click',()=>insertComponentInstance(component.id));
      footer.append(insert); card.append(header,footer);
      card.addEventListener('dragstart',event=>{card.classList.add('is-dragging');event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(COMPONENT_MIME,component.id);event.dataTransfer.setData('text/plain',`canvas-component:${component.id}`);});
      card.addEventListener('dragend',()=>card.classList.remove('is-dragging'));
      list.append(card);
    });
    if (!state.project.components.length) { const empty=document.createElement('div'); empty.className='inspector-empty'; empty.textContent='객체를 선택한 뒤 컴포넌트를 만들면 여러 슬라이드에서 재사용할 수 있습니다.'; list.append(empty); }
    root.append(list);
  }

  function renderComments(root) {
    const all = (state.project.comments || []).filter(comment => comment.slideId === activeSlide().id);
    const resolvedCount = all.filter(comment => comment.resolved).length;
    const comments = all.filter(comment => !comment.resolved || state.showResolved);

    const toolbar = document.createElement('div');
    toolbar.className = 'comment-toolbar';
    const title = document.createElement('strong'); title.textContent = 'Comments';
    const toggle = document.createElement('button');
    toggle.id = 'toggleResolved';
    toggle.textContent = state.showResolved ? `Hide ${resolvedCount} resolved` : `Show ${resolvedCount} resolved`;
    toggle.disabled = resolvedCount === 0;
    toolbar.append(title, toggle); root.append(toolbar);

    if (!comments.length) {
      const empty = document.createElement('div');
      empty.className = 'inspector-empty';
      empty.textContent = '캔버스를 클릭해 pin을 남기거나 드래그해 검토 영역을 지정하세요.';
      root.append(empty);
    } else {
      const list = document.createElement('div'); list.className = 'comment-list';
      comments.forEach((comment, index) => {
        const card = document.createElement('article');
        card.className = `comment-card ${comment.resolved ? 'is-resolved' : ''}`;
        card.dataset.commentCard = comment.id;
        const header = document.createElement('header');
        const who = document.createElement('div');
        const author = document.createElement('b'); author.textContent = `${index + 1}. ${comment.author}`;
        const when = document.createElement('small'); when.textContent = comment.createdAt ? new Date(comment.createdAt).toLocaleString('ko-KR') : '';
        who.append(author, when);
        const status = document.createElement('button'); status.dataset.commentId = comment.id; status.textContent = comment.resolved ? 'Reopen' : 'Resolve';
        header.append(who, status); card.append(header);
        if (comment.targetName) { const quote=document.createElement('div'); quote.className='comment-quote'; quote.textContent=`${activeSlide().title} · “${comment.targetName}”`; card.append(quote); }
        const body = document.createElement('p'); body.textContent = comment.text; card.append(body);
        if (comment.attachment?.name) { const attachment=document.createElement('div'); attachment.className='comment-quote'; attachment.textContent=`Attachment · ${comment.attachment.name}`; card.append(attachment); }
        if (comment.replies?.length) {
          const replies=document.createElement('div'); replies.className='comment-replies';
          comment.replies.forEach(reply=>{const item=document.createElement('div'); item.className='comment-reply'; item.textContent=`${reply.author}: ${reply.text}`; replies.append(item);});
          card.append(replies);
        }
        const replyForm=document.createElement('div'); replyForm.className='reply-form';
        const replyInput=document.createElement('input'); replyInput.placeholder='Reply…'; replyInput.dataset.replyInput=comment.id;
        const replyButton=document.createElement('button'); replyButton.textContent='Reply'; replyButton.dataset.replyButton=comment.id;
        replyForm.append(replyInput,replyButton); card.append(replyForm); list.append(card);
      });
      root.append(list);
    }

    const composer = document.createElement('section'); composer.className='comment-composer';
    const textarea=document.createElement('textarea'); textarea.id='commentText'; textarea.placeholder='Add a comment…';
    const actions=document.createElement('div'); actions.className='comment-composer-actions';
    const attach=document.createElement('button'); attach.type='button'; attach.id='attachComment'; attach.textContent='Attach';
    const attachmentName=document.createElement('span'); attachmentName.textContent=state.commentAttachment?.name || (state.commentDraft ? '검토 영역 지정됨' : 'Click to comment, drag to draw');
    const send=document.createElement('button'); send.type='button'; send.id='sendComment'; send.className='save-edit-button'; send.textContent='Send';
    actions.append(attach,attachmentName,send); composer.append(textarea,actions); root.append(composer);

    toggle.addEventListener('click',()=>{state.showResolved=!state.showResolved;renderStage();renderInspector();});
    $$('[data-comment-id]',root).forEach(button=>button.addEventListener('click',()=>{
      checkpoint('댓글 상태 변경'); const comment=state.project.comments.find(item=>item.id===button.dataset.commentId); comment.resolved=!comment.resolved; renderStage();renderInspector();scheduleSave();
    }));
    $$('[data-reply-button]',root).forEach(button=>button.addEventListener('click',()=>{
      const input=$(`[data-reply-input="${button.dataset.replyButton}"]`,root); const text=input.value.trim(); if(!text)return;
      checkpoint('댓글 답글'); const comment=state.project.comments.find(item=>item.id===button.dataset.replyButton); comment.replies.push({id:uid('reply'),author:'You',text,createdAt:new Date().toISOString()}); renderInspector();scheduleSave();
    }));
    attach.addEventListener('click',()=>$('#commentAttachmentInput').click());
    send.addEventListener('click',()=>{
      const text=textarea.value.trim(); if(!text)return toast('댓글 내용을 입력하세요.');
      checkpoint('댓글 추가');
      const anchor=state.commentDraft || {x:stageWidth()/2,y:stageHeight()/2,w:0,h:0};
      state.project.comments.push({id:uid('comment'),slideId:activeSlide().id,...anchor,author:'You',text,resolved:false,createdAt:new Date().toISOString(),replies:[],attachment:state.commentAttachment,targetName:selectedObject()?.name || null});
      state.commentDraft=null; state.commentAttachment=null; renderStage();renderInspector();scheduleSave();
    });
  }

  function normalizeColor(value) {
    if (!value || value === 'transparent') return '#ffffff';
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  }

  function setNested(target, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    let node = target;
    parts.forEach(part => { node[part] ||= {}; node = node[part]; });
    node[last] = value;
  }

  function updateSelectedProperty(path, rawValue, inputType) {
    checkpoint(`속성 변경: ${path}`);
    const value = inputType === 'number' ? Number(rawValue) : rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
    if (path.startsWith('slide.')) setNested(activeSlide(), path.replace('slide.', ''), value);
    else selectedObjects().forEach(object => { setNested(object, path, value); syncComponentFromObject(object, path); });
    renderAll();
    scheduleSave();
  }

  function handleObjectAction(action) {
    const objects = selectedObjects();
    if (!objects.length) return;
    checkpoint(`${action}: ${objects.map(item => item.name).join(', ')}`);
    if (action === 'front') objects.forEach(object => object.z = Math.max(...activeSlide().objects.map(item => item.z || 0)) + 1);
    if (action === 'back') objects.forEach(object => object.z = Math.max(1, Math.min(...activeSlide().objects.map(item => item.z || 1)) - 1));
    if (action === 'duplicate') duplicateObjects(false);
    if (action === 'delete') activeSlide().objects = activeSlide().objects.filter(object => !state.selectedIds.includes(object.id));
    state.selectedIds = [];
    renderAll(); scheduleSave();
  }

  function duplicateObjects(withCheckpoint = true) {
    const objects = selectedObjects();
    if (!objects.length) return toast('복제할 객체를 선택하세요.');
    if (withCheckpoint) checkpoint('객체 복제');
    const groupMap = new Map();
    const copies = objects.map(object => {
      const copy = {...deepCopy(object), id: uid(object.type), name: `${object.name} copy`, x: clamp(object.x + 16, 0, stageWidth() - object.w), y: clamp(object.y + 16, 0, stageHeight() - object.h), locked: false};
      if (copy.groupId) {
        if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, uid('group'));
        copy.groupId = groupMap.get(copy.groupId);
        copy.groupName = `${copy.groupName || 'Group'} copy`;
      }
      return copy;
    });
    activeSlide().objects.push(...copies);
    state.selectedIds = copies.map(object => object.id);
    renderAll(); scheduleSave();
  }

  function selectionPayload() {
    const ids=new Set(expandGroupedIds(state.selectedIds)); const objects=activeSlide().objects.filter(object=>ids.has(object.id)); if(!objects.length)return null;
    return {schema:'canvas-ir/1',sourceMode:state.editorMode,sourceProjectId:state.project.id,copiedAt:new Date().toISOString(),nodes:deepCopy(objects)};
  }

  function copySelection(cut=false) {
    const payload=selectionPayload(); if(!payload)return toast('복사할 객체를 선택하세요.');
    state.clipboard=payload;
    navigator.clipboard?.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`).catch(()=>{});
    if(cut){checkpoint('객체 잘라내기');const ids=new Set(payload.nodes.map(object=>object.id));activeSlide().objects=activeSlide().objects.filter(object=>!ids.has(object.id));state.selectedIds=[];renderAll();scheduleSave();}
    toast(`${payload.nodes.length}개 객체를 ${cut?'잘라냈습니다':'복사했습니다'} · ${payload.sourceMode.toUpperCase()} IR`);
  }

  function pastePayload(payload) {
    if(payload?.schema!=='canvas-ir/1'||!Array.isArray(payload.nodes)||!payload.nodes.length)return false;
    checkpoint('Canvas IR 붙여넣기');
    const idMap=new Map(),groupMap=new Map();
    payload.nodes.forEach(node=>idMap.set(node.id,uid(node.type||'node')));
    const maxZ=Math.max(...activeSlide().objects.map(object=>object.z||0),0);
    const copies=payload.nodes.map((node,index)=>{
      const copy=deepCopy(node),oldId=copy.id; copy.id=idMap.get(oldId); copy.name=`${copy.name||copy.type} copy`; copy.x=clamp(Number(copy.x||0)+24,-stageMargin(),stageWidth()+stageMargin()-Number(copy.w||0)); copy.y=clamp(Number(copy.y||0)+24,-stageMargin(),stageHeight()+stageMargin()-Number(copy.h||0)); copy.z=maxZ+index+1; copy.locked=false;
      if(copy.groupId){if(!groupMap.has(copy.groupId))groupMap.set(copy.groupId,uid('group'));copy.groupId=groupMap.get(copy.groupId);}
      if(copy.parentId)copy.parentId=idMap.get(copy.parentId)||null;
      if(copy.componentId&&!state.project.components.some(component=>component.id===copy.componentId)){delete copy.componentId;delete copy.componentKind;delete copy.componentNodeKey;delete copy.instanceId;delete copy.overrides;}
      copy.compatibility={...(copy.compatibility||{}),pastedFrom:payload.sourceMode||'canvas',pastedInto:state.editorMode};
      return copy;
    });
    activeSlide().objects.push(...copies);state.selectedIds=copies.map(object=>object.id);renderAll();scheduleSave();toast(`${copies.length}개 객체를 ${state.editorMode.toUpperCase()} mode에 붙였습니다.`);return true;
  }

  async function pasteSelection() {
    if(state.clipboard&&pastePayload(state.clipboard))return;
    try{const text=await navigator.clipboard.readText();if(text.startsWith(CLIPBOARD_PREFIX)&&pastePayload(JSON.parse(text.slice(CLIPBOARD_PREFIX.length))))return;}catch{}
    toast('Canvas Studio에서 복사한 객체가 없습니다.');
  }

  function reflowAutoLayout(frame) {
    const layout=frame.layout||{}; const children=activeSlide().objects.filter(object=>object.parentId===frame.id).sort((a,b)=>(a.layoutOrder||0)-(b.layoutOrder||0)); if(!children.length)return;
    const padding=Number(layout.padding??16),gap=Number(layout.gap??12),horizontal=layout.direction!=='vertical'; let cursor=padding,maxCross=0;
    children.forEach((child,index)=>{child.layoutOrder=index;if(horizontal){child.x=frame.x+cursor;child.y=frame.y+padding;cursor+=child.w+gap;maxCross=Math.max(maxCross,child.h);}else{child.x=frame.x+padding;child.y=frame.y+cursor;cursor+=child.h+gap;maxCross=Math.max(maxCross,child.w);}});
    if(layout.sizing==='hug'){if(horizontal){frame.w=Math.max(32,cursor-gap+padding);frame.h=Math.max(32,maxCross+padding*2);}else{frame.w=Math.max(32,maxCross+padding*2);frame.h=Math.max(32,cursor-gap+padding);}}
  }

  function createAutoLayout() {
    const selected=selectedObjects().filter(object=>!object.locked); if(!selected.length)return toast('Auto layout으로 묶을 객체를 선택하세요.');
    if(selected.length===1&&selected[0].role==='frame'){checkpoint('Auto layout 방향 변경');const frame=selected[0];frame.layout||={mode:'auto',direction:'horizontal',gap:12,padding:16,sizing:'hug'};frame.layout.direction=frame.layout.direction==='horizontal'?'vertical':'horizontal';reflowAutoLayout(frame);renderAll();scheduleSave();return;}
    if(selected.length<2)return toast('객체 2개 이상을 선택하거나 기존 frame을 선택하세요.');
    checkpoint('Auto layout frame 생성'); const minX=Math.min(...selected.map(object=>object.x)),minY=Math.min(...selected.map(object=>object.y)),maxX=Math.max(...selected.map(object=>object.x+object.w)),maxY=Math.max(...selected.map(object=>object.y+object.h));
    const frame=shapeObject('Auto layout frame',minX-16,minY-16,maxX-minX+32,maxY-minY+32,{fill:'transparent',borderColor:'#7c3aed',borderWidth:1,radius:4},{role:'frame',layout:{mode:'auto',direction:'horizontal',gap:12,padding:16,sizing:'hug'},clipsContent:false,constraints:{horizontal:'left',vertical:'top'},z:Math.max(1,Math.min(...selected.map(object=>object.z||1))-.1)});
    activeSlide().objects.push(frame); selected.sort((a,b)=>a.x-b.x||a.y-b.y).forEach((object,index)=>{object.parentId=frame.id;object.layoutOrder=index;object.constraints||={horizontal:'left',vertical:'top'};}); reflowAutoLayout(frame); state.selectedIds=[frame.id];renderAll();scheduleSave();toast('Figma auto layout frame을 만들었습니다. Shift+A로 방향을 전환합니다.');
  }

  function addText() {
    checkpoint('텍스트 추가');
    const object = textObject('새 텍스트', '텍스트를 입력하세요', 340, 225, 280, 60, {fontSize:24, fontWeight:700});
    object.z = Math.max(...activeSlide().objects.map(item => item.z || 0), 0) + 1;
    activeSlide().objects.push(object);
    state.selectedIds = [object.id];
    renderAll(); scheduleSave();
  }

  function addShape() {
    checkpoint('도형 추가');
    const object = shapeObject('새 도형', 370, 210, 220, 120, {fill:'#e9edff', borderColor:'#315ce7', borderWidth:1, radius:4});
    object.z = Math.max(...activeSlide().objects.map(item => item.z || 0), 0) + 1;
    activeSlide().objects.push(object);
    state.selectedIds = [object.id];
    renderAll(); scheduleSave();
  }

  function addToolObject(tool) {
    if (tool === 'select' || tool === 'interact' || tool === 'draw') return setTool(tool);
    if (tool === 'text') { addText(); return setTool('select'); }
    if (tool === 'rectangle') { addShape(); return setTool('select'); }
    checkpoint(`${tool} 추가`);
    let object;
    if (tool === 'frame') object = shapeObject('새 프레임', 250, 115, 460, 310, {fill:'transparent',borderColor:'#7f807b',borderWidth:2,radius:0},{role:'frame'});
    if (tool === 'oval') object = shapeObject('새 타원', 365, 190, 230, 160, {fill:'#e9edff',borderColor:'#315ce7',borderWidth:1,radius:999},{kind:'oval'});
    if (tool === 'line') object = pathObject('새 선', 350, 265, 260, 8, [{x:0,y:4},{x:260,y:4}], {stroke:'#315ce7',strokeWidth:3});
    if (tool === 'arrow') object = pathObject('새 화살표', 350, 235, 260, 70, [{x:0,y:65},{x:260,y:5}], {stroke:'#315ce7',strokeWidth:3}, {arrow:true});
    if (!object) return;
    object.z = Math.max(...activeSlide().objects.map(item=>item.z||0),0)+1;
    activeSlide().objects.push(object); state.selectedIds=[object.id]; state.tool='select'; renderAll(); scheduleSave();
  }

  function addShapeKind(kind) {
    const definition=SHAPE_LIBRARY.find(item=>item.kind===kind); if(!definition)return;
    const selected=selectedObjects().filter(object=>object.type==='shape');
    checkpoint(selected.length?'도형 변경':'도형 삽입');
    if(selected.length) selected.forEach(object=>{object.kind=kind;object.style.radius=kind==='rounded'?16:kind==='oval'?999:0;});
    else {const object=shapeObject(definition.label,370,210,220,120,{fill:'#e9edff',borderColor:'#315ce7',borderWidth:1,radius:kind==='rounded'?16:kind==='oval'?999:0},{kind});object.z=Math.max(...activeSlide().objects.map(item=>item.z||0),0)+1;activeSlide().objects.push(object);state.selectedIds=[object.id];}
    renderAll();scheduleSave();hidePopovers();
  }

  function addSymbol(symbol) {
    checkpoint('기호 삽입'); const object=textObject('기호',symbol,420,230,120,80,{fontSize:42,fontWeight:400,textAlign:'center'}); object.z=Math.max(...activeSlide().objects.map(item=>item.z||0),0)+1;activeSlide().objects.push(object);state.selectedIds=[object.id];renderAll();scheduleSave();hidePopovers();
  }

  function toggleStrike() {
    const objects=selectedObjects().filter(object=>object.type==='text'); if(!objects.length)return toast('취소선을 적용할 텍스트를 선택하세요.'); checkpoint('취소선'); const enabled=!objects.every(object=>object.style.strike); objects.forEach(object=>{object.style.strike=enabled;syncComponentFromObject(object,'style.strike');});renderAll();scheduleSave();
  }

  function openCropControls() {
    const image=selectedObject(); if(image?.type!=='image')return toast('자르기할 이미지를 선택하세요.'); image.style||={}; image.style.objectFit='cover'; image.style.cropZoom??=1; image.style.cropX??=50; image.style.cropY??=50; state.inspectorTab='properties';state.editPanel='pro';renderInspector();toast('오른쪽 Crop zoom / X / Y로 이미지를 자르세요.');
  }

  function applyPickedColor(color) {
    const objects=selectedObjects(); if(!objects.length)return toast('색상을 적용할 객체를 선택하세요.'); checkpoint('스포이트 색상'); objects.forEach(object=>{if(object.type==='text')object.style.color=color;else if(object.type==='path')object.style.stroke=color;else object.style.fill=color;});renderAll();scheduleSave();
  }

  async function pickColor() {
    if(window.EyeDropper){try{const result=await new EyeDropper().open();applyPickedColor(result.sRGBHex);}catch(error){if(error.name!=='AbortError')toast('스포이트를 사용할 수 없습니다.');}return;}
    const input=document.createElement('input');input.type='color';input.value='#315ce7';input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.addEventListener('change',()=>{applyPickedColor(input.value);input.remove();},{once:true});input.addEventListener('blur',()=>setTimeout(()=>input.remove(),0),{once:true});input.click();
  }

  function renderOfficePalettes() {
    const symbols=$('.symbol-grid');symbols.replaceChildren();SYMBOLS.forEach(symbol=>{const button=document.createElement('button');button.textContent=symbol;button.title=`${symbol} 삽입`;button.addEventListener('click',()=>addSymbol(symbol));symbols.append(button);});
    const shapes=$('.shape-gallery');shapes.replaceChildren();SHAPE_LIBRARY.forEach(item=>{const button=document.createElement('button');const glyph=document.createElement('b');glyph.textContent=item.glyph;const label=document.createElement('span');label.textContent=item.label;button.append(glyph,label);button.addEventListener('click',()=>addShapeKind(item.kind));shapes.append(button);});
  }

  function setTool(tool) {
    state.tool = tool;
    $$('.direct-tools button').forEach(button=>button.classList.toggle('is-active',button.dataset.tool===tool));
    renderStage();
  }

  function setEditPanel(panel) {
    state.editPanel = panel;
    $$('.edit-depth-tabs button').forEach(button=>button.classList.toggle('is-active',button.dataset.editPanel===panel));
    state.inspectorTab='properties'; renderInspector();
  }

  function saveEdits() {
    state.editBaseline = JSON.stringify(state.project);
    scheduleSave(); toast('편집 내용을 저장했습니다.');
  }

  function discardEdits() {
    if (!state.editBaseline) return toast('폐기할 편집 내용이 없습니다.');
    state.project = JSON.parse(state.editBaseline); normalizeProject(); state.selectedIds=[]; state.history=[]; state.future=[];
    renderAll(); scheduleSave(); toast('마지막 저장 상태로 되돌렸습니다.');
  }

  function addImageFromFile(file, dropPoint = null) {
    if (!file || !file.type.startsWith('image/')) return toast('이미지 파일을 선택하세요.');
    const reader = new FileReader();
    reader.onload = () => {
      checkpoint('이미지 추가');
      const w=360,h=240,x=dropPoint?clamp(Math.round(dropPoint.x-w/2),-stageMargin(),stageWidth()+stageMargin()-w):300,y=dropPoint?clamp(Math.round(dropPoint.y-h/2),-stageMargin(),stageHeight()+stageMargin()-h):145;
      const object = {id:uid('image'), type:'image', name:file.name, x, y, w, h, z:Math.max(...activeSlide().objects.map(item=>item.z||0),0)+1, src:reader.result, alt:file.name, style:{objectFit:'contain'}};
      activeSlide().objects.push(object);
      state.selectedIds = [object.id];
      renderAll(); scheduleSave();
    };
    reader.readAsDataURL(file);
  }

  function setEditorMode(mode) {
    if(!['pptx','figma'].includes(mode)||mode===state.editorMode)return;
    checkpoint(`편집 모드: ${mode}`);state.editorMode=mode;state.project.editingMode=mode;state.selectedIds=[];
    if(mode==='figma'&&state.viewMode==='master'){state.viewMode='normal';state.activeLayoutId=null;}
    renderAll();scheduleSave();toast(mode==='pptx'?'PPTX document · slide/section/master shortcuts':'Canvas shortcuts · frame/auto layout/component shortcuts');
  }

  function setViewMode(mode) {
    if (!['normal','sorter','master'].includes(mode)) return;
    if(mode==='master'&&state.editorMode!=='pptx')return toast('Slide Master는 PPTX mode에서 편집하세요.');
    state.viewMode=mode; state.selectedIds=[]; state.drag=null; state.commentDraft=null;
    if (mode==='master') { state.mode='edit'; state.inspectorTab='properties'; state.activeLayoutId=null; }
    renderAll(); scheduleSave();
    toast(mode==='master'?'슬라이드 마스터 편집':mode==='sorter'?'여러 슬라이드 보기':'기본 편집 보기');
  }

  function addSection() {
    checkpoint('섹션 추가');
    const section={id:uid('section'),name:`Section ${state.project.sections.length+1}`,collapsed:false};
    state.project.sections.push(section); renderSlideList(); scheduleSave();
  }

  function moveSection(sectionId,delta) {
    const from=state.project.sections.findIndex(section=>section.id===sectionId),to=clamp(from+delta,0,state.project.sections.length-1);
    if(from<0||from===to)return; checkpoint('섹션 이동'); const [section]=state.project.sections.splice(from,1); state.project.sections.splice(to,0,section); renderSlideList(); scheduleSave();
  }

  function reorderSection(draggedId,targetId) {
    const from=state.project.sections.findIndex(section=>section.id===draggedId),to=state.project.sections.findIndex(section=>section.id===targetId);
    if(from<0||to<0||from===to)return; checkpoint('섹션 재정렬'); const [section]=state.project.sections.splice(from,1); state.project.sections.splice(to,0,section); renderSlideList(); scheduleSave();
  }

  function deleteSection(sectionId) {
    if(state.project.sections.length===1)return toast('마지막 섹션은 삭제할 수 없습니다.');
    const section=state.project.sections.find(item=>item.id===sectionId); if(!section)return;
    if(!window.confirm(`“${section.name}” 섹션을 삭제할까요? 슬라이드는 다음 섹션으로 이동합니다.`))return;
    checkpoint('섹션 삭제'); const fallback=state.project.sections.find(item=>item.id!==sectionId); state.project.slides.filter(slide=>slide.sectionId===sectionId).forEach(slide=>slide.sectionId=fallback.id); state.project.sections=state.project.sections.filter(item=>item.id!==sectionId); renderAll(); scheduleSave();
  }

  function reorderSlide(draggedId,targetId,sectionId) {
    if(!draggedId||draggedId===targetId)return; const activeId=currentSlide().id; const from=state.project.slides.findIndex(slide=>slide.id===draggedId); if(from<0)return;
    checkpoint('슬라이드 이동'); const [slide]=state.project.slides.splice(from,1); const to=state.project.slides.findIndex(item=>item.id===targetId); slide.sectionId=sectionId||slide.sectionId; state.project.slides.splice(to<0?state.project.slides.length:to,0,slide); state.activeSlide=state.project.slides.findIndex(item=>item.id===activeId); renderAll(); scheduleSave();
  }

  function setActiveSlide(index) {
    state.activeSlide = clamp(index, 0, state.project.slides.length - 1);
    state.selectedIds = [];
    renderAll(); scheduleSave();
  }

  function addSlide() {
    if(state.viewMode==='master')setViewMode('normal');
    checkpoint('슬라이드 추가');
    const basis=currentSlide(),sectionId=basis.sectionId||state.project.sections[0].id;
    const slide = {id:uid('slide'), title:`새 슬라이드 ${state.project.slides.length + 1}`, background:'#ffffff', notes:'', sizePreset:basis.sizePreset, width:stageWidth(basis), height:stageHeight(basis), sectionId, masterId:basis.masterId||state.project.masters[0].id, layoutId:basis.layoutId||layoutForSlide(basis)?.id||'', objects:[textObject('제목', '새 슬라이드', 70, 70, Math.max(120,stageWidth(basis)-140), 70, {fontSize:36, fontWeight:800})]};
    state.project.slides.push(slide);
    state.activeSlide = state.project.slides.length - 1;
    state.selectedIds = [];
    renderAll(); scheduleSave();
  }

  function duplicateSlide(index) {
    checkpoint('슬라이드 복제');
    const source = deepCopy(state.project.slides[index]);
    source.id = uid('slide');
    source.title = `${source.title} copy`;
    source.objects.forEach(object => object.id = uid(object.type));
    state.project.slides.splice(index + 1, 0, source);
    state.activeSlide = index + 1;
    state.selectedIds = [];
    renderAll(); scheduleSave();
  }

  function deleteSlide(index) {
    if (state.project.slides.length === 1) return toast('마지막 슬라이드는 삭제할 수 없습니다.');
    checkpoint('슬라이드 삭제');
    state.project.slides.splice(index, 1);
    state.activeSlide = clamp(index - 1, 0, state.project.slides.length - 1);
    state.selectedIds = [];
    renderAll(); scheduleSave();
  }

  function addMessage(role, text) {
    state.project.conversation ||= [];
    state.project.conversation.push({id:uid('msg'), role, text, at:new Date().toISOString()});
    if (state.project.conversation.length > 40) state.project.conversation.shift();
    renderMessages(); scheduleSave();
  }

  function applyPrompt(raw) {
    const prompt = raw.trim();
    if (!prompt) return;
    addMessage('user', prompt);
    const lower = prompt.toLowerCase();
    let result = '';
    let changed = false;

    if (prompt.includes('하단 표') && (prompt.includes('제거') || prompt.includes('삭제'))) {
      const targets = activeSlide().objects.filter(object => object.role === 'footer-table' || /하단.*표|규칙표|acceptance/i.test(object.name));
      if (targets.length) {
        checkpoint('하단 표 제거');
        activeSlide().objects = activeSlide().objects.filter(object => !targets.includes(object));
        changed = true;
        result = `${targets.length}개의 하단 표/규칙 객체를 제거했습니다.`;
      } else result = '현재 슬라이드에는 하단 표나 규칙 패널이 없습니다. 구조를 유지했습니다.';
    } else if (prompt.includes('설명') && /24\s*%/.test(prompt)) {
      const targets = activeSlide().objects.filter(object => object.role === 'description');
      if (targets.length) {
        checkpoint('Description 24%');
        const x = Math.round(stageWidth() * .74);
        targets.forEach(object => { object.x = x; object.w = stageWidth() - x - 25; });
        changed = true;
        result = `Description 객체 ${targets.length}개를 오른쪽 24% 영역에 맞췄습니다.`;
      } else result = 'Description 역할 객체가 없어 변경하지 않았습니다.';
    } else if ((lower.includes('design.md') || prompt.includes('디자인 시스템')) && /(컴포넌트|라이브러리).*(생성|동기화|sync)|(?:생성|동기화|sync).*(컴포넌트|라이브러리)/i.test(prompt)) {
      if (!state.project.designSystem) result = '먼저 DESIGN.md를 가져오세요.';
      else { const library=buildLocalDesignSystemLibrary(); changed=library.created>0; result=library.created ? `${library.created}개 DESIGN.md component를 local Assets library로 만들었습니다.` : '생성할 새 local component가 없습니다.'; }
    } else if ((lower.includes('design.md') || prompt.includes('디자인 시스템')) && (prompt.includes('적용') || lower.includes('apply'))) {
      if (!state.project.designSystem) result = '먼저 DESIGN.md를 가져오세요.';
      else { applyDesignSystemTokens(); changed = true; result = `${state.project.designSystem.name} token contract를 현재 편집면에 적용했습니다.`; }
    } else if (lower.includes('font') || prompt.includes('폰트')) {
      const family = /kopub/i.test(prompt) ? 'KoPubDotum, KoPubWorldDotum, sans-serif' : 'Pretendard, Noto Sans KR, sans-serif';
      const targets = selectedObjects().length ? selectedObjects().filter(item => item.type === 'text') : activeSlide().objects.filter(item => item.type === 'text');
      checkpoint('폰트 변경');
      targets.forEach(object => object.style.fontFamily = family);
      changed = true;
      result = `${targets.length}개 텍스트 객체에 ${family.split(',')[0]}을 적용했습니다.`;
    } else if (prompt.includes('가운데') && prompt.includes('정렬')) {
      const targets = selectedObjects();
      if (!targets.length) result = '가운데 정렬할 객체를 먼저 선택하세요.';
      else {
        checkpoint('가운데 정렬');
        targets.forEach(object => object.x = Math.round((stageWidth() - object.w) / 2));
        changed = true;
        result = `${targets.length}개 객체를 가로 가운데 정렬했습니다.`;
      }
    } else if (prompt.includes('복제')) {
      if (!selectedObjects().length) result = '복제할 객체를 먼저 선택하세요.';
      else { duplicateObjects(); changed = true; result = '선택 객체를 복제했습니다.'; }
    } else if (prompt.includes('슬라이드') && (prompt.includes('추가') || prompt.includes('새'))) {
      addSlide(); changed = true; result = '새 슬라이드를 추가했습니다.';
    } else if ((prompt.includes('군더더기') || prompt.includes('보조 패널')) && (prompt.includes('제거') || prompt.includes('삭제'))) {
      const targets = activeSlide().objects.filter(object => object.role === 'auxiliary-panel');
      if (targets.length) {
        checkpoint('보조 패널 제거');
        activeSlide().objects = activeSlide().objects.filter(object => !targets.includes(object));
        changed = true; result = `${targets.length}개의 보조 패널을 제거했습니다.`;
      } else result = 'Description 외 보조 패널이 없습니다. 현재 단순 구조를 유지했습니다.';
    } else {
      result = '이 POC는 로컬 규칙 엔진입니다. 지원 명령: 하단 표 제거, 설명 영역 24%, 폰트 KoPub, 가운데 정렬, 복제, 슬라이드 추가, 보조 패널 제거.';
    }

    if (changed) { renderAll(); scheduleSave(); }
    addMessage(changed ? 'action' : 'assistant', result);
  }

  function setMode(mode) {
    state.mode = mode;
    state.tool = mode === 'edit' ? state.tool : 'select';
    if (mode === 'edit' && !state.editBaseline) state.editBaseline = JSON.stringify(state.project);
    if (mode === 'tweaks') { state.editPanel = 'tweaks'; state.inspectorTab = 'properties'; }
    if (mode === 'comment') state.inspectorTab = 'comments';
    if (mode === 'edit' && state.inspectorTab === 'comments') state.inspectorTab = 'properties';
    updateModeUI(); renderStage(); renderInspector();
  }

  function updateModeUI() {
    $$('.mode-button').forEach(button => button.classList.toggle('is-active', button.dataset.mode === state.mode));
    $$('.edit-depth-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.editPanel === state.editPanel));
    $$('.direct-tools button').forEach(button => button.classList.toggle('is-active', button.dataset.tool === state.tool));
    const editOpen = state.mode === 'edit';
    $('.editor-shell').classList.toggle('edit-open', editOpen);
    $('#editModeBar').classList.toggle('is-hidden', !editOpen);
    $('#canvasViewport').classList.toggle('pan-tool', state.tool === 'interact');
    $('#modeStatus').textContent = `${state.editorMode.toUpperCase()} · ${state.mode[0].toUpperCase()}${state.mode.slice(1)} · ${state.mode === 'edit' ? state.editPanel : state.mode === 'comment' ? 'click or drag' : 'live controls'}`;
    const contract = $('#interactionContract');
    if (contract) contract.textContent = state.editorMode === 'pptx'
      ? 'PPTX document: slide · section · master · Ctrl+M'
      : 'Canvas interaction: frame · auto layout · component · native .fig 아님';
  }

  function updateHistoryButtons() {
    $('#undoButton').disabled = !state.history.length;
    $('#redoButton').disabled = !state.future.length;
  }

  function handleStageClick(event) {
    if (state.suppressStageClick || event.target !== $('#slideStage')) return;
    if (state.mode === 'comment' || state.tool === 'draw' || state.tool === 'interact') return;
    state.selectedIds = [];
    renderStage(); renderInspector();
  }

  function exportJSON() {
    downloadBlob(`${safeFileName(state.project.name)}.json`, JSON.stringify(state.project, null, 2), 'application/json');
    toast('프로젝트 JSON을 내보냈습니다.');
  }

  function recordSurfaceHandoff(target, label) {
    const source = state.editorMode;
    checkpoint(label);
    const interchange = state.project.interchange && state.project.interchange.schema === 'canvas-surface-handoff/1'
      ? state.project.interchange
      : {schema:'canvas-surface-handoff/1', events:[]};
    interchange.events.push({from:source, to:target, at:new Date().toISOString(), objectCount:state.project.slides.reduce((count, slide) => count + (slide.objects || []).length, 0)});
    interchange.latest = {from:source, to:target, nativeFigmaFile:false, meaning:'Shared Canvas IR surface conversion'};
    state.project.interchange = interchange;
    state.editorMode=target; state.project.editingMode=target; state.selectedIds=[];
    if(target==='figma'&&state.viewMode==='master'){state.viewMode='normal';state.activeLayoutId=null;}
    renderAll(); scheduleSave();
  }

  function convertPptxToFigmaCanvas() {
    recordSurfaceHandoff('figma', 'PPTX → spatial Canvas handoff'); hidePopovers();
    toast('PPTX → spatial Canvas handoff: shared Canvas IR 편집 보조 레이어로 전환했습니다. native .fig 파일은 생성하지 않습니다.');
  }

  function prepareFigmaCanvasForPptx() {
    recordSurfaceHandoff('pptx', 'Canvas IR → editable PPTX export preparation'); hidePopovers();
    toast('Canvas IR → editable PPTX: 슬라이드·텍스트·도형을 PPTX export 대상으로 준비했습니다.');
  }

  function exportFigmaCanvasHandoff() {
    const handoff = {
      schema:'canvas-figma-handoff/1',
      capability:'Canvas Studio shared Canvas IR handoff. Re-import into Canvas Studio for continued spatial Canvas interaction.',
      limitations:['This is not a native .fig file.', 'Use editable PPTX export for Office delivery; review import warnings before final export.'],
      exportedAt:new Date().toISOString(),
      project:deepCopy({...state.project, editingMode:'figma'}),
    };
    downloadBlob(`${safeFileName(state.project.name)}-figma-canvas-handoff.json`, JSON.stringify(handoff, null, 2), 'application/json');
    hidePopovers(); toast('Canvas handoff JSON을 내보냈습니다. Canvas Studio에서 다시 열어 계속 편집할 수 있습니다.');
  }

  async function importJSON(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const isFigmaHandoff = payload?.schema === 'canvas-figma-handoff/1';
      const project = payload?.project?.slides ? payload.project : payload;
      if (!Array.isArray(project?.slides) || !project.slides.length || project.slides.some(slide => !Array.isArray(slide.objects))) throw new Error('slides/objects schema missing');
      checkpoint('JSON 가져오기');
      state.project = project;
      normalizeProject();
      state.activeSlide = 0;
      state.activeLayoutId = null;
      state.viewMode = 'normal';
      state.selectedIds = [];
      state.history = [];
      state.future = [];
      state.editBaseline = JSON.stringify(state.project);
      renderAll(); scheduleSave(); hidePopovers();
      toast(isFigmaHandoff ? `Canvas handoff ${project.slides.length}장을 가져왔습니다. native .fig 파일은 아닙니다.` : `JSON ${project.slides.length}장을 가져왔습니다.`);
    } catch (error) {
      console.error(error);
      toast(`JSON 가져오기 실패: ${error.message}`);
    }
  }

  function attachDesignSystem(design) {
    if(!design||design.schema!=='design-md/1')throw new Error('design-md/1 contract가 필요합니다.');
    checkpoint('DESIGN.md 연결');state.project.designSystem=deepCopy(design);state.inspectorTab='components';renderAll();scheduleSave();return true;
  }

  async function importDesignMd(file) {
    if(!file)return;if(!file.name.toLowerCase().endsWith('.md'))return toast('DESIGN.md 파일을 선택하세요.');
    $('#saveStatus').textContent='DESIGN.md 분석 중…';const form=new FormData();form.append('file',file,file.name);
    try{const response=await fetch('/api/import-design-md',{method:'POST',body:form}),payload=await response.json();if(!response.ok||!payload.ok||!payload.designSystem)throw new Error(payload.error||`HTTP ${response.status}`);attachDesignSystem(payload.designSystem);hidePopovers();const s=payload.summary;toast(`DESIGN.md · color ${s.colors} · rule ${s.rules} · component ${s.components}`);}
    catch(error){console.error('DESIGN.md import failed',error);$('#saveStatus').textContent='DESIGN.md 분석 실패';toast(`DESIGN.md 가져오기 실패: ${error.message}`);}
  }

  async function importComponentManifest(file) {
    if(!file)return;if(!file.name.toLowerCase().endsWith('.json'))return toast('source component manifest JSON 파일을 선택하세요.');
    try{const catalog=attachComponentManifest(JSON.parse(await file.text()));hidePopovers();toast(`${catalog.name} · source components ${catalog.components.length}`);}catch(error){console.error('component manifest import failed',error);toast(`Component manifest 가져오기 실패: ${error.message}`);}
  }

  async function importPPTX(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) return toast('PPTX 파일을 선택하세요.');
    $('#saveStatus').textContent = 'Opening PPTX…';
    const importEpoch=++state.showcase.operationEpoch;
    const form = new FormData(); form.append('file', file, file.name);
    try {
      const response = await fetch('/api/import-pptx', {method:'POST', body:form});
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.project) throw new Error(payload.error || `HTTP ${response.status}`);
      if(state.showcase.operationEpoch!==importEpoch)return;
      state.showcase.contractSummary=null;state.showcase.changes=[];state.showcase.provenance=null;state.showcase.roundTrip=null;state.showcase.error=null;state.showcase.phase='ready';
      checkpoint('PPTX 가져오기');
      state.project = payload.project; normalizeProject(); state.activeSlide=0; state.viewMode='normal'; state.activeMaster=0; state.activeLayoutId=null; state.selectedIds=[]; state.history=[]; state.future=[];
      state.editBaseline = JSON.stringify(state.project);
      renderAll(); scheduleSave(); hidePopovers();
      const report=payload.summary.importReport||payload.project.importReport; const review=report?.exportReviewRequired ? ` · 내보내기 검토 ${report.warnings.length}건` : ' · 편집 가능성 검토 통과';
      toast(`Opened ${payload.summary.slides} slide${payload.summary.slides===1?'':'s'}. Select an object to edit.`);
      if(report?.exportReviewRequired) appendConversation('assistant', `Import fidelity review: ${report.warnings.map(item=>item.message).join(' ')}`);
    } catch (error) {
      console.error('PPTX import failed', error);
      $('#saveStatus').textContent = 'PPTX 변환 실패';
      state.showcase.error=error.message;renderShowcase();toast(`Unable to open PPTX: ${error.message}`);
    }
  }

  async function importFile(file, dropPoint = null) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.pptx')) return importPPTX(file);
    if (name.endsWith('.md')) return importDesignMd(file);
    if (name.includes('component-manifest') || name.includes('source-components')) return importComponentManifest(file);
    if (name.endsWith('.json') || file.type === 'application/json') return importJSON(file);
    if (file.type.startsWith('image/')) return addImageFromFile(file, dropPoint);
    toast('PPTX, DESIGN.md, JSON 또는 이미지 파일을 선택하세요.');
  }

  function staticObjectHTML(object) {
    const base = [`position:absolute`,`left:${object.x}px`,`top:${object.y}px`,`width:${object.w}px`,`height:${object.h}px`,`z-index:${object.z || 1}`,`box-sizing:border-box`];
    if (object.type === 'text') {
      const s = object.style || {};
      base.push(`font-family:${escapeHTML(s.fontFamily || 'sans-serif')}`,`font-size:${Number(s.fontSize || 14)}px`,`font-weight:${Number(s.fontWeight || 400)}`,`color:${escapeHTML(s.color || '#222')}`,`text-align:${escapeHTML(s.textAlign || 'left')}`,`line-height:${Number(s.lineHeight || 1.4)}`,`text-decoration:${s.strike?'line-through':'none'}`,`white-space:pre-wrap`,`overflow:hidden`,`background:${escapeHTML(s.background || 'transparent')}`,`padding:${Number(s.padding || 0)}px`);
      const fittedText=fittedObjectText(object);
      if(fittedText!==null)base.push('white-space:pre');
      return `<div style="${base.join(';')}">${escapeHTML(fittedText ?? object.content).replace(/\n/g,'<br>')}</div>`;
    }
    if (object.type === 'shape') {
      const s = object.style || {};
      const clips={triangle:'polygon(50% 0,100% 100%,0 100%)',diamond:'polygon(50% 0,100% 50%,50% 100%,0 50%)',hexagon:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)','right-arrow':'polygon(0 20%,65% 20%,65% 0,100% 50%,65% 100%,65% 80%,0 80%)',chevron:'polygon(0 0,70% 0,100% 50%,70% 100%,0 100%,30% 50%)',callout:'polygon(0 0,100% 0,100% 75%,35% 75%,18% 100%,20% 75%,0 75%)'};
      base.push(`background:${escapeHTML(s.fill || '#eee')}`,`border:${Number(s.borderWidth || 0)}px solid ${escapeHTML(s.borderColor || 'transparent')}`,`border-radius:${Number(s.radius || 0)}px`,`opacity:${Number(s.opacity ?? 1)}`,`clip-path:${clips[object.kind]||'none'}`);
      return `<div style="${base.join(';')}"></div>`;
    }
    if (object.type === 'path') {
      const s = object.style || {};
      const points = (object.points || []).map(point => `${Number(point.x)},${Number(point.y)}`).join(' ');
      const markerId = `arrowhead-${String(object.id || 'path').replace(/[^a-zA-Z0-9_-]/g,'')}`;
      const marker = object.arrow ? `<defs><marker id="${markerId}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="currentColor"/></marker></defs>` : '';
      const markerAttr = object.arrow ? ` marker-end="url(#${markerId})"` : '';
      return `<div style="${base.join(';')};color:${escapeHTML(s.stroke || '#315ce7')}"><svg viewBox="0 0 ${Number(object.w)} ${Number(object.h)}" width="100%" height="100%">${marker}<polyline points="${points}" fill="${escapeHTML(s.fill || 'none')}" stroke="${escapeHTML(s.stroke || '#315ce7')}" stroke-width="${Number(s.strokeWidth || 3)}" stroke-linecap="round" stroke-linejoin="round"${markerAttr}/></svg></div>`;
    }
    const imageStyle=object.style||{}; base.push('overflow:hidden');
    return `<div style="${base.join(';')}"><img alt="${escapeHTML(object.alt || object.name)}" src="${escapeHTML(object.src)}" style="width:100%;height:100%;object-fit:${escapeHTML(imageStyle.objectFit || 'cover')};object-position:${Number(imageStyle.cropX??50)}% ${Number(imageStyle.cropY??50)}%;transform:scale(${Number(imageStyle.cropZoom||1)})"></div>`;
  }

  function slideVisualObjects(slide) { return [...inheritedObjects(slide),...(slide.objects||[])]; }

  function buildSlideHTML(slide = currentSlide()) {
    const width=stageWidth(slide), height=stageHeight(slide);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(slide.title)}</title><style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;background:#e8e7e2}.slide{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${escapeHTML(slide.background || '#fff')};box-shadow:0 18px 50px rgba(0,0,0,.18);transform-origin:center}@media(max-width:${width + 20}px){.slide{transform:scale(calc((100vw - 24px)/${width}))}}</style></head><body><main class="slide">${slideVisualObjects(slide).sort((a,b)=>(a.z||0)-(b.z||0)).map(staticObjectHTML).join('')}</main></body></html>`;
  }

  function buildProjectHTML() {
    const slides = state.project.slides.map((slide,index) => {
      const width=stageWidth(slide), height=stageHeight(slide);
      return `<section class="deck-slide${index === 0 ? ' is-active' : ''}" data-width="${width}" data-height="${height}" style="width:${width}px;height:${height}px;background:${escapeHTML(slide.background || '#fff')}">${slideVisualObjects(slide).sort((a,b)=>(a.z||0)-(b.z||0)).map(staticObjectHTML).join('')}</section>`;
    }).join('');
    const title = escapeHTML(state.project.name);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#171816;font-family:Arial,sans-serif}.viewport{position:fixed;inset:0 0 54px;display:grid;place-items:center}.deck-slide{display:none;position:relative;overflow:hidden;flex:none;transform-origin:center;box-shadow:0 18px 60px rgba(0,0,0,.42)}.deck-slide.is-active{display:block}.controls{position:fixed;left:0;right:0;bottom:0;height:54px;display:flex;align-items:center;justify-content:center;gap:18px;color:#fff;background:#20211f}.controls button{width:44px;height:32px;border:1px solid #62635f;background:transparent;color:#fff}.controls b{min-width:90px;text-align:center;font-size:12px}</style></head><body><main class="viewport">${slides}</main><nav class="controls"><button id="prev">←</button><b id="counter">1 / ${state.project.slides.length}</b><button id="next">→</button></nav><script>(()=>{const slides=[...document.querySelectorAll('.deck-slide')],counter=document.querySelector('#counter');let index=0;function render(){slides.forEach((slide,i)=>slide.classList.toggle('is-active',i===index));const slide=slides[index],w=Number(slide.dataset.width),h=Number(slide.dataset.height),scale=Math.min((innerWidth-32)/w,(innerHeight-86)/h,1);slide.style.transform='scale('+scale+')';counter.textContent=(index+1)+' / '+slides.length}function shift(delta){index=(index+delta+slides.length)%slides.length;render()}document.querySelector('#prev').onclick=()=>shift(-1);document.querySelector('#next').onclick=()=>shift(1);addEventListener('resize',render);addEventListener('keydown',event=>{if(event.key==='ArrowLeft')shift(-1);if(event.key==='ArrowRight'||event.key===' ')shift(1)});render()})()</script></body></html>`;
  }

  function exportHTML() {
    const slide = activeSlide();
    downloadBlob(`${safeFileName(slide.title)}.html`, buildSlideHTML(slide), 'text/html');
    toast('현재 슬라이드 HTML을 내보냈습니다.');
  }

  function exportAllHTML() {
    downloadBlob(`${safeFileName(state.project.name)}.html`, buildProjectHTML(), 'text/html');
    toast(`전체 ${state.project.slides.length}장 HTML을 내보냈습니다.`);
  }

  async function exportPPTX() {
    $('#saveStatus').textContent = 'PPTX 생성 중…';
    try {
      const response = await fetch('/api/export-pptx', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project:state.project})});
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      downloadBlob(`${safeFileName(state.project.name)}.pptx`, blob, blob.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      $('#saveStatus').textContent = '로컬에 저장됨';
      hidePopovers();
      toast(`Downloaded ${state.project.slides.length} slide${state.project.slides.length===1?"":"s"} as an editable PPTX.`);
    } catch (error) {
      console.error('PPTX export failed', error);
      $('#saveStatus').textContent = 'PPTX 생성 실패';
      state.showcase.error=error.message;renderShowcase();toast(`Unable to export PPTX: ${error.message}`);
    }
  }

  function safeFileName(value) { return String(value || 'canvas-project').replace(/[\\/:*?"<>|]+/g, '-').trim(); }
  function downloadBlob(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderPresent() {
    const root = $('#presentStage');
    root.replaceChildren();
    const slide = state.project.slides[state.presentSlide];
    const width = stageWidth(slide), height = stageHeight(slide);
    const stage = document.createElement('div');
    stage.className = 'slide-stage present-copy';
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.background = slide.background || '#fff';
    slideVisualObjects(slide).sort((a,b)=>(a.z||0)-(b.z||0)).forEach(object => stage.append(makeObjectElement(object, false)));
    root.append(stage);
    const scale = Math.min(window.innerWidth * .88 / width, window.innerHeight * .82 / height);
    root.style.width = `${width * scale}px`;
    root.style.height = `${height * scale}px`;
    root.style.aspectRatio = `${width} / ${height}`;
    stage.style.transform = `scale(${scale})`;
    $('#presentCounter').textContent = `${state.presentSlide + 1} / ${state.project.slides.length}`;
  }

  function openPresent() {
    state.presentSlide = state.activeSlide;
    const overlay = $('#presentOverlay');
    overlay.inert = false;
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('aria-hidden', 'false');
    renderPresent();
    $('#closePresent').focus();
  }

  function closePresent() {
    const overlay = $('#presentOverlay');
    $('#presentButton').focus();
    overlay.inert = true;
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function shiftPresent(delta) {
    state.presentSlide = (state.presentSlide + delta + state.project.slides.length) % state.project.slides.length;
    renderPresent();
  }

  function newProject() {
    if (!window.confirm('현재 프로젝트를 새 프로젝트로 교체할까요? JSON 내보내기를 먼저 권장합니다.')) return;
    checkpoint('새 프로젝트');
    state.project = createDefaultProject();
    state.project.name = '새 디자인 프로젝트';
    state.project.fileName = 'Untitled canvas';
    normalizeProject();state.activeSlide = 0; state.activeLayoutId=null;state.selectedIds = [];
    renderAll(); scheduleSave(); hidePopovers();
  }

  function positionPopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    popover.style.left = `${Math.min(rect.left, window.innerWidth - popover.offsetWidth - 10)}px`;
    popover.style.top = `${rect.bottom + 6}px`;
  }

  function hidePopovers() { $$('.popover').forEach(popover => popover.classList.add('is-hidden')); }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2200);
  }

  function nudgeSelection(dx, dy) {
    const objects = selectedObjects().filter(object => !object.locked);
    if (!objects.length) return false;
    checkpoint('객체 미세 이동');
    objects.forEach(object => {
      object.x = clamp(object.x + dx, -stageMargin(), stageWidth() + stageMargin() - object.w);
      object.y = clamp(object.y + dy, -stageMargin(), stageHeight() + stageMargin() - object.h);
    });
    renderStage(); renderInspector(); scheduleSave();
    return true;
  }

  function resetShowcaseDemo() {
    if (!IS_SHOWCASE_MODE) throw new Error('Showcase mode requires ?showcase=1');
    const operationEpoch=(state.showcase.operationEpoch||0)+1;
    state.project=createShowcaseProject();normalizeProject();state.activeSlide=0;state.activeMaster=0;state.activeLayoutId=null;state.selectedIds=[];state.history=[];state.future=[];state.viewMode='normal';state.mode='edit';state.editorMode='pptx';state.zoom=showcaseZoom();state.editBaseline=JSON.stringify(state.project);
    state.showcase={phase:'ready',busy:null,contractSummary:null,changes:[],provenance:null,openai:{checked:false,available:false,model:null},aiReview:null,aiRepairs:[],roundTrip:null,error:null,errorStage:null,operationEpoch};
    document.documentElement.style.setProperty('--accent','#315ce7');
    renderAll();centerShowcaseCanvas();
    return getShowcaseEvidence();
  }

  async function loadShowcaseContract() {
    if (!IS_SHOWCASE_MODE) throw new Error('Showcase mode requires ?showcase=1');
    const operationEpoch=++state.showcase.operationEpoch,before=JSON.stringify(activeSlide().objects);
    state.showcase.busy='showcaseLoad';state.showcase.error=null;state.showcase.errorStage=null;state.showcase.phase='loading-contract';state.showcase.contractSummary=null;state.showcase.changes=[];state.showcase.provenance=null;state.showcase.aiReview=null;state.showcase.aiRepairs=[];state.showcase.roundTrip=null;renderShowcase();
    try {
      const sourceResponse=await fetch(SHOWCASE_CONTRACT_URL,{cache:'no-store'});if(!sourceResponse.ok)throw new Error(`Bundled contract HTTP ${sourceResponse.status}`);
      const sourceBlob=await sourceResponse.blob(),form=new FormData();form.append('file',sourceBlob,'DESIGN.md');
      const response=await fetch('/api/import-design-md',{method:'POST',body:form}),payload=await response.json();if(!response.ok||!payload.ok||!payload.designSystem)throw new Error(payload.error||`HTTP ${response.status}`);
      if(state.showcase.operationEpoch!==operationEpoch)return {cancelled:true};
      attachDesignSystem(payload.designSystem);
      if(before!==JSON.stringify(activeSlide().objects))throw new Error('Contract import mutated canvas objects');
      const design=payload.designSystem,tokens=design.tokens||{};
      state.showcase.contractSummary={fileName:design.source.fileName,parserVersion:design.source.parserVersion,sha256:design.source.sha256,sha256Prefix:design.source.sha256.slice(0,12),tokens:(tokens.colors||[]).length+(tokens.typography||[]).length+(tokens.spacing||[]).length,rules:(design.rules||[]).length,components:(design.components||[]).length,importMutationFree:true};
      state.showcase.phase='contract-loaded';state.showcase.busy=null;renderAll();centerShowcaseCanvas();return deepCopy(state.showcase.contractSummary);
    } catch(error){if(state.showcase.operationEpoch!==operationEpoch)return {cancelled:true};state.showcase.busy=null;state.showcase.phase='failed';state.showcase.errorStage='load';state.showcase.error=error.message;renderShowcase();throw error;}
  }

  function applyShowcaseContract() {
    if (!IS_SHOWCASE_MODE) throw new Error('Showcase mode requires ?showcase=1');
    if (!state.showcase.contractSummary||!state.project.designSystem) throw new Error('Load the showcase contract first');
    state.showcase.busy='showcaseApply';state.showcase.error=null;state.showcase.errorStage=null;state.showcase.phase='applying';renderShowcase();
    try {
      const result=applyDesignSystemTokens(),design=state.project.designSystem;
      state.showcase.changes=result.changes;
      state.showcase.provenance={sourceFile:design.source.fileName,sourceHash:design.source.sha256,parser:design.source.parserVersion,timestamp:new Date().toISOString(),scope:{type:result.scope,id:currentSlide().id,label:result.scope==='selection'?`${result.targetCount} selected objects`:`Slide ${state.activeSlide+1} · ${currentSlide().title}`}};
      state.showcase.phase='applied';state.showcase.busy=null;renderAll();centerShowcaseCanvas();return deepCopy(result);
    } catch(error){state.showcase.busy=null;state.showcase.phase='failed';state.showcase.errorStage='apply';state.showcase.error=error.message;renderShowcase();throw error;}
  }





  async function roundTripShowcasePptx() {
    if (!IS_SHOWCASE_MODE) throw new Error('Showcase mode requires ?showcase=1');
    
    const operationEpoch=++state.showcase.operationEpoch, originalProject=deepCopy(state.project);
    state.showcase.busy='showcaseRoundTrip';state.showcase.error=null;state.showcase.errorStage=null;state.showcase.phase='roundtripping';state.showcase.roundTrip=null;renderShowcase();
    try {
      const exportResponse=await fetch('/api/export-pptx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:state.project})});
      if(!exportResponse.ok){const failure=await exportResponse.json().catch(()=>({}));throw new Error(failure.error||`Export HTTP ${exportResponse.status}`);}
      const pptxBlob=await exportResponse.blob(),form=new FormData();form.append('file',pptxBlob,'northstar-workday.pptx');
      const importResponse=await fetch('/api/import-pptx',{method:'POST',body:form}),payload=await importResponse.json();if(!importResponse.ok||!payload.ok||!payload.project)throw new Error(payload.error||`Import HTTP ${importResponse.status}`);
      if(state.showcase.operationEpoch!==operationEpoch)return {cancelled:true};
      const slides=payload.project.slides?.length||0,editableObjects=(payload.project.slides||[]).reduce((count,slide)=>count+(slide.objects||[]).length,0);if(!slides||!editableObjects)throw new Error('Re-import did not return editable slide objects');
      const expected=originalProject.slides.flatMap(s=>s.objects.filter(o=>o.type==='text').map(o=>String(o.content||'').replace(/\r\n|\v/g,'\n'))), actual=payload.project.slides.flatMap(s=>s.objects.filter(o=>o.type==='text').map(o=>String(o.content||'').replace(/\r\n|\v/g,'\n')));if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('Text changed during export. Save the project JSON and inspect the original presentation.');for(let si=0;si<originalProject.slides.length;si++){const old=originalProject.slides[si].objects.slice().sort((a,b)=>(a.z||0)-(b.z||0)),fresh=payload.project.slides[si]?.objects||[];if(old.length!==fresh.length)throw Error('The number of objects changed during export. Keep the original and inspect the PPTX.');old.forEach((o,i)=>{const n=fresh[i];if(o.type!==n.type||['x','y','w','h'].some(k=>Math.abs(Number(o[k]||0)-Number(n[k]||0))>.6))throw Error('An object changed during export. The original stays open.');if(o.type==='shape'&&(o.kind||'rectangle')!==(n.kind||'rectangle'))throw Error('A shape changed during export. The original stays open.');if(o.type==='text'&&Math.abs(Number(o.style.fontSize)-Number(n.style.fontSize))>.15)throw Error('Text size changed during export. The original stays open.');});}
      payload.project.designSystem=originalProject.designSystem;payload.project.tweaks=originalProject.tweaks;
      state.project=payload.project;normalizeProject();state.activeSlide=0;state.activeMaster=0;state.activeLayoutId=null;state.selectedIds=[];state.history=[];state.future=[];state.viewMode='normal';state.editBaseline=JSON.stringify(state.project);
      state.showcase.roundTrip={pass:true,slides,editableObjects,exportBytes:pptxBlob.size,importSummary:payload.summary};state.showcase.phase='pass';state.showcase.busy=null;renderAll();centerShowcaseCanvas();return deepCopy(state.showcase.roundTrip);
    } catch(error){if(state.showcase.operationEpoch!==operationEpoch)return {cancelled:true};state.showcase.busy=null;state.showcase.phase='failed';state.showcase.errorStage='roundtrip';state.showcase.error=error.message;state.showcase.roundTrip={pass:false,error:error.message};renderShowcase();throw error;}
  }

  function getShowcaseEvidence() {
    return deepCopy({mode:IS_SHOWCASE_MODE,phase:state.showcase.phase,contract:state.showcase.contractSummary,apply:{changedObjects:new Set(state.showcase.changes.map(item=>item.objectId)).size,changedProperties:state.showcase.changes.length,changes:state.showcase.changes},provenance:state.showcase.provenance,openai:state.showcase.openai,aiReview:state.showcase.aiReview,aiRepairs:state.showcase.aiRepairs,roundTrip:state.showcase.roundTrip,error:state.showcase.error});
  }

  async function copyShowcaseEvidence() {
    const evidence=JSON.stringify({source:state.showcase.provenance,changes:state.showcase.changes},null,2);
    try{await navigator.clipboard.writeText(evidence);toast('Change list copied.');}
    catch(error){toast(`Evidence 복사 실패: ${error.message}`);}
    return evidence;
  }

  function runShowcaseAction(action) { Promise.resolve().then(action).catch(error=>console.error('Showcase action failed',error)); }

  function bindEvents() {
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', finishPointerInteraction);
    $('#slideStage').addEventListener('pointerdown', startStagePointer);
    $('#slideStage').addEventListener('click', handleStageClick);


    $('#collapseChat').addEventListener('click', () => {
      state.chatCollapsed = true; $('#app').classList.add('chat-collapsed'); $('#showChat').classList.remove('is-hidden');
    });
    $('#showChat').addEventListener('click', () => {
      state.chatCollapsed = false; $('#app').classList.remove('chat-collapsed'); $('#showChat').classList.add('is-hidden');
    });
    $('#toggleRail').addEventListener('click', () => { state.railCollapsed = !state.railCollapsed; $('.editor-body').classList.toggle('rail-collapsed', state.railCollapsed); });
    $('#reloadProject').addEventListener('click', () => { if(IS_SHOWCASE_MODE){resetShowcaseDemo();toast('Sample restored.');return;}loadProject(); normalizeProject(); state.editBaseline=JSON.stringify(state.project); state.selectedIds = []; renderAll(); toast('저장본을 다시 불러왔습니다.'); });
    $('#undoButton').addEventListener('click', undo);
    $('#redoButton').addEventListener('click', redo);
    $$('.direct-tools [data-tool]').forEach(button => button.addEventListener('click', () => addToolObject(button.dataset.tool)));
    $$('.view-tools [data-view-mode]').forEach(button=>button.addEventListener('click',()=>setViewMode(button.dataset.viewMode)));
    $$('.surface-mode-tools [data-editor-mode]').forEach(button=>button.addEventListener('click',()=>setEditorMode(button.dataset.editorMode)));
    $('#createComponent').addEventListener('click', createComponentFromSelection);
    $('#strikeButton').addEventListener('click',toggleStrike);
    $('#cropButton').addEventListener('click',openCropControls);
    $('#eyedropperButton').addEventListener('click',pickColor);
    $('#rulerButton').addEventListener('click',()=>{state.showRulers=!state.showRulers;renderHeader();scheduleSave();});
    $('#symbolButton').addEventListener('click',event=>{event.stopPropagation();const popover=$('#symbolPopover'),opening=popover.classList.contains('is-hidden');hidePopovers();if(opening){popover.classList.remove('is-hidden');positionPopover(popover,event.currentTarget);}});
    $('#shapeMenuButton').addEventListener('click',event=>{event.stopPropagation();const popover=$('#shapePopover'),opening=popover.classList.contains('is-hidden');hidePopovers();if(opening){popover.classList.remove('is-hidden');positionPopover(popover,event.currentTarget);}});
    $$('.edit-depth-tabs button').forEach(button => button.addEventListener('click', () => setEditPanel(button.dataset.editPanel)));
    $('#saveEdits').addEventListener('click', saveEdits);
    $('#discardEdits').addEventListener('click', discardEdits);
    $('#addImage').addEventListener('click', () => $('#imageInput').click());
    $('#importAsset').addEventListener('click', () => $('#imageInput').click());
    $('#imageInput').addEventListener('change', event => { addImageFromFile(event.target.files[0]); event.target.value = ''; });
    const canvasViewport = $('#canvasViewport');
    canvasViewport.addEventListener('pointerdown', startViewportPan, true);
    bindPanelDragScroll($('#slideList'), true);
    bindPanelDragScroll($('#inspectorContent'));
    ['dragenter','dragover'].forEach(type => canvasViewport.addEventListener(type, event => {
      event.preventDefault();
      const isComponent = [...event.dataTransfer.types].includes(COMPONENT_MIME);
      canvasViewport.classList.toggle('is-component-over', isComponent);
      canvasViewport.classList.toggle('is-file-over', !isComponent);
      event.dataTransfer.dropEffect = 'copy';
    }));
    ['dragleave','drop'].forEach(type => canvasViewport.addEventListener(type, event => {
      event.preventDefault();
      canvasViewport.classList.remove('is-file-over','is-component-over');
    }));
    canvasViewport.addEventListener('drop', event => {
      event.stopPropagation();
      
      const componentId = event.dataTransfer.getData(COMPONENT_MIME) || event.dataTransfer.getData('text/plain').replace(/^canvas-component:/,'');
      if (state.project.components.some(component => component.id === componentId)) return insertComponentInstance(componentId, stagePoint(event));
      importFile(event.dataTransfer.files[0], stagePoint(event));
    });
    document.addEventListener('dragover',event=>{if([...(event.dataTransfer?.types||[])].includes('Files'))event.preventDefault();});
    document.addEventListener('drop',event=>{const file=event.dataTransfer?.files?.[0];if(!file)return;event.preventDefault();importFile(file);});
    $('#commentAttachmentInput').addEventListener('change', event => {
      const file = event.target.files[0]; if (!file) return;
      state.commentAttachment = {name:file.name,type:file.type,size:file.size};
      if (file.type.startsWith('image/') && file.size <= 1024 * 1024) {
        const reader = new FileReader(); reader.onload = () => { state.commentAttachment.data = reader.result; renderInspector(); }; reader.readAsDataURL(file);
      } else renderInspector();
      event.target.value='';
    });
    $('#addSection').addEventListener('click', addSection);
    $('#addSlide').addEventListener('click', addSlide);

    $('#zoomRange').addEventListener('input', event => {
      state.zoom = Number(event.target.value) / 100;
      renderHeader();
      scheduleSave();
    });

    $$('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    $$('.inspector-tabs button').forEach(button => button.addEventListener('click', () => { state.inspectorTab = button.dataset.tab; renderInspector(); }));

    $('#promptForm').addEventListener('submit', event => {
      event.preventDefault();
      const input = $('#promptInput');
      applyPrompt(input.value);
      input.value = '';
    });
    $$('.command-hints button').forEach(button => button.addEventListener('click', () => applyPrompt(button.dataset.command)));

    $('#speakerNotes').addEventListener('input', event => { if(state.viewMode==='normal'){currentSlide().notes = event.target.value; scheduleSave();} });
    $('#projectNameInput').addEventListener('change', event => { checkpoint('프로젝트명 변경'); state.project.name = event.target.value.trim() || 'Untitled project'; renderHeader(); scheduleSave(); });

    $('#projectMenu').addEventListener('click', event => {
      event.stopPropagation();
      const popover = $('#projectPopover');
      const opening = popover.classList.contains('is-hidden'); hidePopovers();
      if (opening) { popover.classList.remove('is-hidden'); positionPopover(popover, $('#projectMenu')); }
    });
    $('#fileSwitcher').addEventListener('click', () => { state.railCollapsed = false; $('.editor-body').classList.remove('rail-collapsed'); toast('슬라이드 목록을 열었습니다.'); });
    $('#newProject').addEventListener('click', newProject);
    $('#importJson').addEventListener('click', () => $('#jsonInput').click());
    $('#importPptx').addEventListener('click', () => $('#pptxInput').click());
    $('#importDesignMd').addEventListener('click', () => $('#designInput').click());
    $('#importJsonDirect').addEventListener('click', () => $('#jsonInput').click());
    $('#importPptxDirect').addEventListener('click', () => $('#pptxInput').click());
    $('#convertPptxToFigma').addEventListener('click', convertPptxToFigma);
    $('#importDesignMdDirect').addEventListener('click', () => $('#designInput').click());
    $('#importComponentManifest').addEventListener('click', () => $('#componentManifestInput').click());
    $('#importImageDirect').addEventListener('click', () => $('#imageInput').click());
    $('#exportJson').addEventListener('click', exportJSON);
    $('#exportJsonAlt').addEventListener('click', exportJSON);
    $('#jsonInput').addEventListener('change', event => { importJSON(event.target.files[0]); event.target.value = ''; });
    $('#pptxInput').addEventListener('change', event => { importPPTX(event.target.files[0]); event.target.value = ''; });
    $('#designInput').addEventListener('change', event => { importDesignMd(event.target.files[0]); event.target.value = ''; });
    $('#componentManifestInput').addEventListener('change', event => { importComponentManifest(event.target.files[0]); event.target.value = ''; });

    $('#importMenuButton').addEventListener('click', event => {
      event.stopPropagation();
      const popover = $('#importPopover');
      const opening = popover.classList.contains('is-hidden'); hidePopovers();
      if (opening) { popover.classList.remove('is-hidden'); positionPopover(popover, $('#importMenuButton')); }
    });
    $('#exportMenuButton').addEventListener('click', event => {
      event.stopPropagation();
      const popover = $('#exportPopover');
      const opening = popover.classList.contains('is-hidden'); hidePopovers();
      if (opening) { popover.classList.remove('is-hidden'); positionPopover(popover, $('#exportMenuButton')); }
    });
    $('#exportHtml').addEventListener('click', exportHTML);
    $('#exportAllHtml').addEventListener('click', exportAllHTML);
    $('#exportPptx').addEventListener('click', exportPPTX);
    $('#preparePptxFromFigma').addEventListener('click', prepareFigmaCanvasForPptx);
    $('#exportFigmaCanvas').addEventListener('click', exportFigmaCanvasHandoff);
    $('#presentButton').addEventListener('click', openPresent);
    $('#closePresent').addEventListener('click', closePresent);
    $('#presentPrev').addEventListener('click', () => shiftPresent(-1));
    $('#presentNext').addEventListener('click', () => shiftPresent(1));
    $('#shareButton').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); toast('로컬 URL을 복사했습니다.'); }
      catch { toast('브라우저 주소를 직접 복사하세요.'); }
    });
    if(IS_SHOWCASE_MODE){
      $('#showcaseLoad').addEventListener('click',()=>runShowcaseAction(loadShowcaseContract));
      $('#showcaseApply').addEventListener('click',()=>runShowcaseAction(applyShowcaseContract));
      $('#showcaseRoundTrip').addEventListener('click',()=>runShowcaseAction(roundTripShowcasePptx));
      $('#showcaseReset').addEventListener('click',()=>{resetShowcaseDemo();toast('Sample restored.');});
      $('#showcaseCopy').addEventListener('click',()=>runShowcaseAction(copyShowcaseEvidence));
    }

    document.addEventListener('click', event => { if (!event.target.closest('.popover') && !event.target.closest('#projectMenu') && !event.target.closest('#importMenuButton') && !event.target.closest('#exportMenuButton')) hidePopovers(); });
    window.addEventListener('resize', () => { if (!$('#presentOverlay').classList.contains('is-hidden')) renderPresent(); });

    document.addEventListener('keydown', event => {
      const editing = event.target.matches('input,textarea,select') || event.target.isContentEditable;
      if (!$('#presentOverlay').classList.contains('is-hidden')) {
        if (event.key === 'Escape') closePresent();
        if (event.key === 'ArrowRight') shiftPresent(1);
        if (event.key === 'ArrowLeft') shiftPresent(-1);
        return;
      }
      if (editing) return;
      if (!isCanvasKeyboardContext(event)) return;
      if ((event.ctrlKey || event.metaKey) && ['c','x','v'].includes(event.key.toLowerCase())) {
        event.preventDefault(); const key=event.key.toLowerCase(); if(key==='v')pasteSelection();else copySelection(key==='x'); return;
      }
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        state.spaceDown = true;
        $('#canvasViewport').classList.add('pan-ready');
        event.preventDefault();
        return;
      }
      if (state.editorMode==='pptx'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='m'){event.preventDefault();addSlide();return;}
      if (state.editorMode==='figma'&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='a'){event.preventDefault();createAutoLayout();return;}
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); return; }
      if (state.editorMode==='figma'&&(event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); createComponentFromSelection(); return; }
      if (state.mode === 'edit' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const toolKeys = state.editorMode==='figma' ? {v:'select',i:'interact',t:'text',f:'frame',r:'rectangle',o:'oval',a:'arrow',l:'line',p:'draw'} : {v:'select',i:'interact',t:'text',r:'rectangle',o:'oval',a:'arrow',l:'line',p:'draw'};
        const tool = toolKeys[event.key.toLowerCase()];
        if (tool) { event.preventDefault(); addToolObject(tool); return; }
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        (event.key.toLowerCase() === 'y' || event.shiftKey) ? redo() : undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateObjects(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { if (selectedObjects().length) handleObjectAction('delete'); return; }
      const step = event.shiftKey ? 10 : 1;
      const arrowDelta = {ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
      if (arrowDelta) {
        // Selection wins. With no selection, arrows pan the focused canvas instead
        // of leaking to browser/page scroll. Text editing already returned above.
        const moved = nudgeSelection(...arrowDelta);
        if (!moved) panViewportByKey(arrowDelta[0] * 40, arrowDelta[1] * 40);
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') { state.selectedIds = []; renderStage(); renderInspector(); }
    });
    document.addEventListener('keyup', event => {
      if (event.code !== 'Space') return;
      state.spaceDown = false;
      $('#canvasViewport').classList.remove('pan-ready');
    });
    window.addEventListener('blur', () => { state.spaceDown = false; $('#canvasViewport').classList.remove('pan-ready'); });
  }

  function addImageDataUrl(src, name = 'API image') {
    if (typeof src !== 'string' || !src.startsWith('data:image/')) throw new Error('addImageDataUrl expects a data:image URL');
    checkpoint('API 이미지 추가');
    const object = {
      id: uid('image'), type: 'image', name, x: 300, y: 145, w: 360, h: 240,
      z: Math.max(...activeSlide().objects.map(item => item.z || 0), 0) + 1,
      src, alt: name, style: {objectFit: 'contain'}
    };
    activeSlide().objects.push(object);
    state.selectedIds = [object.id];
    renderAll();
    scheduleSave();
    return object.id;
  }

  loadProject();
  normalizeProject();
  state.editBaseline = JSON.stringify(state.project);
  renderOfficePalettes();
  bindEvents();
  renderAll();
  centerShowcaseCanvas();
  


  window.CanvasStudio = Object.freeze({
    version: '1.0.0',
    selectSlide: index=>{state.activeSlide=Math.max(0,Math.min(state.project.slides.length-1,index));state.selectedIds=[];renderAll();centerShowcaseCanvas();},
    getSelection: ()=>deepCopy(selectedObjects()),
    fitCanvas: ()=>{state.zoom=showcaseZoom();state.showRulers=false;renderAll();centerShowcaseCanvas();},
    editSelected: patch=>{const selected=selectedObjects();if(!selected.length)return;checkpoint('Edit selected object');selected.forEach(o=>{if(patch.content!==undefined&&o.type==='text')o.content=String(patch.content);if(patch.style)o.style={...o.style,...patch.style};});renderAll();},
    openPresentation: importPPTX,
    downloadPresentation: exportPPTX,
    saveProject: exportJSON,
    undo,
    redo,
    importContract: async file=>{if(!file)return;const form=new FormData();form.append('file',file,file.name);const response=await fetch('/api/import-design-md',{method:'POST',body:form}),payload=await response.json();if(!response.ok||!payload.ok)throw Error(payload.error||'Unable to read DESIGN.md');const design=payload.designSystem;attachDesignSystem(design);state.showcase.contractSummary={fileName:design.source.fileName,sha256:design.source.sha256};state.showcase.changes=[];state.showcase.provenance=null;state.showcase.error=null;renderAll();return design;},

    isShowcaseMode: IS_SHOWCASE_MODE,
    resetShowcaseDemo,
    loadShowcaseContract,
    applyShowcaseContract,
    roundTripShowcasePptx,
    getShowcaseEvidence,
    getProject: () => deepCopy(state.project),
    getEditorState: () => ({activeSlide: state.activeSlide, activeMaster:state.activeMaster, activeLayoutId:state.activeLayoutId, selectedIds: [...state.selectedIds], editorMode:state.editorMode, mode: state.mode, viewMode:state.viewMode, editPanel: state.editPanel, tool: state.tool, zoom: state.zoom, showRulers:state.showRulers}),
    getInteractionContract: () => ({
      primary: state.editorMode === 'pptx' ? 'pptx-document' : 'canvas-spatial',
      shared: ['select', 'move', 'Arrow 1px nudge', 'Shift+Arrow 10px nudge', 'Space+drag / middle-drag pan', 'text caret priority'],
      pptx: ['Ctrl/Cmd+M add slide', 'section/master/layout'],
      canvas: ['F frame', 'Shift+A auto layout', 'Ctrl/Cmd+Alt+K component'],
      boundaries: ['Canvas shortcuts are a spatial editing layer, not native .fig support or Figma Cloud synchronization.']
    }),
    applyCommand: prompt => applyPrompt(String(prompt || '')),
    addImageDataUrl,
    addSection,
    setEditorMode,
    convertPptxToFigmaCanvas,
    prepareFigmaCanvasForPptx,
    exportFigmaCanvasHandoff,
    setViewMode,
    addShapeKind,
    copySelection,
    pasteSelection,
    createAutoLayout,
    attachDesignSystem,
    previewDesignSystemTokens,
    applyDesignSystemTokens,
    buildLocalDesignSystemLibrary,
    attachComponentManifest,
    buildSourceComponentLibrary,
    buildSlideHTML: () => buildSlideHTML(currentSlide()),
    buildProjectHTML
  });
})();
