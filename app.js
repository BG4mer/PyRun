import { addSample, clearSamples, getSamples } from './samplesInDwp.js';

const fileInput = document.getElementById('file');
const loadBtn = document.getElementById('load');
const playBtn = document.getElementById('play');
const addMarkerBtn = document.getElementById('addMarker');
const clearMarkersBtn = document.getElementById('clearMarkers');
const exportDwpBtn = document.getElementById('exportDwp');
const markersList = document.getElementById('markersList');
const waveformDiv = document.getElementById('waveform');

let wavesurfer = WaveSurfer.create({
    container: waveformDiv,
    waveColor:'#333',
    progressColor:'#1db954',
    height:140,
    scrollParent:true
});
let audioFile = null;
let markers = []; // seconds

// Load audio
loadBtn.addEventListener('click', ()=>{
    const f = fileInput.files[0];
    if(!f) return alert('Select a file');
    audioFile = f;
    clearSamples();
    markers = [];
    markersList.textContent = 'none';
    wavesurfer.load(URL.createObjectURL(f));
});

// Play/pause
playBtn.addEventListener('click', ()=>{ wavesurfer.playPause(); });

// Render markers list
function renderMarkers(){
    markersList.textContent = markers.length ? markers.map(m=>m.toFixed(2)+'s').join(', ') : 'none';
}

// Add marker
function addMarkerAt(time){
    markers.push(time);
    markers.sort((a,b)=>a-b);
    renderMarkers();
}

// Clear markers
clearMarkersBtn.addEventListener('click', ()=>{
    markers=[];
    renderMarkers();
});

// Add marker via button
addMarkerBtn.addEventListener('click', ()=>{ addMarkerAt(wavesurfer.getCurrentTime()); });

// --- MOBILE TOUCH GESTURES ---
let isDragging = false;
let dragIndex = -1;

waveformDiv.addEventListener('touchstart', e=>{
    if(!wavesurfer.isReady) return;
    const touch = e.touches[0];
    const rect = waveformDiv.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const time = (x / rect.width) * wavesurfer.getDuration();

    // Check if near existing marker
    dragIndex = markers.findIndex(m=>Math.abs(m-time)<0.2);
    if(dragIndex===-1){
        addMarkerAt(time); // new marker
    } else {
        isDragging = true;
    }
});

waveformDiv.addEventListener('touchmove', e=>{
    if(!isDragging || dragIndex===-1) return;
    const touch = e.touches[0];
    const rect = waveformDiv.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const time = Math.max(0, Math.min(time = (x / rect.width) * wavesurfer.getDuration(), wavesurfer.getDuration()));
    markers[dragIndex] = time;
    markers.sort((a,b)=>a-b);
    renderMarkers();
});

waveformDiv.addEventListener('touchend', e=>{
    isDragging = false;
    dragIndex = -1;
});

// --- WAV SLICING ---
function audioBufferToWavBlob(buffer, start=0, end=null){
    const sampleRate = buffer.sampleRate;
    const ch = buffer.numberOfChannels;
    const s = Math.floor(start*sampleRate);
    const e = Math.floor((end===null?buffer.length:Math.min(buffer.length, Math.floor(end*sampleRate))));
    const len = e-s;
    const tmp = new Float32Array(len*ch);
    for(let c=0;c<ch;c++){
        const cd = buffer.getChannelData(c);
        for(let i=0;i<len;i++){ tmp[i*ch+c] = cd[s+i]; }
    }
    const buf = new ArrayBuffer(44 + tmp.length*2);
    const view = new DataView(buf);
    function wstr(v,o,str){ for(let i=0;i<str.length;i++) view.setUint8(o+i,str.charCodeAt(i)); }
    wstr(view,0,'RIFF'); view.setUint32(4,36+tmp.length*2,true);
    wstr(view,8,'WAVE'); wstr(view,12,'fmt '); view.setUint32(16,16,true);
    view.setUint16(20,1,true); view.setUint16(22,ch,true); view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*ch*2,true); view.setUint16(32,ch*2,true); view.setUint16(34,16,true);
    wstr(view,36,'data'); view.setUint32(40,tmp.length*2,true);
    let offset=44;
    for(let i=0;i<tmp.length;i++){
        let s = Math.max(-1,Math.min(1,tmp[i]));
        view.setInt16(offset, s<0?s*0x8000:s*0x7FFF,true);
        offset+=2;
    }
    return new Blob([view], {type:'audio/wav'});
}

// Slice audio and add to memory
async function sliceAudioAndAdd(){
    if(!audioFile) return;
    const ab = await audioFile.arrayBuffer();
    const ctx = new (window.OfflineAudioContext||window.AudioContext)(1,1,44100);
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    const points = (markers.length>0?markers:[...Array(60)].map((_,i)=>i*decoded.duration/60));
    points.push(decoded.duration);
    for(let i=0;i<points.length-1;i++){
        const blob = audioBufferToWavBlob(decoded, points[i], points[i+1]);
        const name = `sample_${i}.wav`;
        addSample(name, blob);
    }
}

// Export DWP with embedded WAVs
exportDwpBtn.addEventListener('click', async ()=>{
    await sliceAudioAndAdd();
    const samples = getSamples();
    const header = new TextEncoder().encode('DWPv2');
    const manifest = {samples:samples.map(s=>s.name)};
    const manifestEncoded = new TextEncoder().encode(JSON.stringify(manifest));
    let totalLength = header.length + 4 + manifestEncoded.length;
    samples.forEach(s=>totalLength += 4 + s.name.length + 4 + s.blob.size);
    const outBuf = new Uint8Array(totalLength);
    let offset=0; outBuf.set(header,offset); offset+=header.length;
    new DataView(outBuf.buffer).setUint32(offset, manifestEncoded.length,true); offset+=4;
    outBuf.set(manifestEncoded, offset); offset+=manifestEncoded.length;
    for(let s of samples){
        new DataView(outBuf.buffer).setUint32(offset, s.name.length,true); offset+=4;
        for(let i=0;i<s.name.length;i++) outBuf[offset++]=s.name.charCodeAt(i);
        new DataView(outBuf.buffer).setUint32(offset, s.blob.size,true); offset+=4;
        const ab = await s.blob.arrayBuffer();
        outBuf.set(new Uint8Array(ab), offset); offset+=ab.byteLength;
    }
    const dwpBlob = new Blob([outBuf],{type:'application/octet-stream'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(dwpBlob); a.download='chromatic.dwp'; a.click();
});
