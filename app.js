// app.js — Ultra Studio MAX: sky's the limit upgrade
// Uses WaveSurfer + JSZip loaded in index.html
// Features added: onset autodetection, crossfade overlapping generation, loop editor, normalize, piano-roll mapping, project share JSON, advanced export

const WaveSurfer = window.WaveSurfer, JSZip = window.JSZip;

// DOM
const fileInput = document.getElementById('file');
const fileDrop = document.getElementById('fileDrop');
const loadBtn = document.getElementById('load');
const zoomSlider = document.getElementById('zoom');
const gridSizeIn = document.getElementById('gridSize');
const markerList = document.getElementById('markerList');
const markersCount = document.getElementById('markersCount');
const keyboardDiv = document.getElementById('keyboard');
const velocityLane = document.getElementById('velocityLane');
const autoCount = document.getElementById('autoCount');
const autoPreviewBtn = document.getElementById('autoPreview');
const crossfadeMsInput = document.getElementById('crossfadeMs');
const detectOnsetsBtn = document.getElementById('detectOnsets');
const applyCrossfadeBtn = document.getElementById('applyCrossfade');
const normalizeBtn = document.getElementById('normalize');
const exportAllBtn = document.getElementById('exportAll');
const exportBtn = document.getElementById('exportAll');
const autoDetectBtn = document.getElementById('autoDetect');
const autoPreviewCount = document.getElementById('autoCount');
const saveProjBtn = document.getElementById('saveProj');
const loadProjBtn = document.getElementById('loadProj');
const shareProjBtn = document.getElementById('shareProj');

const waveWrap = document.getElementById('wavewrap');
const waveContainer = document.getElementById('wave');

// state
let ws = null;
let audioFile = null;
let audioBufferCached = null; // decoded AudioBuffer
let markers = []; // {time, note, velocity, loop:{start,end}, el}
let samples = []; // generated sample objects for export
const autoNotes = (() => {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const arr = [];
  for(let i=0;i<128;i++) arr.push(names[i%12] + (Math.floor(i/12)));
  return arr;
})();

// helpers
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function midiFromNote(note){ const map={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}; const m = (note||'C4').match(/^([A-G]#?)(\d+)$/); if(!m) return 60; return 12*(parseInt(m[2],10)+1) + (map[m[1]]||0); }
function noteColor(note, vel){ const map={'C':0,'C#':22,'D':40,'D#':60,'E':80,'F':120,'F#':160,'G':200,'G#':240,'A':280,'A#':320,'B':340}; const nm = (note||'C4').replace(/\d+$/,''); const hue = map[nm]||200; const light = 35 + Math.round((vel/127)*45); return `hsl(${hue}deg 80% ${light}%)`; }
function updateMarkersCount(){ markersCount.textContent = markers.length; document.getElementById('currXfade').innerText = (crossfadeMsInput.value||'0') + 'ms'; }

// WaveSurfer init
function initWave(){
  if(ws) ws.destroy();
  ws = WaveSurfer.create({ container:'#wave', waveColor:'#222', progressColor:'#1db954', cursorColor:'#fff', height:320, scrollParent:true, interact:false });
  ws.on('ready', ()=> {
    drawGrid(); renderMarkers(); if(document.getElementById('mode').value === 'equal') autoApply(parseInt(autoCount.value||60));
    // store decoded buffer for heavy ops
    ws.backend.getPeaks(512); // warm up
    if(!audioBufferCached) decodeAudioFileToBuffer(audioFile).then(b=> audioBufferCached = b);
  });
}
initWave();

// Drop handling
fileDrop.addEventListener('dragover', e=>{ e.preventDefault(); fileDrop.style.borderColor = '#1db954'; });
fileDrop.addEventListener('dragleave', e=>{ fileDrop.style.borderColor = 'rgba(255,255,255,0.03)'; });
fileDrop.addEventListener('drop', e=>{ e.preventDefault(); fileDrop.style.borderColor = 'rgba(255,255,255,0.03)'; const f = e.dataTransfer.files[0]; if(f) loadFile(f); });

// file load
fileInput.addEventListener('change', ()=>{ const f = fileInput.files[0]; if(f) loadFile(f); });
function loadFile(f){
  audioFile = f;
  audioBufferCached = null;
  initWave();
  ws.load(URL.createObjectURL(f));
  pushAutosave();
}

// decode helper
async function decodeAudioFileToBuffer(file){
  const ab = await file.arrayBuffer();
  const ctx = new (window.OfflineAudioContext||window.AudioContext)(1,1,44100);
  return await ctx.decodeAudioData(ab.slice(0));
}

// Grid
function drawGrid(){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const size = parseInt(gridSizeIn.value) || 16;
  for(let i=0;i<=size;i++){
    const ln = document.createElement('div');
    ln.style.position='absolute'; ln.style.top='0'; ln.style.bottom='0';
    ln.style.left = (i/size*100) + '%';
    ln.style.width = i%4===0 ? '2px':'1px';
    ln.style.background = i%4===0 ? 'rgba(255,255,255,0.03)':'rgba(255,255,255,0.01)';
    grid.appendChild(ln);
  }
}

// Markers UI
function renderMarkers(){
  // remove old DOMs first
  document.querySelectorAll('.marker').forEach(x=>x.remove());
  markers.forEach((m, idx)=>{
    const el = document.createElement('div'); el.className='marker';
    const label = document.createElement('div'); label.className='marker-label';
    label.innerText = `${m.note||'—'} • ${m.velocity||100}`;
    el.appendChild(label);
    el.style.left = ((m.time / ws.getDuration())*100) + '%';
    el.style.background = noteColor(m.note||'C4', m.velocity||100);
    el.addEventListener('pointerdown', e=> startDragMarker(e, idx));
    el.addEventListener('dblclick', e=> { e.stopPropagation(); deleteMarker(idx); });
    el.addEventListener('contextmenu', e=> { e.preventDefault(); openMarkerContext(idx, e.clientX, e.clientY); });
    document.getElementById('wavewrap').appendChild(el);
    m.el = el;
  });
  updateMarkersPanel();
  updateMarkersCount();
  renderVelocityLane();
}

function updateMarkersPanel(){
  markerList.innerHTML = '';
  markers.forEach((m,i)=>{
    const it = document.createElement('div'); it.className = 'marker-item';
    it.innerHTML = `<div>#${i+1} ${m.note||'—'} <span style="color:var(--muted)">@ ${m.time.toFixed(2)}s</span></div><div class="meta">${m.velocity||100}</div>`;
    it.onclick = ()=> ws.seekTo(m.time/ws.getDuration());
    markerList.appendChild(it);
  });
}

// drag
let dragging = null;
function startDragMarker(e, idx){
  dragging = {idx, startX:e.clientX, baseTime: markers[idx].time};
  e.target.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', dragMarkerMove);
  window.addEventListener('pointerup', dragMarkerUp, {once:true});
}
function dragMarkerMove(e){
  if(!dragging) return;
  const rect = ws.container.getBoundingClientRect();
  const dx = e.clientX - dragging.startX;
  const dur = ws.getDuration();
  const newTime = clamp(dragging.baseTime + (dx/rect.width)*dur, 0, dur);
  markers[dragging.idx].time = newTime;
  renderMarkers();
}
function dragMarkerUp(e){
  dragging = null;
  pushAutosave();
  window.removeEventListener('pointermove', dragMarkerMove);
}

// marker functions
function deleteMarker(idx){ markers[idx].el?.remove(); markers.splice(idx,1); renderMarkers(); pushAutosave(); }
function openMarkerContext(idx, x, y){
  const m = markers[idx];
  const menu = document.createElement('div'); menu.style.position='fixed'; menu.style.left=x+'px'; menu.style.top=y+'px';
  menu.style.background='#111'; menu.style.padding='6px'; menu.style.borderRadius='8px'; menu.style.zIndex=9999;
  const add = (name,fn)=>{ const b=document.createElement('div'); b.innerText=name; b.style.padding='6px 10px'; b.style.cursor='pointer'; b.onclick=()=>{ fn(); menu.remove(); }; menu.appendChild(b); };
  add('Set Note', ()=>{ const val = prompt('Note (C4)', m.note||'C4'); if(val){ m.note=val; pushAutosave(); renderMarkers(); } });
  add('Set Velocity', ()=>{ const v = parseInt(prompt('Velocity 0-127', m.velocity||100)); if(!isNaN(v)){ m.velocity = clamp(v,0,127); pushAutosave(); renderMarkers(); } });
  add('Set Loop Points (ms offset from start of zone)', ()=>{ const s = parseFloat(prompt('Loop start (s)', m.loop?.start || 0) || 0); const e = parseFloat(prompt('Loop end (s)', m.loop?.end || 0) || 0); m.loop = {start: s, end: e}; pushAutosave(); } );
  add('Duplicate Marker', ()=>{ markers.push({...m, time: m.time + 0.01}); renderMarkers(); pushAutosave(); });
  add('Delete', ()=> deleteMarker(idx) );
  document.body.appendChild(menu);
  const closeFn = ev=>{ if(!menu.contains(ev.target)) { menu.remove(); window.removeEventListener('pointerdown', closeFn); } };
  window.addEventListener('pointerdown', closeFn);
}

// add marker
function addMarkerAt(time, mapNote=null, vel=100){
  const nm = mapNote || (document.getElementById('notesMode').value === 'chromatic' ? autoNotes[Math.floor((time/ws.getDuration())*autoNotes.length)%autoNotes.length] : 'C4');
  markers.push({time, note:nm, velocity:vel, loop:null, el:null});
  renderMarkers();
  pushAutosave();
}

// autoslice equal
function autoApply(count=60){
  if(!ws || !ws.getDuration()) return;
  markers = [];
  const dur = ws.getDuration();
  for(let i=1;i<count;i++){
    const t = (i/count) * dur;
    addMarkerAt(t);
  }
}

// onset detection (simple RMS + peak pick)
async function detectOnsets(){
  if(!audioFile) return alert('Load a WAV first');
  if(!audioBufferCached) audioBufferCached = await decodeAudioFileToBuffer(audioFile);
  const buf = audioBufferCached;
  const sr = buf.sampleRate;
  const data = buf.getChannelData(0); // mono for onset
  const win = Math.round(0.02 * sr); // 20ms
  const hop = Math.round(win/2);
  const energies = [];
  for(let i=0;i+win < data.length; i+=hop){
    let sum=0;
    for(let j=0;j<win;j++){ const s = data[i+j]; sum += s*s; }
    energies.push(Math.sqrt(sum/win));
  }
  // derivative + threshold
  const diff = [];
  for(let i=1;i<energies.length;i++) diff.push(Math.max(0, energies[i]-energies[i-1]));
  const mean = diff.reduce((a,b)=>a+b,0)/diff.length;
  const thresh = Math.max(mean*4, 0.001);
  const times = [];
  for(let i=0;i<diff.length;i++){
    if(diff[i] > thresh){
      const t = ((i)*hop)/sr;
      if(times.length===0 || t - times[times.length-1] > 0.05) times.push(t); // min spacing 50ms
    }
  }
  // apply as markers
  markers = [];
  times.forEach(t=> addMarkerAt(t));
  if(markers.length===0) alert('No onsets detected — try increasing sensitivity');
  else pushAutosave();
}

// crossfade creation (creates output blobs with crossfade ms)
async function makeCrossfadedSamples(crossMs=12){
  if(!audioFile) throw new Error('No audio file');
  if(!audioBufferCached) audioBufferCached = await decodeAudioFileToBuffer(audioFile);
  const buf = audioBufferCached;
  const sr = buf.sampleRate;
  const dur = buf.duration;
  let points = markers.map(m=>m.time).sort((a,b)=>a-b);
  if(points.length===0){ points=[0,dur]; } else { points.unshift(0); points.push(dur); }
  samples = [];
  for(let i=0;i<points.length-1;i++){
    const s = Math.max(0, points[i] - (crossMs/1000));
    const e = Math.min(dur, points[i+1] + (crossMs/1000));
    const blob = audioSegmentCrossfadeToWav(buf, s, e, points[i], points[i+1], crossMs);
    const note = markers[i]?.note || 'C4';
    const vel = markers[i]?.velocity || 100;
    samples.push({name:`sample_${i}.wav`, blob, note, velocity:vel, loop: markers[i]?.loop || null});
    setProgress((i+1)/points.length * 0.7, `Building sample ${i+1}/${points.length}…`);
    await new Promise(r=>setTimeout(r,0)); // yield
  }
  setProgress(0.8, 'Samples built');
  return samples;
}

// construct WAV with crossfade applied in overlap edges
function audioSegmentCrossfadeToWav(audioBuf, segmentStart, segmentEnd, zoneStart, zoneEnd, crossMs){
  // We'll extract requested range and apply linear fades:
  const sr = audioBuf.sampleRate;
  const ch = audioBuf.numberOfChannels;
  const s = Math.floor(segmentStart * sr);
  const e = Math.floor(segmentEnd * sr);
  const len = e - s;
  // build interleaved Float32
  const outFloat = new Float32Array(len * ch);
  for(let c=0;c<ch;c++){
    const channel = audioBuf.getChannelData(c);
    for(let i=0;i<len;i++){
      outFloat[i*ch + c] = channel[s + i];
    }
  }
  // apply fades for crossfade region relative to zone boundaries
  const crossSamples = Math.round((crossMs/1000) * sr);
  // zoneStart and zoneEnd define non-overlap region inside this segment
  const zoneStartOffset = Math.floor((zoneStart - segmentStart) * sr);
  const zoneEndOffset = Math.floor((zoneEnd - segmentStart) * sr);
  // fade-in over first crossSamples if zoneStartOffset > 0, else none
  for(let i=0;i<crossSamples && (zoneStartOffset + i) < len; i++){
    const gain = (i / crossSamples);
    for(let c=0;c<ch;c++){
      const idx = (zoneStartOffset + i)*ch + c;
      if(idx >= 0 && idx < outFloat.length) outFloat[idx] *= gain;
    }
  }
  // fade-out at tail
  for(let i=0;i<crossSamples && (zoneEndOffset - i - 1) >= 0; i++){
    const gain = (i / crossSamples);
    for(let c=0;c<ch;c++){
      const idx = (zoneEndOffset - i - 1)*ch + c;
      if(idx >= 0 && idx < outFloat.length) outFloat[idx] *= gain;
    }
  }
  // convert interleaved float to PCM16 WAV buffer
  const wavBytes = floatInterleavedToWav(outFloat, sr, ch);
  return new Blob([wavBytes], {type:'audio/wav'});
}

function floatInterleavedToWav(float32Interleaved, sampleRate, numChannels){
  const dataLength = float32Interleaved.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  let offset = 0;
  function writeString(s){ for(let i=0;i<s.length;i++) view.setUint8(offset++, s.charCodeAt(i)); }
  writeString('RIFF'); view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString('WAVE'); writeString('fmt '); view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
  view.setUint16(offset, numChannels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data'); view.setUint32(offset, dataLength, true); offset += 4;
  // write samples
  for(let i=0;i<float32Interleaved.length;i++){
    let s = Math.max(-1, Math.min(1, float32Interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

// normalize (peak normalizing entire audio file)
async function normalizeFile(){
  if(!audioFile) return alert('Load audio first');
  if(!audioBufferCached) audioBufferCached = await decodeAudioFileToBuffer(audioFile);
  const buf = audioBufferCached;
  // compute RMS/peak
  let peak = 0;
  for(let c=0;c<buf.numberOfChannels;c++){
    const data = buf.getChannelData(c);
    for(let i=0;i<data.length;i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if(peak === 0) return alert('File is silent');
  const gain = 0.98 / peak;
  // apply gain into a new WAV blob
  const sr = buf.sampleRate, ch = buf.numberOfChannels, len = buf.length;
  const out = new Float32Array(len * ch);
  for(let c=0;c<ch;c++){
    const data = buf.getChannelData(c);
    for(let i=0;i<len;i++){ out[i*ch + c] = clamp(data[i] * gain, -1, 1); }
  }
  const wav = floatInterleavedToWav(out, sr, ch);
  // replace current audioFile with normalized Blob (user can export or re-load)
  audioFile = new Blob([wav], {type:'audio/wav'});
  ws.load(URL.createObjectURL(audioFile));
  audioBufferCached = await decodeAudioFileToBuffer(audioFile);
  setProgress(1, 'Normalized'); setTimeout(hideProgress, 600);
}

// export DWP ZIP
async function exportZipDwp(){
  try{
    showProgress('Preparing samples…');
    const crossMs = parseInt(crossfadeMsInput.value || 0);
    await makeCrossfadedSamples(crossMs);
    showProgress('Building ZIP...');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({samples: samples.map(s=>({name:s.name,note:s.note,velocity:s.velocity,loop:s.loop,crossfade:crossMs}))}, null, 2));
    const sf = zip.folder('samples');
    for(let i=0;i<samples.length;i++){
      const s = samples[i];
      const ab = await s.blob.arrayBuffer();
      sf.file(s.name, ab);
      setProgress(0.2 + (i/samples.length)*0.6, `Adding sample ${i+1}/${samples.length}...`);
      await new Promise(r=>setTimeout(r,0));
    }
    // create small DWP3 container as fallback embed
    const dwp = await buildDwpBinary(samples);
    zip.file('program.dwp', dwp);
    setProgress(0.85, 'Compressing zip...');
    const content = await zip.generateAsync({type:'blob'}, meta=> setProgress(0.85 + meta.percent*0.15, `Zipping ${Math.round(meta.percent)}%`));
    const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = 'ultrastudio_package.zip'; a.click();
    setProgress(1, 'Done'); setTimeout(hideProgress,500);
  }catch(e){ console.error(e); hideProgress(); alert('Export failed: '+e.message); }
}

// build simple DWP3 binary (open container)
async function buildDwpBinary(samples){
  const manifest = {samples: samples.map(s=>({name:s.name,note:s.note,velocity:s.velocity,loop:s.loop}))};
  const manB = new TextEncoder().encode(JSON.stringify(manifest));
  let total = 4 + 4 + manB.length + 4;
  const prepared = [];
  for(const s of samples){
    const data = new Uint8Array(await s.blob.arrayBuffer());
    const nameB = new TextEncoder().encode(s.name);
    prepared.push({nameB, data, note: s.note, vel: s.velocity});
    total += 4 + nameB.length + 4 + data.length + 2;
  }
  const out = new Uint8Array(total); let off=0;
  out.set(new TextEncoder().encode('DWP3'), off); off+=4;
  new DataView(out.buffer).setUint32(off, manB.length, true); off+=4;
  out.set(manB, off); off+=manB.length;
  new DataView(out.buffer).setUint32(off, prepared.length, true); off+=4;
  for(const p of prepared){
    new DataView(out.buffer).setUint32(off, p.nameB.length, true); off+=4;
    out.set(p.nameB, off); off+=p.nameB.length;
    new DataView(out.buffer).setUint32(off, p.data.length, true); off+=4;
    out.set(p.data, off); off+=p.data.length;
    const midi = midiFromNote(p.note);
    out[off++] = midi & 0xFF; out[off++] = p.vel & 0xFF;
  }
  return out.buffer;
}

// progress UI
function showProgress(text){ document.getElementById('progress').style.display='block'; document.getElementById('progressText').innerText = text; document.getElementById('progressFill').style.width = '0%'; }
function setProgress(p, text){ document.getElementById('progressFill').style.width = Math.round(p*100) + '%'; if(text) document.getElementById('progressText').innerText = text; }
function hideProgress(){ document.getElementById('progress').style.display='none'; }

// crossfade application (re-slice with crossfade)
applyCrossfadeBtn.addEventListener('click', async ()=> {
  if(!audioFile) return alert('Load file first');
  try{ showProgress('Applying crossfades...'); await makeCrossfadedSamples(parseInt(crossfadeMsInput.value||12)); hideProgress(); alert('Crossfade samples built (in memory). Export to ZIP to download.'); } catch(e){ console.error(e); hideProgress(); alert(e.message); }
});

// onset detect button
detectOnsetsBtn.addEventListener('click', async ()=> {
  try{ showProgress('Detecting onsets...'); await detectOnsets(); hideProgress(); } catch(e){ hideProgress(); alert(e.message); }
});
autoDetectBtn.addEventListener('click', ()=> detectOnsetsBtn.click());

// normalize
normalizeBtn.addEventListener('click', async ()=> { try{ showProgress('Normalizing...'); await normalizeFile(); hideProgress(); }catch(e){ hideProgress(); alert(e.message); } });

// export
exportAllBtn.addEventListener('click', ()=> exportZipDwp());

// add marker on click in manual mode
document.getElementById('wavewrap').addEventListener('pointerdown', e=>{
  if(document.getElementById('mode').value !== 'manual') return;
  if(!ws || !ws.getDuration()) return;
  const rect = ws.container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const t = clamp((x/rect.width) * ws.getDuration(), 0, ws.getDuration());
  addMarkerAt(t);
});

// auto preview (equal)
autoPreviewBtn.addEventListener('click', ()=> {
  const count = parseInt(autoPreviewCount.value||60);
  autoPreview(count);
  setTimeout(()=> clearPreview(), 2500);
});

// auto preview equal
function autoPreview(count){
  clearPreview();
  if(!ws || !ws.getDuration()) return;
  const d = ws.getDuration();
  for(let i=1;i<count;i++){
    const t = (i/count)*d;
    const el = document.createElement('div'); el.className='preview-line'; el.style.left = ((t/d)*100)+'%';
    document.getElementById('wavewrap').appendChild(el);
  }
}
function clearPreview(){ document.querySelectorAll('.preview-line').forEach(x=>x.remove()); }

// piano keyboard build
function buildKeyboard(){
  keyboardDiv.innerHTML = '';
  const keys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for(let o=3;o<5;o++){
    keys.forEach(k=>{
      const el = document.createElement('div'); el.className='key'; el.innerText = k.replace('#','♯'); el.title = k+o;
      el.onclick = ()=> {
        // preview: find sample mapped to this note
        const s = samples.find(x=> x.note === (k+o));
        if(s) playBlob(s.blob);
      };
      keyboardDiv.appendChild(el);
    });
  }
}
buildKeyboard();

// render velocity lane
function renderVelocityLane(){
  velocityLane.innerHTML = '';
  if(!markers.length) return;
  markers.forEach(m=>{
    const b = document.createElement('div'); b.className='vel-bar'; b.style.height = ((m.velocity||100)/127*100)+'%'; b.style.background = noteColor(m.note||'C4', m.velocity||100); b.title = `${m.note} • ${m.velocity}`;
    velocityLane.appendChild(b);
  });
}

// autosave (localStorage)
function pushAutosave(){
  try{
    const data = {markers: markers.map(m => ({time:m.time, note:m.note, velocity:m.velocity, loop:m.loop}))};
    localStorage.setItem('ultrastudio_autosave', JSON.stringify(data));
  }catch(e){}
}

// save/load project
saveProjBtn.addEventListener('click', ()=> {
  const data = {markers: markers.map(m=>({time:m.time, note:m.note, velocity:m.velocity, loop:m.loop}))};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ultrastudio_project.json'; a.click();
});
loadProjBtn.addEventListener('click', async ()=> {
  const f = await promptFile(); if(!f) return;
  const txt = await f.text(); const obj = JSON.parse(txt);
  markers = obj.markers.map(m=>({time:m.time, note:m.note, velocity:m.velocity, loop:m.loop, el:null}));
  renderMarkers();
});

// share
shareProjBtn.addEventListener('click', ()=> {
  const data = JSON.stringify({markers: markers.map(m=>({time:m.time, note:m.note, velocity:m.velocity, loop:m.loop}))});
  navigator.clipboard?.writeText(data).then(()=> alert('Project JSON copied to clipboard'), ()=> alert('Copy failed — try manual save'));
});

// helper prompt file
function promptFile(){ return new Promise(res=>{ const i=document.createElement('input'); i.type='file'; i.accept='.json'; i.onchange = ()=> res(i.files[0]); i.click(); }); }

// playback of blob
async function playBlob(blob){
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  await a.play();
}

// detect onsets (exposed above)
async function detectOnsets(){
  try{
    showProgress('Detecting onsets...');
    await new Promise(r=>setTimeout(r,10));
    await detectOnsetsCore();
    setProgress(1, 'Onsets detected'); setTimeout(hideProgress,800);
  }catch(e){ hideProgress(); throw e; }
}
async function detectOnsetsCore(){
  if(!audioFile) throw new Error('No file');
  if(!audioBufferCached) audioBufferCached = await decodeAudioFileToBuffer(audioFile);
  const buf = audioBufferCached; const sr = buf.sampleRate; const ch = Math.max(1, buf.numberOfChannels);
  const data = new Float32Array(buf.length);
  for(let i=0;i<buf.length;i++){
    let sum=0; for(let c=0;c<ch;c++) sum += Math.abs(buf.getChannelData(c)[i]);
    data[i] = sum/ch;
  }
  const win = Math.round(0.03*sr), hop = Math.round(win/2); const energies=[];
  for(let i=0;i+win<data.length;i+=hop){ let s=0; for(let j=0;j<win;j++) s += data[i+j]*data[i+j]; energies.push(Math.sqrt(s/win)); }
  const diff = []; for(let i=1;i<energies.length;i++) diff.push(Math.max(0, energies[i] - energies[i-1]));
  const mean = diff.reduce((a,b)=>a+b,0)/diff.length; const thresh = Math.max(mean*3, 0.0007);
  const times=[]; for(let i=0;i<diff.length;i++) if(diff[i] > thresh) { const t = (i*hop)/sr; if(times.length===0 || t - times[times.length-1] > 0.04) times.push(t); }
  // use times as markers (plus start)
  markers = []; times.forEach(t=> addMarkerAt(t));
  if(markers.length === 0) alert('No onsets detected — change sensitivity or try manual split.');
  pushAutosave();
}

// audio decoding helper
async function decodeAudioFileToBuffer(file){
  const ab = await file.arrayBuffer(); const ctx = new (window.OfflineAudioContext || window.AudioContext)(1,1,44100); return await ctx.decodeAudioData(ab.slice(0));
}

// crossfade marking helper above uses audioSegmentCrossfadeToWav

// utility show/hide progress
function showProgress(msg){ document.getElementById('progress').style.display='block'; document.getElementById('progressText').innerText = msg; document.getElementById('progressFill').style.width = '0%'; }
function setProgress(p, text){ document.getElementById('progressFill').style.width = Math.round(p*100)+'%'; if(text) document.getElementById('progressText').innerText = text; }
function hideProgress(){ document.getElementById('progress').style.display='none'; }

// prompt load file
async function promptFile(){ return new Promise(res => { const i = document.createElement('input'); i.type='file'; i.accept='.json'; i.onchange = ()=> res(i.files[0]); i.click(); }); }

// init small UI bindings
document.getElementById('load').addEventListener('click', ()=> { const f = fileInput.files[0]; if(f) loadFile(f); });
zoomSlider.addEventListener('input', ()=> { if(ws) ws.zoom(parseInt(zoomSlider.value)); });
gridSizeIn.addEventListener('change', drawGrid);
crossfadeMsInput.addEventListener('change', ()=> document.getElementById('currXfade').innerText = crossfadeMsInput.value + 'ms');

// quick helpers
function addMarkerAt(t){ addMarkerAtInner(t); } // alias
function addMarkerAtInner(time){
  const nm = (document.getElementById('notesMode').value === 'chromatic') ? autoNotes[Math.floor((time / ws.getDuration()) * autoNotes.length) % autoNotes.length] : 'C4';
  markers.push({time, note: nm, velocity: 100, loop: null, el:null}); renderMarkers(); pushAutosave();
}

// autosave push (every change)
function pushAutosave(){
  try{ localStorage.setItem('ultrastudio_snapshot', JSON.stringify({markers:markers.map(m=>({time:m.time,note:m.note,velocity:m.velocity,loop:m.loop}))})); }catch(e){}
}

// init UI state on load
(function init(){
  drawGrid(); renderMarkers(); renderVelocityLane();
  // attempt restore snapshot
  try{
    const s = localStorage.getItem('ultrastudio_snapshot'); if(s){ const obj = JSON.parse(s); if(obj.markers){ markers = obj.markers.map(m=>({time:m.time,note:m.note,velocity:m.velocity,loop:m.loop,el:null})); renderMarkers(); } }
  }catch(e){}
})();

// small helper to set progress externally (used by crossfade maker)
function setProgressExternal(p,msg){ setProgress(p,msg); }

// done — all features loaded
console.log('Ultra Studio MAX loaded — Sky\'s the limit features active.');
