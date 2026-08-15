(async function() {
    // 1. Create Modal UI overlay on the page
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '10%';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.width = '90%';
    div.style.maxWidth = '500px';
    div.style.backgroundColor = '#000000';
    div.style.color = '#ffffff';
    div.style.border = '2px solid #222222';
    div.style.borderRadius = '16px';
    div.style.padding = '20px';
    div.style.zIndex = '999999';
    div.style.fontFamily = 'sans-serif';
    div.style.boxShadow = '0 10px 40px rgba(0,0,0,0.9)';

    div.innerHTML = `
        <h3 style="margin-top:0;margin-bottom:8px;font-size:1.2rem;color:#ffffff;">Xperience → Wuplay v1.2</h3>
        <p style="font-size:0.85rem;color:#888888;margin-bottom:15px;">Make sure Xperience addon is installed in Wuplay.</p>
        
        <div style="margin-bottom:15px;">
            <label style="display:block;font-size:0.75rem;font-weight:bold;margin-bottom:4px;color:#888888;">SELECT COLLECTION JSON</label>
            <input type="file" id="mig-col-file" accept=".json" style="width:100%;color:#fff;background:#0d0d0d;border:1px solid #222222;padding:6px;border-radius:6px;">
        </div>

        <div style="margin-bottom:15px;display:none;">
            <input type="checkbox" id="mig-dev-mode" style="margin-right:8px;width:16px;height:16px;cursor:pointer;">
            <label for="mig-dev-mode" style="font-size:0.8rem;font-weight:bold;color:#888888;margin-bottom:0;cursor:pointer;text-transform:uppercase;">Dev Mode (Dry Run/Simulation)</label>
        </div>

        <button id="mig-start-btn" style="width:100%;padding:12px;background:#ffffff;color:black;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Start Import</button>
        
        <div id="mig-console" style="margin-top:15px;background:#0d0d0d;border:1px solid #222222;border-radius:8px;padding:10px;height:150px;overflow-y:auto;font-family:monospace;font-size:0.75rem;white-space:pre-wrap;color:#34d399;">Ready...</div>
        <button id="mig-close-btn" style="width:100%;margin-top:10px;padding:6px;background:transparent;color:#888888;border:none;cursor:pointer;font-size:0.8rem;">Close</button>
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
        const devMode = div.querySelector('#mig-dev-mode').checked;

        if (!colFile) {
            alert("Please select your Collection JSON file first.");
            return;
        }

        consoleEl.innerHTML = '';
        if (devMode) {
            printLog("[DEV MODE] Running in Simulation/Dry Run Mode...", "warn");
        }
        printLog("Reading collection file...");

        try {
            let collections = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(JSON.parse(e.target.result));
                r.onerror = reject;
                r.readAsText(colFile);
            });

            // Auto-extract array if wrapped inside object, or throw error
            if (collections && !Array.isArray(collections) && Array.isArray(collections.collections)) {
                collections = collections.collections;
            }
            if (!Array.isArray(collections)) {
                throw new Error("Invalid Collection JSON. Make sure you chose the collections file first.");
            }

            const pathParts = window.location.pathname.split('/');
            const profileKey = pathParts[pathParts.length - 1] || 'your_profile_key';
            const baseUrl = `/configure/api/${profileKey}`;

            // Mock fetch operations if Dev Mode is checked
            const originalFetch = window.fetch;
            if (devMode) {
                window.fetch = async (url, options) => {
                    const method = (options && options.method) || 'GET';
                    
                    // Simulate responses
                    if (url.includes(baseUrl)) {
                        // Check if it's hubs list vs root profile config
                        if (url.endsWith('/hubs')) {
                            if (method === 'POST') {
                                const body = JSON.parse(options.body);
                                return { ok: true, json: async () => ({ id: Math.floor(Math.random() * 100000), name: body.name }) };
                            }
                            return { 
                                ok: true, 
                                json: async () => [{ 
                                    id: 9999, 
                                    name: "Streaming", 
                                    items: [
                                        { name: "Netflix" },
                                        { name: "Crunchyroll" }
                                    ]
                                }] 
                            };
                        }
                        
                        // Otherwise it's profile config
                        return {
                            ok: true,
                            json: async () => ({ addons: [{ id: "app.xperience.mock", url: "https://mock/manifest.json" }] })
                        };
                    }
                    if (url.includes('/items')) {
                        if (method === 'POST') {
                            const body = JSON.parse(options.body);
                            return { ok: true, json: async () => ({ id: Math.floor(Math.random() * 100000), name: body.name, layoutId: Math.floor(Math.random() * 100000) }) };
                        }
                    }
                    if (url.includes('manifest.json')) {
                        return {
                            ok: true,
                            json: async () => ({ catalogs: [] })
                        };
                    }
                    // Default ok response
                    return { ok: true, json: async () => ({}) };
                };
            }

            printLog("Fetching addon config...");
            const profileResp = await fetch(baseUrl);
            const profileData = await profileResp.json();
            const xperience = (profileData.addons || []).find(a => a.id.startsWith("app.xperience."));

            if (!xperience) throw new Error("Xperience addon not found in Wuplay!");

            const addonId = xperience.id;
            const transportUrl = xperience.url.replace('/manifest.json', '');

            // Fetch manifest automatically from the installed addon URL
            printLog("Fetching addon manifest automatically...");
            const manifestResp = await fetch(xperience.url);
            if (!manifestResp.ok) throw new Error("Failed to fetch addon manifest from " + xperience.url);
            const manifest = await manifestResp.json();

            const catalogMap = {};
            (manifest.catalogs || []).forEach(cat => {
                catalogMap[`${cat.id}:${cat.type}`] = { name: cat.name || cat.id, extra: cat.extra || [] };
            });

            printLog(`Addon manifest loaded. ${collections.length} collections parsed.`);

            const hubsResp = await fetch(`${baseUrl}/hubs`);
            const existingHubs = await hubsResp.json();

            for (const col of collections) {
                let colTitle = col.title;
                let dup = existingHubs.find(h => h.name.toLowerCase() === colTitle.toLowerCase());

                // Check if duplicate is a built-in/system hub (typically non-numeric string IDs)
                if (dup && isNaN(Number(dup.id))) {
                    printLog(`  System hub clash detected for "${colTitle}". Renaming to avoid conflict...`, 'warn');
                    const systemClashes = {
                        'genres': 'Explore Genres',
                        'decades': 'Explore Decades',
                        'studios': 'Film Studios',
                        'streaming services': 'Streaming',
                        'movie collections': 'Cinematic Universes'
                    };
                    const lowerTitle = colTitle.toLowerCase();
                    if (systemClashes[lowerTitle]) {
                        colTitle = systemClashes[lowerTitle];
                    } else {
                        colTitle = `${colTitle} Custom`;
                    }
                    // Re-check for duplicates under the new name
                    dup = existingHubs.find(h => h.name.toLowerCase() === colTitle.toLowerCase());
                }

                printLog(`Processing Hub: ${colTitle}`);

                let hubId = null;
                let existingSections = new Set();
                let hubItems = [];

                if (dup) {
                    const confirmUpdate = confirm(`Hub "${colTitle}" already exists.\n\nWould you like to UPDATE it (add missing sections)?\n\nOK = Update/Merge\nCancel = Choose other options`);
                    if (confirmUpdate) {
                        printLog(`  Updating existing hub: ${colTitle} (adding missing sections)...`);
                        hubId = dup.id;
                        
                        // Parse existing items (sections)
                        const sections = dup.customItems || dup.items || [];
                        sections.forEach(s => {
                            if (s.name) {
                                existingSections.add(s.name.toLowerCase());
                                // Keep track of existing items so we can update the list order
                                hubItems.push({ id: s.slug || s.id, name: s.name });
                            }
                        });
                    } else {
                        const confirmReplace = confirm(`Would you like to completely REPLACE "${colTitle}"?\n\nOK = Delete and Recreate\nCancel = Skip`);
                        if (confirmReplace) {
                            printLog(`  Replacing existing hub: ${colTitle}`, 'warn');
                            await fetch(`${baseUrl}/hubs/${dup.id}`, { method: 'DELETE' });
                            await sleep(500);
                        } else {
                            printLog(`  Skipped existing hub: ${colTitle}`, 'warn');
                            continue;
                        }
                    }
                }

                if (!hubId) {
                    const chResp = await fetch(`${baseUrl}/hubs`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: colTitle, detailViewType: "poster_rows", tileShape: "landscape" })
                    });
                    const hub = await chResp.json();
                    hubId = hub.id;
                    printLog(`  Created Hub (ID: ${hubId})`);
                    await sleep(500);
                }

                for (const folder of (col.folders || [])) {
                    // Skip if section already exists (Update mode)
                    if (existingSections.has(folder.title.toLowerCase())) {
                        printLog(`    Section: ${folder.title} -- already exists, skipping`);
                        continue;
                    }

                    printLog(`    Creating Section: ${folder.title}`);
                    const itemResp = await fetch(`${baseUrl}/hubs/${hubId}/items`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: folder.title })
                    });
                    const item = await itemResp.json();
                    hubItems.push({ id: item.id, name: folder.title });
                    await sleep(500);

                    await fetch(`${baseUrl}/hubs/${hubId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: hubItems.map(i => ({ slug: String(i.id), name: i.name })) })
                    });
                    await sleep(500);

                    await fetch(`${baseUrl}/hubs/${hubId}/items/${item.id}`, {
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
                            await fetch(`/configure/api/${profileKey}/hubs/${hubId}/items/${item.id}/logo`, {
                                method: 'POST',
                                body: formData
                            });
                            printLog("      Logo uploaded successfully");
                        } catch (e) {
                            printLog("      WARNING: Logo upload failed (CORS)", "warn");
                        }
                        await sleep(500);
                    }

                    if (!item.layoutId && item.layout && item.layout.id) {
                        item.layoutId = item.layout.id;
                    }
                    if (!item.layoutId && item.layout_id) {
                        item.layoutId = item.layout_id;
                    }
                    if (!item.layoutId) {
                        printLog(`    Checking hub details for layout ID...`);
                        try {
                            const hubDetailsResp = await fetch(`${baseUrl}/hubs/${hubId}`);
                            if (!hubDetailsResp.ok) {
                                throw new Error(`HTTP status ${hubDetailsResp.status}`);
                            }
                            const hubDetails = await hubDetailsResp.json();
                            const items = hubDetails.customItems || hubDetails.items || [];
                            const matchedItem = items.find(i => String(i.id) === String(item.id) || String(i.slug) === String(item.id) || (i.name && i.name.toLowerCase() === folder.title.toLowerCase()));
                            
                            if (matchedItem) {
                                if (matchedItem.layoutId) {
                                    item.layoutId = matchedItem.layoutId;
                                } else if (matchedItem.layout) {
                                    item.layoutId = typeof matchedItem.layout === 'object' ? matchedItem.layout.id : matchedItem.layout;
                                } else if (matchedItem.layout_id) {
                                    item.layoutId = matchedItem.layout_id;
                                }
                            } else {
                                printLog(`      Debug: No section match found in hub details for ID ${item.id}. Available: ${items.map(i => i.name + '(' + (i.id || i.slug) + ')').join(', ')}`, 'warn');
                            }
                        } catch (e) {
                            printLog(`    Warning: Failed to fetch hub details: ${e.message}`, 'warn');
                        }
                    }

                    const seen = new Set();
                    const catalogsPayload = [];
                    (folder.catalogSources || []).forEach(source => {
                        const key = `${source.catalogId}:${source.type}`;
                        if (seen.has(key)) return;
                        seen.add(key);

                        const meta = catalogMap[key] || {};
                        const extraPayload = [];
                        if (meta.extra && Array.isArray(meta.extra)) {
                            meta.extra.forEach(ex => {
                                const val = source[ex.name] !== undefined ? source[ex.name] : (ex.isRequired && ex.options ? ex.options[0] : null);
                                if (val !== null && val !== undefined) {
                                    extraPayload.push({ name: ex.name, value: String(val) });
                                }
                            });
                        }

                        catalogsPayload.push({
                            addonId,
                            catalogId: source.catalogId,
                            type: source.type,
                            name: meta.name || source.catalogId,
                            transportUrl,
                            addonName: "Xperience",
                            extra: extraPayload,
                            genres: null
                        });
                    });

                    if (catalogsPayload.length > 0) {
                        if (!item.layoutId) {
                            printLog(`      ERROR: Cannot add catalogs, layoutId is undefined for section: ${folder.title}`, 'error');
                            continue;
                        }
                        const bulkResp = await fetch(`/configure/api/${profileKey}/layouts/${item.layoutId}/rows/addon-bulk`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ catalogs: catalogsPayload })
                        });
                        if (bulkResp.ok) {
                            printLog(`      Added ${catalogsPayload.length} catalogs`);
                        } else {
                            const errText = await bulkResp.text();
                            printLog(`      Failed to add catalogs: ${errText}`, 'error');
                        }
                        await sleep(500);
                    }
                }
            }

            printLog("Migration successfully completed!", "success");

        } catch (err) {
            printLog("ERROR: " + err.message, "error");
        } finally {
            if (devMode) {
                window.fetch = originalFetch;
            }
        }
    };
})();
