// --- Sample storage using JSON format ---
let samplesData = { samples: [] };

// --- Helpers ---
function addSample(name, blob, note="C4", velocity=127){
    samplesData.samples.push({name, blob, note, velocity});
}

function clearSamples(){ samplesData.samples = []; }

function getSamples(){ return samplesData.samples; }

// --- DOM ---
const fileInput = document.getElementById('file');
const loadBtn = document.getElementById('load');
const playBtn = document.getElementById('play');
const exportDwpBtn = document.getElementById('exportDwp');
const markersList = document.getElementById('markersList');
const waveformDiv = document.getElementById('waveform');
const modeSelect = document.getElementById('mode');
const notesMode = document.getElementById('notesMode');

let wavesurfer = WaveSurfer.create({
    container: waveformDiv,
    waveColor:'#333',
    progressColor:'#1db954',
    height:180,
    scrollParent:true
});

let audioFile = null;
let markers = []; // {time, el, label, note, velocity}
let draggedMarker = null;

// --- Load Audio ---
loadBtn.addEventListener('click', ()=>{
    const f = fileInput.files[0];
    if(!f) return alert('Select a file');
    audioFile = f;
    clearSamples();
    clearMarkers();
    wavesurfer.load(URL.createObjectURL(f));
});

// --- Play/Pause ---
playBtn.addEventListener('click', ()=>{ wavesurfer.playPause(); });

// --- Marker Management ---
function clearMarkers(){
    markers.forEach(m=>m.el.remove());
    markers = [];
    updateMarkerList();
}

function updateMarkerList(){
    markersList.textContent = markers.length ? markers.map(m=>m.time.toFixed(2)+'s').join(', ') : 'none';
}

function addMarker(time, note='C4', velocity=127){
    const el = document.createElement('div');
    el.classList.add('marker');
    const label = document.createElement('div');
    label.classList.add('marker-label');
    el.appendChild(label);
    waveformDiv.appendChild(el);

    const updatePos = ()=>{
        el.style.left = (time/wavesurfer.getDuration()*100)+'%';
        label.textContent = `${note} (${velocity})`;
    }
    updatePos();

    // Dragging
    el.addEventListener('pointerdown', e=>{
        draggedMarker = {marker:{time, el, label, note, velocity}, offsetX:e.clientX};
        e.preventDefault();
    });

    // Double tap to delete
    el.addEventListener('dblclick', ()=>{
        el.remove();
        markers = markers.filter(m=>m.el!==el);
        updateMarkerList();
    });

    markers.push({time, el, label, note, velocity});
    updateMarkerList();
}

// --- Add marker on waveform click ---
waveformDiv.addEventListener('pointerdown', e=>{
    if(modeSelect.value!=='manual') return; // only manual mode
    const rect = waveformDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * wavesurfer.getDuration();

    // Determine note/velocity
    let note='C4', velocity=127;
    if(notesMode.value==='chromatic'){
        const chromatic = ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4'];
        const index = Math.floor((x/rect.width)*chromatic.length)%chromatic.length;
        note = chromatic[index];
    } else {
        velocity = Math.floor(Math.random()*128);
    }

    addMarker(time, note, velocity);
});

// --- Drag marker ---
waveformDiv.addEventListener('pointermove', e=>{
    if(!draggedMarker) return;
    const dx = e.clientX - draggedMarker.offsetX;
    const width = waveformDiv.clientWidth;
    let newTime = draggedMarker.marker.time + dx/width*wavesurfer.getDuration();
    newTime = Math.max(0, Math.min(newTime, wavesurfer.getDuration()));
    draggedMarker.marker.time = newTime;
    draggedMarker.marker.el.style.left = (newTime/wavesurfer.getDuration()*100)+'%';
    draggedMarker.marker.label.textContent = `${draggedMarker.marker.note} (${draggedMarker.marker.velocity})`;
    updateMarkerList();
});

window.addEventListener('pointerup', ()=>{ draggedMarker=null; });

// --- Auto Slice on load ---
wavesurfer.on('ready', ()=>{
    clearMarkers();
    if(modeSelect.value==='equal'){
        const slices = 60;
        const step = wavesurfer.getDuration()/slices;
        for(let i=1;i<slices;i++){
            let time = i*step;
            let note='C4', velocity=127;
            if(notesMode.value==='chromatic'){
                const chromatic = ['C4','D4','E4','F4','G4','A4','B4'];
                note = chromatic[i%chromatic.length];
            } else {
                velocity = Math.floor(Math.random()*128);
            }
            addMarker(time, note, velocity);
        }
    }
});

// --- WAV Slicing ---
function audioBufferToWavBlob(buffer, start=0, end=null){
    const sampleRate = buffer.sampleRate;
    const ch = buffer.numberOfChannels;
    const s = Math.floor(start*sampleRate);
    const e = Math.floor((end===null?buffer.length:Math.min(buffer.length, Math.floor(end*sampleRate))));
    const len = e-s;
    const tmp = new Float32Array(len*ch);
    for(let c=0;c<ch;c++){
        const cd = buffer.getChannelData(c);
        for(let i=0;i<len;i++) tmp[i*ch+c] = cd[s+i];
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

async function sliceAudioAndAdd(){
    if(!audioFile) return;
    const ab = await audioFile.arrayBuffer();
    const ctx = new (window.OfflineAudioContext||window.AudioContext)(1,1,44100);
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    const points = markers.map(m=>m.time).sort((a,b)=>a-b);
    if(points.length===0) points.push(0, decoded.duration);
    else{ points.unshift(0); points.push(decoded.duration); }
    for(let i=0;i<points.length-1;i++){
        const blob = audioBufferToWavBlob(decoded, points[i], points[i+1]);
        const note = markers[i]?.note || 'C4';
        const velocity = markers[i]?.velocity || 127;
        addSample(`sample_${i}.wav`, blob, note, velocity);
    }
}

// --- Export DWP with note+velocity ---
exportDwpBtn.addEventListener('click', async ()=>{
    await sliceAudioAndAdd();
    const samples = getSamples();
    const header = new TextEncoder().encode('DWPv2');
    const manifest = {samples:samples.map(s=>({name:s.name,note:s.note,velocity:s.velocity}))};
    const manifestEncoded = new TextEncoder().encode(JSON.stringify(manifest));
    let totalLength = header.length + 4 + manifestEncoded.length;
    samples.forEach(s=>totalLength += 4 + s.name.length + 4 + s.blob.size + 1 + 1); // + note+velocity byte
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
        outBuf[offset++] = s.note.charCodeAt(0); // simplified note storage
        outBuf[offset++] = s.velocity;
    }
    const dwpBlob = new Blob([outBuf],{type:'application/octet-stream'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(dwpBlob); a.download='chromatic.dwp'; a.click();
});
