let ws = null;
let audioFile = null;
let markers = [];
const waveContainer = document.getElementById('waveform');
const fileEl = document.getElementById('file');
const playBtn = document.getElementById('playBtn');
const autoCountEl = document.getElementById('autoCount');
const modeSel = document.getElementById('modeSel');

const defaultSlices = 8;

// Initialize WaveSurfer
function initWaveSurfer(file) {
    if (ws) ws.destroy();

    ws = WaveSurfer.create({
        container: waveContainer,
        waveColor: '#222',
        progressColor: '#1db954',
        cursorColor: '#fff',
        height: 220,
        scrollParent: true,
        interact: true,
        normalize: true,
        responsive: true
    });

    ws.on('ready', () => {
        drawGrid();
        if (modeSel.value === 'equal') autoApply(parseInt(autoCountEl.value || defaultSlices));
    });

    ws.on('finish', () => playBtn.innerHTML = '<i class="fa fa-play"></i>');

    // Load WAV as Blob URL
    const url = URL.createObjectURL(file);
    ws.load(url);
}

// Drag & drop support
waveContainer.addEventListener('dragover', (e) => e.preventDefault());
waveContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.includes('wav')) {
        audioFile = f;
        initWaveSurfer(f);
    }
});

// File input
fileEl.onchange = () => {
    const f = fileEl.files[0];
    if (!f) return alert('Choose a WAV file first');
    audioFile = f;
    initWaveSurfer(f);
};

// Play/Pause
playBtn.onclick = () => {
    if (!ws) return alert('Load a WAV first');
    ws.playPause();
    playBtn.innerHTML = ws.isPlaying() ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';
};

// Auto-slice function
function autoApply(count) {
    if (!ws) return;
    markers.forEach(m => m.remove());
    markers = [];

    const duration = ws.getDuration();
    const interval = duration / count;

    for (let i = 1; i < count; i++) {
        const time = i * interval;
        const marker = ws.addRegion({
            start: time,
            end: time + 0.001,
            color: 'rgba(255,0,0,0.5)',
            drag: true
        });
        markers.push(marker);
    }
}

// Draw waveform grid background
function drawGrid() {
    const wave = waveContainer.querySelector('wave');
    if (!wave) return;
    wave.style.background = 'linear-gradient(to bottom, #111 0%, #111 100%)';
}

// Expose function for manual auto-slice
window.autoSlice = () => autoApply(parseInt(autoCountEl.value || defaultSlices));
