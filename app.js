let samplesData = { samples: [] };

// Helpers for JSON storage
function addSample(name, blob, note="C4", velocity=127){
    samplesData.samples.push({name, blob, note, velocity});
}

function clearSamples(){ samplesData.samples = []; }

function getSamples(){ return samplesData.samples; }

// --- All other logic from previous app.js remains mostly the same ---

// --- AUTO SLICE & NOTES MODE ---
wavesurfer.on('ready', ()=>{
    clearMarkers(); // remove old markers
    if(document.getElementById('mode').value==='equal'){
        const slices = 60;
        const step = wavesurfer.getDuration()/slices;
        const noteMode = document.getElementById('notesMode').value;
        for(let i=1;i<slices;i++){
            let markerTime = i*step;
            addMarker(markerTime);
            // assign note or velocity layer
            if(noteMode==='chromatic'){
                // simple C chromatic mapping example
                const note = ['C4','D4','E4','F4','G4','A4','B4'][i%7];
                markers[i-1].note = note;
            } else {
                // velocity layers
                const velocity = Math.floor(Math.random()*128);
                markers[i-1].velocity = velocity;
            }
        }
    }
});

// --- Slicing into WAV blobs ---
async function sliceAudioAndAdd(){
    if(!audioFile) return;
    const ab = await audioFile.arrayBuffer();
    const ctx = new (window.OfflineAudioContext||window.AudioContext)(1,1,44100);
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    const points = markers.map(m=>m.time).sort((a,b)=>a-b);
    if(points.length===0){
        points.push(0, decoded.duration);
    } else {
        points.unshift(0);
        points.push(decoded.duration);
    }
    for(let i=0;i<points.length-1;i++){
        const blob = audioBufferToWavBlob(decoded, points[i], points[i+1]);
        const note = markers[i]?.note || 'C4';
        const velocity = markers[i]?.velocity || 127;
        addSample(`sample_${i}.wav`, blob, note, velocity);
    }
}
