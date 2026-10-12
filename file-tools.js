(() => {
  'use strict';
  const nativeFetch=window.fetch.bind(window),local=new URLSearchParams(location.search).get('engine')==='local';
  const setStatus=(text,ready=false)=>{window.fileToolStatus={text,ready};const el=document.getElementById('fileToolsStatus');if(el){el.textContent=text;el.classList.toggle('ready',ready);}};
  if(local){window.addEventListener('DOMContentLoaded',()=>setStatus('Local file tools',true));return;}
  let resolveReady,rejectReady,sequence=0;
  const jobs=new Map(),ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  ready.catch(()=>{});
  const worker=new Worker(new URL('file-worker.js',document.currentScript.src));
  worker.onmessage=({data})=>{
    if(data.type==='status'){setStatus(data.message);return;}
    if(data.type==='ready'){setStatus('Files stay here',true);resolveReady();return;}
    if(data.type==='fatal'){setStatus('File tools unavailable');rejectReady(new Error(data.error));return;}
    const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);clearTimeout(job.timer);
    data.error?job.reject(new Error(data.error)):job.resolve(data.result);
  };
  worker.onerror=()=>{setStatus('File tools unavailable');rejectReady(new Error('File tools could not load. Check your connection and reload.'));};
  const run=async request=>{await ready;return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(new Error('This file took too long to convert. Try a smaller presentation.'));},120000);jobs.set(id,{resolve,reject,timer});worker.postMessage({id,request});});};
  const base64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
  window.fetch=async(input,options={})=>{
    const path=typeof input==='string'?input:input.url;
    if(!path.startsWith('/api/'))return nativeFetch(input,options);
    if(path==='/api/health')return Response.json({ok:true,openaiReview:{available:false,model:null}});
    try{
      let request;
      if(path==='/api/export-pptx')request={operation:'export',project:JSON.parse(options.body).project};
      else if(path==='/api/import-pptx'||path==='/api/import-design-md'){
        const file=options.body.get('file');if(!file)throw Error('Choose a file first.');
        if(file.size>25*1024*1024)throw Error('Choose a file smaller than 25 MB.');
        request={operation:path.endsWith('design-md')?'design':'import',filename:file.name,data:await base64(file)};
      } else throw Error('This operation is not available in the public editor.');
      const result=await run(request);
      if(request.operation==='export'){const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}});}
      return Response.json(result);
    }catch(error){return Response.json({ok:false,error:error.message},{status:400});}
  };
  window.addEventListener('DOMContentLoaded',()=>{const status=window.fileToolStatus;if(status)setStatus(status.text,status.ready);});
})();
