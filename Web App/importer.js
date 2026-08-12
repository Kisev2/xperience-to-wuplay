(async function() {
    // 1. Create Modal UI overlay on the page
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '10%';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.width = '90%';
    div.style.maxWidth = '500px';
    div.style.backgroundColor = '#161a23';
    div.style.color = '#f3f4f6';
    div.style.border = '2px solid #2b3548';
    div.style.borderRadius = '16px';
    div.style.padding = '20px';
    div.style.zIndex = '999999';
    div.style.fontFamily = 'sans-serif';
    div.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8)';

    div.innerHTML = `
        <h3 style="margin-top:0;margin-bottom:8px;font-size:1.2rem;color:#f3f4f6;">Xperience -> Wuplay Migrator</h3>
        <p style="font-size:0.85rem;color:#9ca3af;margin-bottom:15px;">Import collections directly inside your session.</p>
        
        <div style="margin-bottom:12px;">
            <label style="display:block;font-size:0.75rem;font-weight:bold;margin-bottom:4px;color:#9ca3af;">1. SELECT COLLECTION JSON</label>
            <input type="file" id="mig-col-file" accept=".json" style="width:100%;color:#fff;background:#090b0e;border:1px solid #2b3548;padding:6px;border-radius:6px;">
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block;font-size:0.75rem;font-weight:bold;margin-bottom:4px;color:#9ca3af;">2. SELECT MANIFEST JSON</label>
            <input type="file" id="mig-man-file" accept=".json" style="width:100%;color:#fff;background:#090b0e;border:1px solid #2b3548;padding:6px;border-radius:6px;">
        </div>

        <button id="mig-start-btn" style="width:100%;padding:12px;background:#4f46e5;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Start Import</button>
        
        <div id="mig-console" style="margin-top:15px;background:#090b0e;border:1px solid #2b3548;border-radius:8px;padding:10px;height:150px;overflow-y:auto;font-family:monospace;font-size:0.75rem;white-space:pre-wrap;color:#34d399;">Ready...</div>
        <button id="mig-close-btn" style="width:100%;margin-top:10px;padding:6px;background:transparent;color:#9ca3af;border:none;cursor:pointer;font-size:0.8rem;">Close</button>
    `;

    document.body.appendChild(div);

    const consoleEl = div.querySelector('#mig-console');
    const startBtn = div.querySelector('#mig-start-btn');
    const closeBtn = div.querySelector('#mig-close-btn');

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function printLog(msg, type='info') {
        const color = type === 'error' ? '#ef4444' : type === 'warn' ? '#fbbf24' : '#34d399';
        consoleEl.innerHTML += `<div style="color:${color}">${msg}</div>`;
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    // Dragging logic for PC/Mobile
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const dragStart = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        
        // Remove default centering transform to avoid math offset glitches
        div.style.transform = 'none';

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        const rect = div.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        
        startX = clientX - initialX;
        startY = clientY - initialY;
    };

    const drag = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const x = clientX - startX;
        const y = clientY - startY;

        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
    };

    const dragEnd = () => {
        isDragging = false;
    };

    // Attach drag events to the header section
    const header = div.querySelector('h3');
    header.style.cursor = 'move';
    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart, { passive: true });
    
    window.addEventListener('mousemove', drag);
    window.addEventListener('touchmove', drag, { passive: false });
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);

    closeBtn.onclick = () => {
        window.removeEventListener('mousemove', drag);
        window.removeEventListener('touchmove', drag);
        window.removeEventListener('mouseup', dragEnd);
        window.removeEventListener('touchend', dragEnd);
        div.remove();
    };


    startBtn.onclick = async () => {
        const colFile = div.querySelector('#mig-col-file').files[0];
        const manFile = div.querySelector('#mig-man-file').files[0];

        if (!colFile || !manFile) {
            alert("Please select both JSON files first.");
            return;
        }

        consoleEl.innerHTML = '';
        printLog("Reading files...");

        try {
            const collections = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(JSON.parse(e.target.result));
                r.onerror = reject;
                r.readAsText(colFile);
            });

            const manifest = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(JSON.parse(e.target.result));
                r.onerror = reject;
                r.readAsText(manFile);
            });

            printLog(`Files loaded. ${collections.length} collections parsed.`);

            const pathParts = window.location.pathname.split('/');
            const profileKey = pathParts[pathParts.length - 1] || 'yuif03';
            const baseUrl = `/configure/api/${profileKey}`;

            const catalogMap = {};
            (manifest.catalogs || []).forEach(cat => {
                catalogMap[`${cat.id}:${cat.type}`] = { name: cat.name || cat.id, extra: cat.extra || [] };
            });

            printLog("Fetching addon config...");
            const profileResp = await fetch(baseUrl);
            const profileData = await profileResp.json();
            const xperience = (profileData.addons || []).find(a => a.id.startsWith("app.xperience."));

            if (!xperience) throw new Error("Xperience addon not found in Wuplay!");

            const addonId = xperience.id;
            const transportUrl = xperience.url.replace('/manifest.json', '');

            const hubsResp = await fetch(`${baseUrl}/hubs`);
            const existingHubs = await hubsResp.json();

            for (const col of collections) {
                printLog(`Processing Hub: ${col.title}`);

                const dup = existingHubs.find(h => h.name.toLowerCase() === col.title.toLowerCase());
                if (dup) {
                    printLog(`  Replacing existing hub: ${col.title}`, 'warn');
                    await fetch(`${baseUrl}/hubs/${dup.id}`, { method: 'DELETE' });
                    await sleep(500);
                }

                const chResp = await fetch(`${baseUrl}/hubs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: col.title, detailViewType: "poster_rows", tileShape: "landscape" })
                });
                const hub = await chResp.json();
                printLog(`  Created Hub (ID: ${hub.id})`);
                await sleep(500);

                const hubItems = [];

                for (const folder of (col.folders || [])) {
                    printLog(`    Creating Section: ${folder.title}`);
                    const itemResp = await fetch(`${baseUrl}/hubs/${hub.id}/items`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: folder.title })
                    });
                    const item = await itemResp.json();
                    hubItems.push({ id: item.id, name: folder.title });
                    await sleep(500);

                    await fetch(`${baseUrl}/hubs/${hub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: hubItems.map(i => ({ slug: String(i.id), name: i.name })) })
                    });
                    await sleep(500);

                    await fetch(`${baseUrl}/hubs/${hub.id}/items/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: folder.title, showName: !folder.hideTitle })
                    });
                    await sleep(500);

                    if (folder.coverImageUrl) {
                        try {
                            const proxyUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(folder.coverImageUrl);
                            const imgResp = await fetch(proxyUrl);
                            const blob = await imgResp.blob();
                            const formData = new FormData();
                            formData.append('file', blob, 'cover.webp');
                            await fetch(`/configure/api/${profileKey}/hubs/${hub.id}/items/${item.id}/logo`, {
                                method: 'POST',
                                body: formData
                            });
                            printLog("      Logo uploaded successfully");
                        } catch (e) {
                            printLog("      WARNING: Logo upload failed (CORS)", "warn");
                        }
                        await sleep(500);
                    }

                    const seen = new Set();
                    const catalogsPayload = [];
                    (folder.catalogSources || []).forEach(source => {
                        const key = `${source.catalogId}:${source.type}`;
                        if (seen.has(key)) return;
                        seen.add(key);

                        const meta = catalogMap[key] || {};
                        catalogsPayload.push({
                            addonId,
                            catalogId: source.catalogId,
                            type: source.type,
                            name: meta.name || source.catalogId,
                            transportUrl,
                            addonName: "Xperience",
                            extra: meta.extra || [],
                            genres: null
                        });
                    });

                    if (catalogsPayload.length > 0) {
                        await fetch(`/configure/api/${profileKey}/layouts/${item.layoutId}/rows/addon-bulk`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ catalogs: catalogsPayload })
                        });
                        printLog(`      Added ${catalogsPayload.length} catalogs`);
                        await sleep(500);
                    }
                }
            }

            printLog("Migration successfully completed!", "success");

        } catch (err) {
            printLog("ERROR: " + err.message, "error");
        }
    };
})();
