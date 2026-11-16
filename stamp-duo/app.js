/* AlterNative Stamp Manager Duo · 0.3.0 · no AI / no server */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DB_NAME='alternative-stamp-duo', PDF_JS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js', PDF_LIB='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const state = { pose:'closed', authorized:false, registered:null, stamps:[], filter:'all', search:'', tool:null, pdfBytes:null, pdfName:'', pdfDoc:null, page:1, count:0, currentSize:{width:595,height:842}, placements:[], selected:null, zoom:1, history:[], future:[], ready:false, lastWidth:0 };
let dbInstance, toastTimer, savingTimer, renderCounter=0, pointerAction=null, pdfRenderTask=null;
function toast(message,ms=2900){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),ms);}
function db(){if(dbInstance)return dbInstance;dbInstance=new Promise((resolve,reject)=>{let r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{let d=r.result;d.createObjectStore('data');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbInstance;}
async function getStore(key){const d=await db();return new Promise((res,rej)=>{let t=d.transaction('data','readonly');let r=t.objectStore('data').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function putStore(key,value){const d=await db();return new Promise((res,rej)=>{let t=d.transaction('data','readwrite');t.objectStore('data').put(value,key);t.oncomplete=res;t.onerror=()=>rej(t.error);});}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function bytesFromB64(str){let raw=atob(str.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function randomBytes(n){return crypto.getRandomValues(new Uint8Array(n));}
function isPreview(){return new URLSearchParams(location.search).get('preview')==='1';}
function poseInfo(){let width=innerWidth,height=innerHeight,segments=[];try{segments=window.viewport?.segments||[];}catch{}let segmented=segments.length>1;
 const folded=navigator.devicePosture?.type==='folded';let override=new URLSearchParams(location.search).get('pose');
 const pose=override==='open'||override==='closed'?override:(segmented||folded||width/Math.max(height,1)>1.16?'open':'closed');return {pose,segments,folded};}
function applyPose(){const result=poseInfo();if(state.pose!==result.pose){state.pose=result.pose;state.zoom=1;}
 const root=$('#app');root.classList.toggle('pose-open',state.pose==='open');root.classList.toggle('pose-closed',state.pose==='closed');root.classList.toggle('authenticated',state.authorized);root.classList.toggle('locked',!state.authorized);
 $('#workspace').inert=!(state.authorized&&state.pose==='open');$('#classified-screen').inert=state.authorized||state.pose!=='open';
 $('#folder-caption').textContent=state.authorized?'ПАПКА РАЗБЛОКИРОВАНА':'ПАПКА ЗАПЕЧАТАНА';
 $('#unlock-label').textContent=state.authorized?'Раскройте Duo':'Разблокировать';
 $('#cover-hint').textContent=state.authorized?'Откройте телефон для работы с документами':'Подтверждение личности через iOS';
 $('#unlock-btn').disabled=state.authorized;
 if(state.pose==='open'&&state.authorized&&state.pdfDoc)requestAnimationFrame(renderPage);
}
async function unlock(){if(state.authorized)return;let secure=!!window.isSecureContext && !!window.PublicKeyCredential && !!navigator.credentials;
 if(!secure){if(isPreview()){state.authorized=true;applyPose();toast('Демо-режим: без биометрической проверки');return;}toast('Для Touch ID необходим HTTPS и поддержка WebAuthn',4300);return;}
 try{if(!state.registered){
   const cred=await navigator.credentials.create({publicKey:{challenge:randomBytes(32),rp:{name:'AlterNative Stamp Manager'},user:{id:randomBytes(20),name:'stamp-duo-local',displayName:'Stamp Manager Duo'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},timeout:90000,attestation:'none'}});
   if(!cred)throw new Error('Регистрация ключа отменена');state.registered=b64(new Uint8Array(cred.rawId));await putStore('credential',state.registered);toast('Ключ доступа создан для этого устройства');
 }else{
   const cred=await navigator.credentials.get({publicKey:{challenge:randomBytes(32),allowCredentials:[{type:'public-key',id:bytesFromB64(state.registered)}],userVerification:'required',timeout:90000}});
   if(!cred)throw new Error('Проверка отменена');
 }
 state.authorized=true;applyPose();
 }catch(e){console.warn('WebAuthn:',e);toast('Разблокировка не выполнена: '+(e?.message||'ошибка'),4300);}
}
function lock(){state.authorized=false;state.selected=null;state.tool=null;renderOverlay();hideProps();applyPose();toast('Папка запечатана');}
function loadScript(url,global){return new Promise((resolve,reject)=>{if(window[global])return resolve();let s=document.createElement('script');s.src=url;s.async=true;s.crossOrigin='anonymous';s.onload=()=>window[global]?resolve():reject(new Error('Библиотека недоступна'));s.onerror=()=>reject(new Error('Нет доступа к библиотеке PDF (проверьте интернет)'));document.head.append(s);});}
async function ensurePdfLibraries(){if(state.ready)return;toast('Подключаю PDF-движок…');await Promise.all([loadScript(PDF_JS,'pdfjsLib'),loadScript(PDF_LIB,'PDFLib')]);window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDF_WORKER;state.ready=true;}
function snapshot(){return JSON.stringify(state.placements);}
function record(){state.history.push(snapshot());if(state.history.length>70)state.history.shift();state.future.length=0;}
function undo(){if(!state.history.length)return;state.future.push(snapshot());state.placements=JSON.parse(state.history.pop());state.selected=null;hideProps();renderOverlay();scheduleSave();}
function redo(){if(!state.future.length)return;state.history.push(snapshot());state.placements=JSON.parse(state.future.pop());state.selected=null;hideProps();renderOverlay();scheduleSave();}
function scheduleSave(){clearTimeout(savingTimer);savingTimer=setTimeout(saveDraft,600);}
async function saveDraft(){if(!state.pdfBytes)return;try{await putStore('draft',{name:state.pdfName,bytes:state.pdfBytes,page:state.page,placements:state.placements});}catch(e){console.error(e);toast('Не удалось сохранить черновик: мало места?');}}
async function openPdfFile(file){if(!file)return;if(!(file.type==='application/pdf'||/\.pdf$/i.test(file.name))){toast('Выберите файл PDF');return;}if(file.size>100*1024*1024){toast('В этой версии предел PDF: 100 МБ');return;}
 try{await ensurePdfLibraries();let bytes=await file.arrayBuffer();await loadPdf(bytes,file.name,[],1);toast('PDF открыт');}
 catch(e){console.error(e);toast('Не удалось открыть PDF: '+e.message,4500);}}
async function loadPdf(bytes,name,placements=[],page=1){const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(bytes.slice(0))}).promise;
 state.pdfBytes=bytes;state.pdfDoc=doc;state.pdfName=name;state.count=doc.numPages;state.page=Math.min(Math.max(1,page),state.count);state.placements=placements;state.history=[];state.future=[];state.selected=null;state.zoom=1;
 $('#document-title').textContent=name;$('#empty-state').classList.add('hidden');$('#page-scroller').classList.remove('hidden');hideProps();await renderPage();scheduleSave();}
async function renderPage(){if(!state.pdfDoc||!state.authorized||state.pose!=='open')return;
 const token=++renderCounter;
 try{let page=await state.pdfDoc.getPage(state.page);if(token!==renderCounter)return;
 let original=page.getViewport({scale:1});state.currentSize={width:original.width,height:original.height};
 let scroll=$('#page-scroller'),sheet=$('#page-sheet');let availableW=Math.max(220,scroll.clientWidth-40),availableH=Math.max(220,scroll.clientHeight-30);let fit=Math.min(availableW,availableH*original.width/original.height);let cssWidth=fit*state.zoom;sheet.style.width=cssWidth+'px';sheet.style.maxWidth='none';sheet.style.aspectRatio=`${original.width} / ${original.height}`;
 let factor=Math.min(2.5,(cssWidth/original.width)*(Math.min(devicePixelRatio||1,2)));let view=page.getViewport({scale:factor});
 let canvas=$('#page-canvas');if(pdfRenderTask){try{pdfRenderTask.cancel();await pdfRenderTask.promise;}catch{}}
 if(token!==renderCounter)return;canvas.width=Math.floor(view.width);canvas.height=Math.floor(view.height);
 pdfRenderTask=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view});await pdfRenderTask.promise;
 if(token!==renderCounter)return;$('#page-count').textContent=`${state.page} из ${state.count}`;$('#zoom-value').textContent=Math.round(state.zoom*100)+'%';renderOverlay();
 }catch(e){if(!String(e.message||'').includes('cancelled')){console.error(e);toast('Ошибка отображения страницы');}}
}
function pagePlacements(){return state.placements.filter(x=>x.page===state.page);}
function stampById(id){return state.stamps.find(s=>s.id===id);}
function renderLibrary(){let container=$('#stamp-grid');container.innerHTML='';let filtered=state.stamps.filter(x=>(state.filter==='all'||x.type===state.filter)&&x.name.toLowerCase().includes(state.search.toLowerCase()));
 for(const stamp of filtered){let b=document.createElement('button');b.className='stamp-tile'+(state.tool===stamp.id?' active':'');b.setAttribute('aria-label',stamp.name);b.title='Выбрать '+stamp.name;let im=new Image();im.src=stamp.data;im.alt=stamp.name;let text=document.createElement('span');text.textContent=stamp.name;b.append(im,text);b.addEventListener('click',()=>{if(!state.pdfDoc){toast('Сначала откройте PDF');return;}state.tool=stamp.id;renderLibrary();toast('Коснитесь PDF, чтобы поставить: '+stamp.name);});container.append(b);}
 if(!filtered.length){let p=document.createElement('p');p.textContent='Здесь пока пусто';p.style.cssText='grid-column:1/-1;text-align:center;font-size:12px;color:#efd0c6';container.append(p);}}
function renderOverlay(){const layer=$('#overlay');layer.replaceChildren();for(const item of pagePlacements()){
 let stamp=stampById(item.stampId);if(!stamp)continue;let el=document.createElement('div');el.className='placed-stamp'+(state.selected===item.id?' selected':'');el.style.left=item.x*100+'%';el.style.top=item.y*100+'%';el.style.width=item.w*100+'%';el.style.height=item.h*100+'%';el.style.opacity=item.opacity??1;el.style.transform=`rotate(${item.rotation||0}deg)`;el.dataset.id=item.id;
 let img=new Image();img.src=stamp.data;img.alt=stamp.name;img.draggable=false;el.append(img);
 if(item.id===state.selected){for(let kind of ['resize','rotate']){let handle=document.createElement('div');handle.className=kind+'-handle';handle.dataset.handle=kind;el.append(handle);}}
 el.addEventListener('pointerdown',e=>startPointer(e,item));layer.append(el);
 }}
function select(itemId){state.selected=itemId;renderOverlay();showProps();}
function showProps(){let obj=state.placements.find(s=>s.id===state.selected);$('#properties').classList.toggle('hidden',!obj);if(!obj)return;$('#rotation').value=Math.round(obj.rotation||0);$('#rotation-value').textContent=Math.round(obj.rotation||0)+'°';$('#opacity').value=Math.round((obj.opacity??1)*100);$('#opacity-value').textContent=Math.round((obj.opacity??1)*100)+'%';}
function hideProps(){$('#properties').classList.add('hidden');}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function addAt(clientX,clientY){if(!state.tool||!state.pdfDoc)return;const stamp=stampById(state.tool);if(!stamp)return;
 let rect=$('#page-sheet').getBoundingClientRect();let rx=(clientX-rect.left)/rect.width,ry=(clientY-rect.top)/rect.height;
 let w=stamp.type==='signature'?.27:.28;let h=(w*state.currentSize.width/state.currentSize.height)*(stamp.height/stamp.width);h=Math.min(h,.4);
 record();let item={id:crypto.randomUUID(),stampId:stamp.id,page:state.page,x:clamp(rx-w/2,0,1-w),y:clamp(ry-h/2,0,1-h),w,h,opacity:1,rotation:0};state.placements.push(item);state.tool=null;renderLibrary();select(item.id);scheduleSave();toast('Элемент добавлен. Перетащите его или измените размер.');}
function startPointer(e,item){if(e.button!==0)return;e.stopPropagation();let kind=e.target.dataset.handle||'move';state.selected=item.id;showProps();
 $$('.placed-stamp').forEach(el=>el.classList.toggle('selected',el.dataset.id===item.id));
 let stage=$('#page-sheet').getBoundingClientRect();let o=state.placements.find(s=>s.id===item.id);record();pointerAction={id:item.id,kind,startX:e.clientX,startY:e.clientY,original:{...o},stage,dragging:true};
 e.currentTarget.setPointerCapture?.(e.pointerId);}
function movePointer(e){if(!pointerAction)return;let a=pointerAction;let item=state.placements.find(x=>x.id===a.id);if(!item)return;
 let dx=(e.clientX-a.startX)/a.stage.width,dy=(e.clientY-a.startY)/a.stage.height;
 if(a.kind==='move'){item.x=clamp(a.original.x+dx,0,1-item.w);item.y=clamp(a.original.y+dy,0,1-item.h);}
 if(a.kind==='resize'){let ratio=a.original.h/a.original.w;let newW=clamp(a.original.w+dx,0.04,Math.min(1-a.original.x,(1-a.original.y)/ratio));item.w=newW;item.h=newW*ratio;}
 if(a.kind==='rotate'){let centerX=a.stage.left+(a.original.x+a.original.w/2)*a.stage.width,centerY=a.stage.top+(a.original.y+a.original.h/2)*a.stage.height;item.rotation=Math.round(Math.atan2(e.clientY-centerY,e.clientX-centerX)*180/Math.PI+90);}
 // Update only geometry during a drag: keep Pointer Capture and avoid rebuilding DOM.
 const element=$(`.placed-stamp[data-id="${CSS.escape(item.id)}"]`);if(element){element.style.left=item.x*100+'%';element.style.top=item.y*100+'%';element.style.width=item.w*100+'%';element.style.height=item.h*100+'%';element.style.transform=`rotate(${item.rotation||0}deg)`;}
 if(a.kind==='rotate'){$('#rotation').value=item.rotation;$('#rotation-value').textContent=item.rotation+'°';}}
function endPointer(){if(!pointerAction)return;pointerAction=null;renderOverlay();scheduleSave();}
async function fileToDataUrl(file){return new Promise((resolve,reject)=>{let reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
function imageDims(src){return new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>resolve({width:im.naturalWidth,height:im.naturalHeight});im.onerror=()=>reject(Error('Файл изображения повреждён'));im.src=src;});}
async function importStamp(file,type){if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('Поддерживаются PNG, JPG и WebP');return;}if(file.size>12*1024*1024){toast('Максимум 12 МБ на изображение');return;}
 try{let data=await fileToDataUrl(file),dim=await imageDims(data);let id=crypto.randomUUID();let entry={id,name:file.name.replace(/\.[^.]+$/,'').slice(0,65),type,data,...dim};state.stamps.push(entry);await putStore('stamps',state.stamps);renderLibrary();toast('Добавлено: '+entry.name);}catch(e){console.error(e);toast('Не удалось добавить изображение');}}
async function exportPdf(){if(!state.pdfBytes){toast('Сначала откройте PDF');return;}
 try{await ensurePdfLibraries();toast('Готовлю PDF…');const lib=window.PDFLib, doc=await lib.PDFDocument.load(state.pdfBytes.slice(0));let cache=new Map();
 for(const placement of state.placements){let stamp=stampById(placement.stampId),page=doc.getPages()[placement.page-1];if(!stamp||!page)continue;
  let img=cache.get(stamp.id);if(!img){let data=stamp.data, arr=await (await fetch(data)).arrayBuffer();img=await (data.startsWith('data:image/jpeg')?doc.embedJpg(arr):doc.embedPng(await normalizePng(data)));cache.set(stamp.id,img);}
  let pW=page.getWidth(),pH=page.getHeight(),w=placement.w*pW,h=placement.h*pH,cx=(placement.x+placement.w/2)*pW,cy=(1-placement.y-placement.h/2)*pH;
  let rot=-(placement.rotation||0)*Math.PI/180, ox=cx-(Math.cos(rot)*w/2-Math.sin(rot)*h/2),oy=cy-(Math.sin(rot)*w/2+Math.cos(rot)*h/2);
  page.drawImage(img,{x:ox,y:oy,width:w,height:h,rotate:lib.degrees(-(placement.rotation||0)),opacity:placement.opacity??1});
 }
 let bytes=await doc.save(), blob=new Blob([bytes],{type:'application/pdf'}),filename=(state.pdfName||'Документ').replace(/\.pdf$/i,'')+'_подписано.pdf';
 if(navigator.canShare&&navigator.canShare({files:[new File([blob],filename,{type:'application/pdf'})]})){
  try{await navigator.share({files:[new File([blob],filename,{type:'application/pdf'})],title:filename});toast('PDF подготовлен для отправки');return;}catch(e){if(e.name==='AbortError')return;}
 }
 let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Готовый PDF сохранён');
 }catch(e){console.error(e);toast('Экспорт не удался: '+e.message,5000);}}
async function normalizePng(data){if(data.startsWith('data:image/png'))return(await(await fetch(data)).arrayBuffer());
 // pdf-lib supports PNG/JPG only. Convert imported WebP through canvas.
 let img=new Image();img.src=data;await img.decode();let c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return await(await fetch(c.toDataURL('image/png'))).arrayBuffer();}
async function initializeSamples(){const sampleList=[['Образец, синяя печать','stamp','./assets/sample-blue.png'],['Образец, красная печать','stamp','./assets/sample-red.png'],['Образец, подпись','signature','./assets/sample-signature.png']];let list=[];
 for(const [name,type,url] of sampleList){let r=await fetch(url),b=await r.blob();let data=await fileToDataUrl(b),dims=await imageDims(data);list.push({id:crypto.randomUUID(),name,type,data,...dims});}state.stamps=list;await putStore('stamps',list);}
async function initialize(){try{state.registered=await getStore('credential')||null;state.stamps=await getStore('stamps')||[];if(!state.stamps.length)await initializeSamples();renderLibrary();let draft=await getStore('draft');if(draft?.bytes){try{await ensurePdfLibraries();await loadPdf(draft.bytes,draft.name,draft.placements||[],draft.page||1);toast('Восстановлен локальный черновик');}catch(e){console.warn('draft unavailable:',e);}}}catch(e){console.error(e);toast('Локальное хранилище недоступно');}}
function setupEvents(){
 $('#toggle-library').addEventListener('click',()=>{const closed=$('#app').classList.toggle('library-collapsed');$('#toggle-library').setAttribute('aria-expanded',String(!closed));$('#toggle-library').setAttribute('aria-label',closed?'Показать библиотеку':'Скрыть библиотеку');if(state.pdfDoc)setTimeout(renderPage,80);});
 $('#lock-header').addEventListener('click',lock);
 $('#fit-page').addEventListener('click',()=>{state.zoom=1;renderPage();});
 $('#unlock-btn').addEventListener('click',unlock);$('#classified-unlock').addEventListener('click',unlock);$('#rail-lock').addEventListener('click',lock);
 [$('#open-pdf'),$('#empty-open'),$('#rail-import')].forEach(x=>x.addEventListener('click',()=>$('#pdf-file').click()));$('#pdf-file').addEventListener('change',e=>{openPdfFile(e.target.files[0]);e.target.value='';});
 $('#demo-open').addEventListener('click',async()=>{try{let r=await fetch('./assets/demo.pdf');if(!r.ok)throw Error('Файл не найден');await ensurePdfLibraries();await loadPdf(await r.arrayBuffer(),'Образец_документа.pdf');}catch(e){toast('Демо не открывается: '+e.message);}});
 $('#add-stamp').addEventListener('click',()=>$('#import-dialog').classList.remove('hidden'));$('#add-stamp-header').addEventListener('click',()=>$('#import-dialog').classList.remove('hidden'));$('#modal-close').addEventListener('click',()=>$('#import-dialog').classList.add('hidden'));
 let currentType='stamp';$('#choose-stamp').addEventListener('click',()=>{currentType='stamp';$('#import-dialog').classList.add('hidden');$('#stamp-file').click();});$('#choose-signature').addEventListener('click',()=>{currentType='signature';$('#import-dialog').classList.add('hidden');$('#stamp-file').click();});$('#stamp-file').addEventListener('change',e=>{importStamp(e.target.files[0],currentType);e.target.value='';});
 $('#library-search').addEventListener('input',e=>{state.search=e.target.value;renderLibrary();});$$('.segment').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;$$('.segment').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});renderLibrary();}));
 $('#overlay').addEventListener('pointerdown',e=>{if(e.target!==e.currentTarget)return;if(state.tool){addAt(e.clientX,e.clientY);}else{state.selected=null;hideProps();renderOverlay();}});
 window.addEventListener('pointermove',movePointer,{passive:true});window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
 $('#undo').addEventListener('click',undo);$('#redo').addEventListener('click',redo);
 $('#prev-page').addEventListener('click',()=>{if(state.page<=1)return;state.page--;state.selected=null;hideProps();renderPage();scheduleSave();});$('#next-page').addEventListener('click',()=>{if(state.page>=state.count)return;state.page++;state.selected=null;hideProps();renderPage();scheduleSave();});
 $('#zoom-in').addEventListener('click',()=>{state.zoom=clamp(state.zoom+.15,.55,2.2);renderPage();});$('#zoom-out').addEventListener('click',()=>{state.zoom=clamp(state.zoom-.15,.55,2.2);renderPage();});
 $('#save').addEventListener('click',exportPdf);$('#rail-export').addEventListener('click',exportPdf);$('#rail-stamp').addEventListener('click',()=>{state.filter='stamp';$$('.segment').find(b=>b.dataset.filter==='stamp')?.click();toast('Выберите печать слева');});$('#rail-sign').addEventListener('click',()=>{state.filter='signature';$$('.segment').find(b=>b.dataset.filter==='signature')?.click();toast('Выберите подпись слева');});
 $('#properties-close').addEventListener('click',()=>{state.selected=null;hideProps();renderOverlay();});$('#delete-object').addEventListener('click',()=>{record();state.placements=state.placements.filter(x=>x.id!==state.selected);state.selected=null;hideProps();renderOverlay();scheduleSave();});
 for(let id of ['rotation','opacity']){$('#'+id).addEventListener('pointerdown',record,{passive:true});$('#'+id).addEventListener('input',e=>{let obj=state.placements.find(s=>s.id===state.selected);if(!obj)return;if(id==='rotation'){obj.rotation=Number(e.target.value);$('#rotation-value').textContent=e.target.value+'°';}else{obj.opacity=Number(e.target.value)/100;$('#opacity-value').textContent=e.target.value+'%';}renderOverlay();scheduleSave();});}
 $('#more').addEventListener('click',()=>{toast('Stamp Manager Duo v0.3 · Обработка PDF локально. Блокировка пока не шифрует файлы.',5500);});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'){state.tool=null;state.selected=null;hideProps();renderLibrary();renderOverlay();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}});
 let resizeScheduled;
 const onViewportResize=()=>{cancelAnimationFrame(resizeScheduled);resizeScheduled=requestAnimationFrame(()=>{let old=state.pose;applyPose();if(old===state.pose&&state.pose==='open'&&state.authorized&&state.pdfDoc)renderPage();});};
 window.addEventListener('resize',onViewportResize);window.visualViewport?.addEventListener('resize',onViewportResize);
 navigator.devicePosture?.addEventListener?.('change',applyPose);
}
setupEvents();applyPose();initialize();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn);