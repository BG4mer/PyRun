WAV → DWP — Frontend package (client-side chromatic slicer)

Files included:
- index.html  (web UI, WaveSurfer based)
- app.js      (client logic: splitting, packaging into ZIP, pseudo-DWP creation)
- README.md   (this file)

How to use (client-only):
1. Upload a single chromatic WAV (notes sequential, e.g. C2..C7).
2. Choose mode: equal, silence, manual.
   - equal: slices into 60 equal pieces (change parts in app.js if you need different count).
   - manual: place markers (play + Add marker) then Split.
   - silence: currently falls back to equal in this client build; server-side split provides better silence detection.
3. Click Split & Export ZIP — you get a zip containing:
   - manifest.json
   - samples/*.wav (sliced)
   - program.dwp (pseudo/open container)

Notes:
- This is a client-side tool targeting users who don't have FL Studio. The .dwp produced is a best-effort open container compatible with the server implementations in the full package.
- For robust silence splitting, use the server-side endpoint (server_flask_split.py) from the larger package and point the Send to Backend button to that endpoint.
- For GitHub Pages: upload index.html + app.js; GitHub Pages will host the frontend. To enable server conversion, deploy the server separately (Render, Railway, Replit, etc.)

License: MIT
