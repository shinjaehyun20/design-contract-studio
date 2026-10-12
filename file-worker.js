/* File contents are handled inside this worker. Network requests only load code. */
const PYODIDE_URL='https://cdn.jsdelivr.net/pyodide/v0.29.3/full/';
let python;
const initialized=(async()=>{
  postMessage({type:'status',message:'Loading file tools…'});
  importScripts(PYODIDE_URL+'pyodide.js');
  python=await loadPyodide({indexURL:PYODIDE_URL});
  await python.loadPackage(['lxml','pillow','pyyaml','micropip']);
  postMessage({type:'status',message:'Preparing PowerPoint…'});
  await python.runPythonAsync("import micropip\nawait micropip.install(['python-pptx==1.0.2','defusedxml==0.7.1'])");
  const response=await fetch('adapter.py');if(!response.ok)throw Error('The file adapter could not load.');
  await python.runPythonAsync(await response.text());
  postMessage({type:'ready'});
})();
initialized.catch(error=>postMessage({type:'fatal',error:String(error.message||error)}));
let queue=initialized;
onmessage=({data})=>{
  queue=queue.catch(()=>{}).then(async()=>{
    try{
      await initialized;
      python.globals.set('_studio_request',JSON.stringify(data.request));
      const raw=await python.runPythonAsync('dispatch_json(_studio_request)');
      postMessage({id:data.id,result:JSON.parse(raw)});
      python.globals.delete('_studio_request');
    }catch(error){postMessage({id:data.id,error:String(error.message||error).split('\n').filter(Boolean).slice(-1)[0]});}
  });
};
