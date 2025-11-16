// app.js - client-side chromatic slicer + packager
// Requires WaveSurfer (included via CDN in index.html)
// Splits single WAV into multiple WAV slices client-side and packages into a ZIP

const fileInput = document.getElementById('file');
const loadBtn = document.getElementById('load');
const modeSel = document.getElementById('mode');
const playBtn = document.getElementById('play');
const addMarkerBtn = document.getElementById('addMarker');
const clearMarkersBtn = document.getElementById('clearMarkers');
const splitBtn = document.getElementById('split');
const sendBackendBtn = document.getElementById('sendBackend');
const markersList = document.getElementById('markersList');

let wavesurfer = WaveSurfer.create({container: '#waveform', waveColor:'#333', progressColor:'#1db954', height:140});
let audioFile = null;
let markers = []; // times in seconds

loadBtn.addEventListener('click', ()=>{
  const f = fileInput.files[0];
  if(!f) return alert('Select a file first');
  audioFile = f;
  const url = URL.createObjectURL(f);
  markers = [];
  markersList.textContent = 'none';
  wavesurfer.load(url);
  wavesurfer.on('ready', ()=>{ console.log('ready', wavesurfer.getDuration()); });
});

playBtn.addEventListener('click', ()=>{ wavesurfer.playPause(); });

addMarkerBtn.addEventListener('click', ()=>{
  if(!wavesurfer.isReady) return;
  const t = wavesurfer.getCurrentTime();
  markers.push(t);
  markers.sort((a,b)=>a-b);
  renderMarkers();
});

clearMarkersBtn.addEventListener('click', ()=>{ markers = []; renderMarkers(); });

function renderMarkers(){ markersList.textContent = markers.length ? markers.map(t=>t.toFixed(2)+'s').join(', ') : 'none'; }

// helper: convert AudioBuffer segment to WAV (PCM16) Blob
function audioBufferToWavBlob(buffer, startSec=0, endSec=null){
  const sampleRate = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const startOffset = Math.floor(startSec * sampleRate);
  const endOffset = Math.floor((endSec===null ? buffer.length : Math.min(buffer.length, Math.floor(endSec * sampleRate))));
  const len = endOffset - startOffset;
  const tmp = new Float32Array(len * ch);
  for(let c=0;c<ch;c++){
    const channelData = buffer.getChannelData(c);
    for(let i=0;i<len;i++){
      tmp[i*ch + c] = channelData[startOffset + i];
    }
  }
  const buffer16 = new ArrayBuffer(44 + tmp.length * 2);
  const view = new DataView(buffer16);
  function writeString(view, offset, str){ for(let i=0;i<str.length;i++) view.setUint8(offset + i, str.charCodeAt(i)); }
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + tmp.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, tmp.length * 2, true);
  let offset = 44;
  for(let i=0;i<tmp.length;i++){
    let s = Math.max(-1, Math.min(1, tmp[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([view], {type:'audio/wav'});
}

// split using WebAudio decode
async function splitChromatic(file, mode='equal', markers=[]){
  const audioCtx = new (window.OfflineAudioContext || window.AudioContext)(1,1,44100);
  const ab = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(ab.slice(0));
  const duration = decoded.duration;
  let slices = [];
  if(mode === 'equal'){
    const parts = 60; // default - change if needed
    const partLen = duration / parts;
    for(let i=0;i<parts;i++){
      const s = i*partLen;
      const e = (i<parts-1) ? (s+partLen) : duration;
      const wavBlob = audioBufferToWavBlob(decoded, s, e);
      slices.push({name:`sample_${i}.wav`, blob:wavBlob, rootMidi:36 + i});
    }
  } else if(mode === 'manual'){
    if(!markers || markers.length===0) throw new Error('No markers for manual mode');
    const m = markers.slice().sort((a,b)=>a-b);
    m.push(duration);
    for(let i=0;i<m.length-1;i++){
      const s = m[i];
      const e = m[i+1];
      const wavBlob = audioBufferToWavBlob(decoded, s, e);
      slices.push({name:`sample_${i}.wav`, blob:wavBlob, rootMidi:36 + i});
    }
  } else if(mode === 'silence'){
    console.warn('Silence mode: fallback to equal split in client build');
    return splitChromatic(file, 'equal', markers);
  }
  return slices;
}

// Create pseudo-DWP buffer
async function buildDwpBlob(manifest, samples){
  const header = new TextEncoder().encode('DWPv1');
  const jsonChunk = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const jsonLen = new Uint32Array([jsonChunk.length]).buffer;
  const sampleBuffers = [];
  for(const s of samples){
    const ab = await s.blob.arrayBuffer();
    sampleBuffers.push({name:s.name, buffer:new Uint8Array(ab)});
  }
  let total = header.byteLength + jsonLen.byteLength + jsonChunk.byteLength + 4;
  for(const s of sampleBuffers){
    total += 4 + s.name.length + 4 + s.buffer.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  out.set(header, offset); offset += header.byteLength;
  out.set(new Uint8Array(jsonLen), offset); offset += jsonLen.byteLength;
  out.set(jsonChunk, offset); offset += jsonChunk.byteLength;
  const dv = new DataView(out.buffer);
  dv.setUint32(offset, sampleBuffers.length, true); offset += 4;
  for(const s of sampleBuffers){
    dv.setUint32(offset, s.name.length, true); offset +=4;
    for(let i=0;i<s.name.length;i++){ out[offset++] = s.name.charCodeAt(i); }
    dv.setUint32(offset, s.buffer.length, true); offset +=4;
    out.set(s.buffer, offset); offset += s.buffer.length;
  }
  return new Blob([out], {type:'application/octet-stream'});
}

// package into ZIP using JSZip (CDN import)
async function packageZip(manifest, slices, dwpBlob){
  if(typeof JSZip === 'undefined'){
    await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  }
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file((manifest.programName || 'program') + '.dwp', dwpBlob);
  const sf = zip.folder('samples');
  for(const s of slices){
    sf.file(s.name, s.blob);
  }
  const content = await zip.generateAsync({type:'blob'});
  return content;
}

// Split & Export (client-only):
splitBtn.addEventListener('click', async ()=>{
  if(!audioFile) return alert('Load a file first');
  const mode = modeSel.value;
  try{
    const slices = await splitChromatic(audioFile, mode, markers);
    const manifest = {programName:'ChromaticProgram', author:'user', zones: slices.map((s,i)=>({index:i, sample:s.name, root_midi:s.rootMidi, velLow:0, velHigh:127}))};
    const dwp = await buildDwpBlob(manifest, slices);
    const zipBlob = await packageZip(manifest, slices, dwp);
    const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob); a.download = (manifest.programName||'program') + '.zip'; a.click();
  }catch(err){ alert('Error: '+err.message); console.error(err); }
});

// Send to backend
sendBackendBtn.addEventListener('click', async ()=>{
  if(!audioFile) return alert('Load a file first');
  const endpoint = prompt('Backend endpoint URL','http://localhost:3000/api/split_and_convert');
  if(!endpoint) return;
  const fd = new FormData();
  fd.append('chromatic', audioFile, audioFile.name);
  fd.append('mode', modeSel.value);
  fd.append('programName', 'ChromaticProgram');
  if(modeSel.value === 'manual') fd.append('markers', JSON.stringify(markers));
  try{
    const res = await fetch(endpoint, {method:'POST', body:fd});
    if(!res.ok) return alert('Server error '+res.status);
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chromatic-backend.zip'; a.click();
  }catch(e){ alert('Error: '+e.message); }
});
