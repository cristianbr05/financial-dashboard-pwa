// ==========================================
// CONFIGURACIÓN INICIAL Y PWA
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => console.warn('Service Worker no registrado.'));
    });
}

let monthlyBudget = 1000;
try { const m = localStorage.getItem('monthlyBudget'); if(m && !isNaN(m)) monthlyBudget = parseFloat(m); } catch(e){}

let allTransactions = [], filteredTransactions = [], currentlyDisplayedTableData = [], chartInstances = {}, currentFileName = "";
let editingRules = [], selectedStartDate = null, selectedEndDate = null, currentCalDate = new Date(), hoverDate = null, calendarViewMode = 'month';
window.currentOtrosCategories = [];

// ==========================================
// UTILIDADES DE FORMATO
// ==========================================
function formatCur(val) {
    if(isNaN(val) || val === null || val === undefined) return '0,00 €';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
function formatComp(val) {
    if(isNaN(val) || val === null || val === undefined) return '0';
    if(Math.abs(val) >= 1000) return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(val / 1000) + 'k';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(val);
}

const defaultCategoryRules = [
    { keywords: ['AMZN', 'AMAZON', 'AMZ', 'PAYPAL', 'PAYPAL *', 'PAYPAL*', 'ALIEXPRESS', 'MIRAVIA', 'SHEIN', 'ZALANDO'], category: 'Compras Online', color: '#3b82f6', emoji: '🛍️' },
    { keywords: ['MERCADONA', 'MERCAT', 'LIDL', 'ALDI', 'CARREFOUR', 'DIA ', 'ALCAMPO', 'CONSUM', 'EROSKI'], category: 'Supermercado', color: '#10b981', emoji: '🛒' },
    { keywords: ['UBER EATS', 'UBEREATS', 'UBER*EATS', 'GLOVO', 'JUST EAT', 'DELIVEROO'], category: 'Delivery', color: '#f97316', emoji: '🍔' },
    { keywords: ['APPLE.COM', 'APPLE STORE', 'ITUNES', 'MAC STORE', 'PCCOMPONENTES', 'MEDIAMARKT'], category: 'Tecnología', color: '#64748b', emoji: '💻' },
    { keywords: ['GOOGLE*', 'GOOGLE PLAY', 'YOUTUBE', 'NETFLIX', 'NETFLIX.COM', 'SPOTIFY', 'SPOTIFY AB', 'HBO', 'DISNEY', 'PRIME VIDEO', 'APPLE', 'ICLOUD'], category: 'Suscripciones', color: '#ec4899', emoji: '📺' },
    { keywords: ['BIZUM', 'TRANSFERENCIA ENVIADA'], category: 'Transferencias', color: '#8b5cf6', emoji: '💸' },
    { keywords: ['REPSOL', 'BP ', 'CEPSA', 'GALP', 'SHELL', 'GASOLINERA', 'PETRONOR'], category: 'Gasolinera', color: '#eab308', emoji: '🚗' },
    { keywords: ['ZARA', 'H&M', 'MANGO', 'PULL&BEAR', 'BERSHKA', 'STRADIVARIUS', 'PRIMARK', 'ASOS', 'UNIQLO'], category: 'Ropa', color: '#06b6d4', emoji: '👕' },
    { keywords: ['CORREOS', 'SEUR', 'MRW', 'GLS ', 'DHL', 'UPS '], category: 'Paquetería', color: '#d946ef', emoji: '📦' },
    { keywords: ['CLINICA', 'FARMACIA', 'FCIA ', 'DENTISTA', 'OPTICA', 'MEDICO', 'SANITAS', 'ADESLAS', 'SEGURO MEDICO'], category: 'Salud', color: '#ef4444', emoji: '💊' },
    { keywords: ['BAR ', 'CAFE ', 'CAFETERIA', 'RESTAURANTE', 'MCDONALDS', 'BURGER KING', 'KFC', 'DOMINOS', 'TELEPIZZA', 'PIZZA', 'BURGER'], category: 'Restauración', color: '#f59e0b', emoji: '🍽️' },
    { keywords: ['RENFE', 'ALSA', 'BLABLACAR', 'EMT ', 'METRO ', 'CABIFY', 'UBER ', 'PARKING'], category: 'Transporte', color: '#14b8a6', emoji: '🚆' },
    { keywords: ['GYM', 'GIMNASIO', 'DECATHLON', 'FITNESS', 'NIKE', 'ADIDAS'], category: 'Deporte', color: '#84cc16', emoji: '🏋️' },
    { keywords: ['STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'EPIC GAMES', 'BLIZZARD', 'GAME'], category: 'Gaming', color: '#6366f1', emoji: '🎮' },
    { keywords: ['IKEA', 'LEROY MERLIN', 'BRICODEPOT', 'LEROY', 'ALQUILER', 'HIPOTECA', 'COMUNIDAD'], category: 'Hogar', color: '#a855f7', emoji: '🏠' },
    { keywords: ['MOVISTAR', 'VODAFONE', 'ORANGE', 'DIGI', 'YOIGO', 'IBERDROLA', 'ENDESA', 'NATURGY', 'AGUA ', 'JAZZTEL', 'MASMOVIL'], category: 'Facturas Hogar / Tlf', color: '#0d9488', emoji: '📱' },
    { keywords: ['CAJERO', 'RETIRADA EFECTIVO'], category: 'Retirada Cajero', color: '#78716c', emoji: '🏧' },
    { keywords: ['ACADEMIA', 'UNIVERSIDAD', 'CURSO', 'LIBRO'], category: 'Educación', color: '#f43f5e', emoji: '🎓' },
    { keywords: ['HOTEL', 'VUELO', 'AIRBNB', 'BOOKING', 'RENTALCARS', 'RYANAIR', 'IBERIA', 'VUELING'], category: 'Viajes', color: '#0ea5e9', emoji: '✈️' },
    { keywords: ['VETERINARIO', 'TIENDA ANIMALES', 'PIENSO', 'KIWOKO', 'TIENDANIMAL'], category: 'Mascotas', color: '#d97706', emoji: '🐾' }
];

let categoryRules = [];
try { const stored = localStorage.getItem('customCategoryRules'); categoryRules = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(defaultCategoryRules)); } 
catch(e) { categoryRules = JSON.parse(JSON.stringify(defaultCategoryRules)); }
const defaultCategoryColor = '#9ca3af', drilldownPalette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6', '#eab308', '#6366f1'];

// ==========================================
// BASE DE DATOS LOCAL (IndexedDB)
// ==========================================
const DB_NAME = 'FinDashboardDB'; const STORE_NAME = 'bank_files'; let localDB = null;   
function initLocalDB() { return new Promise((res, rej) => { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains(STORE_NAME)) e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); }; req.onsuccess = e => { localDB = e.target.result; res(); }; req.onerror = e => rej(e.target.error); req.onblocked = e => { window.showToast("Cierra otras pestañas para actualizar la BD.", "warning"); }; }); }
async function saveToLocalDB(id, fileName, dataJson) { return new Promise((res, rej) => { const tx = localDB.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put({ id, fileName, uploadDate: new Date().toISOString(), data: dataJson }); tx.oncomplete = res; tx.onerror = rej; }); }
async function getLocalDBFiles() { return new Promise((res, rej) => { const tx = localDB.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function deleteLocalDBFile(id) { return new Promise((res, rej) => { const tx = localDB.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(id); tx.oncomplete = res; tx.onerror = rej; }); }

let savedFiles = [];

async function initStorage() {
    const badge = document.getElementById('storageStatusBadge');
    if(badge) badge.classList.remove('hidden'); 
    try { await initLocalDB(); refreshLocalVault(); } catch (e) { console.error(e); }
}
initStorage();

async function saveFileToStorage(jsonData, forceFilename = null) {
    const newDocId = 'file_' + Date.now(); const fName = forceFilename || currentFileName;
    await saveToLocalDB(newDocId, fName, jsonData); refreshLocalVault();
}

async function deleteFileFromStorage(id, silent = false) {
    if (localDB) { await deleteLocalDBFile(id); if (!silent) refreshLocalVault(); }
    if (!silent) window.showToast("Archivo eliminado del almacén.", "success");
}

async function refreshLocalVault() { if (!localDB) return; savedFiles = await getLocalDBFiles(); savedFiles.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)); renderVaultList(); }

function renderVaultList() {
    const list = document.getElementById('vaultList');
    if (!list) return;
    if (!savedFiles.length) { list.innerHTML = `<li class="p-10 text-center text-gray-500 italic">Almacén vacío. Arrastra un archivo para guardarlo aquí.</li>`; return; }
    list.innerHTML = savedFiles.map(f => {
        const dateObj = new Date(f.uploadDate); let txCount = 0; try { txCount = JSON.parse(f.data).length; } catch(e){}
        return `<li class="p-5 hover:bg-blue-50/50 dark:hover:bg-gray-700/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors border-b border-gray-100 dark:border-gray-700/50"><div class="flex items-center"><div class="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 mr-5 flex justify-center items-center shadow-sm"><i class="fa-solid fa-file-excel text-xl"></i></div><div><h4 class="font-bold text-gray-800 dark:text-white text-lg">${f.fileName}</h4><p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5"><i class="fa-regular fa-calendar-plus mr-1"></i> ${dateObj.toLocaleDateString()} a las ${dateObj.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})} <span class="mx-2">•</span> <span class="font-semibold text-gray-600 dark:text-gray-300">${txCount} registros</span></p></div></div><div class="flex gap-3 w-full sm:w-auto"><button class="load-file-btn px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl text-sm shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center flex-1" data-id="${f.id}"><i class="fa-solid fa-folder-open mr-2"></i> Cargar</button><button class="delete-file-btn px-4 py-2.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/50 font-bold rounded-xl text-sm transition-colors flex items-center justify-center" data-id="${f.id}" title="Eliminar archivo"><i class="fa-solid fa-trash-can pointer-events-none"></i></button></div></li>`;
    }).join('');
}

// ==========================================
// PARSEO SEGURO DE ARCHIVOS
// ==========================================
function parseBankDate(val) {
    if (val instanceof Date) return val; let s = String(val).replace(/["']/g, '').trim().split(' ')[0];
    if (s.includes('/')) { let p = s.split('/'); if (p[2] && p[2].length === 4) return new Date(p[2], parseInt(p[1]) - 1, p[0]); if (p[0] && p[0].length === 4) return new Date(p[0], parseInt(p[1]) - 1, p[2]); }
    if (s.includes('-')) { let p = s.split('-'); if (p[2] && p[2].length === 4) return new Date(p[2], parseInt(p[1]) - 1, p[0]); }
    return new Date(s);
}

function extractDataFromRaw(data, fileName) {
    let headerRowIndex = -1, dateColIndex = -1, descColIndex = -1, amountColIndex = -1, extractedData = [];
    
    for (let i = 0; i < Math.min(50, data.length) && headerRowIndex === -1; i++) {
        if (!Array.isArray(data[i])) continue;
        const rStr = data[i].map(c => String(c).toLowerCase());
        const dIdx = rStr.findIndex(c => c.match(/fecha|f\.?\s*valor|operación/)), aIdx = rStr.findIndex(c => c.match(/importe|cantidad/)), cIdx = rStr.findIndex(c => c.match(/concepto|movimiento|detalle|observaciones/));
        if (dIdx !== -1 && aIdx !== -1) { headerRowIndex = i; dateColIndex = dIdx; amountColIndex = aIdx; descColIndex = (cIdx !== -1) ? cIdx : (dIdx + 1); }
    }
    if (headerRowIndex === -1) {
        for (let i = 0; i < Math.min(50, data.length) && headerRowIndex === -1; i++) {
            const row = data[i];
            if (Array.isArray(row) && row.length >= 3) {
                const isDate = c => c instanceof Date || (typeof c === 'string' && (/^\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(c) || /^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(c))), isMoney = c => typeof c === 'number' || (typeof c === 'string' && /^-?\d+[.,]\d{2}$/.test(c));
                if (row.some(isDate) && row.some(isMoney)) { headerRowIndex = i - 1; dateColIndex = row.findIndex(isDate); amountColIndex = row.findIndex(isMoney); descColIndex = (dateColIndex + 1 !== amountColIndex) ? dateColIndex + 1 : dateColIndex + 2; }
            }
        }
    }
    if (headerRowIndex === -1) return { error: "Columnas no detectadas" };

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i]; if (!row || row[dateColIndex] === undefined || row[amountColIndex] === undefined) continue;
        let dateRaw = row[dateColIndex], descStr = String(row[descColIndex] || "").toUpperCase().trim().replace(/\s+/g, ' '), amountRaw = row[amountColIndex];
        if (descStr === 'TARJETA' || descStr === '') continue;
        let dateObj = parseBankDate(dateRaw); if (!dateObj || isNaN(dateObj.getTime()) || dateObj.getFullYear() < 2000) continue;
        let cleanAmountStr = String(amountRaw).replace(/[\s\xA0]/g, '').replace(/[^0-9,.\-]/g, ''), amount = typeof amountRaw === 'number' ? amountRaw : parseFloat((as => as.includes(',') && (!as.includes('.') || as.indexOf(',') > as.lastIndexOf('.')) ? as.replace(/\./g, '').replace(',', '.') : as)(cleanAmountStr));
        if (isNaN(amount) || amount >= -0.01) continue; 
        extractedData.push({ d: dateObj.getTime(), c: descStr, a: Math.abs(amount) });
    }
    return extractedData;
}

function processAndMergeFiles(files) {
    if (!files.length) return; showLoader("Fusionando con datos actuales...");
    const filePromises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['csv', 'xlsx', 'xls'].includes(ext)) { resolve({ error: `Extensión no admitida` }); return; }
            if (['xlsx', 'xls'].includes(ext)) {
                const reader = new FileReader();
                reader.onload = e => { try { resolve(extractDataFromRaw(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(e.target.result), {type: 'array', cellDates: true}).Sheets[XLSX.read(new Uint8Array(e.target.result), {type: 'array', cellDates: true}).SheetNames[0]], {header: 1, defval: ""}), file.name)); } catch (err) { resolve({ error: `Error leyendo` }); } };
                reader.readAsArrayBuffer(file);
            } else if (ext === 'csv') {
                const reader = new FileReader(); reader.onload = e => Papa.parse(e.target.result, { header: false, skipEmptyLines: 'greedy', complete: res => resolve(extractDataFromRaw(res.data, file.name)) }); reader.readAsText(file, 'ISO-8859-1');
            }
        });
    });

    Promise.all(filePromises).then(async results => {
        const validDataArrays = results.filter(r => Array.isArray(r)); 
        if (!validDataArrays.length) { 
            hideLoader(); 
            const errorModal = document.getElementById('errorModal');
            if(errorModal) openModal(errorModal);
            return; 
        }

        const newRawData = validDataArrays.flat(), existingRawData = allTransactions.map(tx => ({d: tx.timestamp, c: tx.description, a: tx.amount}));
        const seenKeys = new Set(existingRawData.map(tx => `${tx.d}_${tx.a.toFixed(2)}_${tx.c}`)), combinedRawData = [...existingRawData];
        let addedCount = 0, ignoredCount = 0;
        newRawData.forEach(tx => { const key = `${tx.d}_${tx.a.toFixed(2)}_${tx.c}`; if (!seenKeys.has(key)) { seenKeys.add(key); combinedRawData.push(tx); addedCount++; } else { ignoredCount++; } });

        if (addedCount > 0) {
            currentFileName = "Dataset Combinado"; document.getElementById('globalLoaderText').innerText = "Guardando en almacén...";
            await saveFileToStorage(JSON.stringify(combinedRawData), `Dataset_${new Date().toISOString().slice(0,10)}`);
            hideLoader(); buildDashboardModel(combinedRawData); window.showToast(`¡Fusión exitosa! ${addedCount} añadidas. (${ignoredCount} duplicados).`, "success");
        } else { hideLoader(); window.showToast(`No hay datos nuevos. Se ignoraron ${ignoredCount} duplicados.`, "info"); }
    });
}
function handleFiles(files) { processAndMergeFiles(files); }

// ==========================================
// GENERADOR DE DATOS DE PRUEBA (MOCK DATA)
// ==========================================
function loadMockData() {
    showLoader("Generando datos de prueba...");
    const mockData = [];
    const dummyMerchants = [
        { c: 'MERCADONA', min: 15, max: 90 },
        { c: 'AMAZON EU', min: 9, max: 60 },
        { c: 'NETFLIX.COM', min: 12.99, max: 12.99 },
        { c: 'RESTAURANTE EL PINO', min: 25, max: 55 },
        { c: 'REPSOL', min: 40, max: 70 },
        { c: 'ZARA ESPAÑA', min: 20, max: 120 },
        { c: 'FARMACIA CENTRAL', min: 5, max: 25 },
        { c: 'UBER EATS', min: 12, max: 35 },
        { c: 'GIMNASIO MC FIT', min: 29.90, max: 29.90 },
        { c: 'IBERDROLA', min: 50, max: 90 }
    ];

    const today = new Date();
    for (let i = 0; i < 120; i++) {
        const randomDaysAgo = Math.floor(Math.random() * 120);
        const txDate = new Date(today.getTime() - (randomDaysAgo * 24 * 60 * 60 * 1000));
        const merchant = dummyMerchants[Math.floor(Math.random() * dummyMerchants.length)];
        const amount = merchant.min + (Math.random() * (merchant.max - merchant.min));
        
        mockData.push({
            d: txDate.getTime(),
            c: merchant.c + ' ' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
            a: parseFloat(amount.toFixed(2))
        });
    }

    setTimeout(async () => {
        currentFileName = "Datos_Prueba.csv";
        await saveFileToStorage(JSON.stringify(mockData), "Datos_de_Prueba");
        hideLoader();
        buildDashboardModel(mockData);
        window.showToast("Datos de prueba inyectados correctamente.", "success");
    }, 800);
}

// ==========================================
// CORE DASHBOARD (Lógica Visual)
// ==========================================
function buildDashboardModel(rawData) {
    allTransactions = [];
    rawData.forEach(item => {
        const dateObj = new Date(item.d);
        allTransactions.push({ timestamp: item.d, dateObj, dateFormatted: dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }), year: dateObj.getFullYear(), sortKey: dateObj.getFullYear() * 100 + (dateObj.getMonth() + 1), monthYearLabel: new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(dateObj), description: item.c, amount: item.a });
    });
    allTransactions.sort((a, b) => b.timestamp - a.timestamp);
    applyCategorization(allTransactions, categoryRules);

    const dZone = document.getElementById('dropZoneContainer'), dBoard = document.getElementById('dashboard'), upBtn = document.getElementById('updateDataBtn'), yFilt = document.getElementById('yearFilter'), cFilt = document.getElementById('categoryFilter'), drDisp = document.getElementById('dateRangeDisplay');
    if(dZone) dZone.classList.add('hidden'); 
    if(dBoard) dBoard.classList.remove('hidden'); 
    if(upBtn) upBtn.classList.remove('hidden');
    
    if(yFilt) {
        yFilt.innerHTML = '<option value="all">Todos los años históricos</option>' + [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a).map(y => `<option value="${y}">Año ${y}</option>`).join('');
        const savedYear = localStorage.getItem('filterYear'); if(savedYear && [...yFilt.options].some(o => o.value === savedYear)) yFilt.value = savedYear;
    }
    if(cFilt) {
        const currentCatFilter = cFilt.value; const cats = [...new Set(allTransactions.map(t => t.category))].sort();
        cFilt.innerHTML = '<option value="all">Todas las categorías</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        const savedCat = localStorage.getItem('filterCat') || currentCatFilter; if(savedCat && [...cFilt.options].some(o => o.value === savedCat)) cFilt.value = savedCat;
    }

    if(drDisp && allTransactions.length > 0) {
        const minD = new Date(Math.min(...allTransactions.map(t => t.timestamp))), maxD = new Date(Math.max(...allTransactions.map(t => t.timestamp)));
        drDisp.innerHTML = `<i class="fa-regular fa-calendar-days mr-2 text-blue-500"></i><b class="mr-2">Datos:</b> <span class="text-blue-800 dark:text-blue-200 font-extrabold tracking-tight">${minD.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'})} &mdash; ${maxD.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'})}</span>`;
        drDisp.classList.remove('hidden'); 
    }
    const tSearch = document.getElementById('tableSearch'), clearBtn = document.getElementById('clearSearchBtn');
    if(tSearch) tSearch.value = ''; if(clearBtn) clearBtn.classList.add('hidden');
    selectedStartDate = null; selectedEndDate = null; updateCalendarUI(); updateDashboard();
}

function updateDashboard() {
    const yFilt = document.getElementById('yearFilter'), cFilt = document.getElementById('categoryFilter');
    const sy = yFilt ? yFilt.value : 'all', sc = cFilt ? cFilt.value : 'all';
    localStorage.setItem('filterYear', sy); localStorage.setItem('filterCat', sc);

    let currMinTime = Infinity, currMaxTime = -Infinity;
    const startLimit = selectedStartDate ? selectedStartDate.getTime() : null;
    const endLimit = selectedEndDate ? selectedEndDate.getTime() + 86399999 : (startLimit ? startLimit + 86399999 : null);

    filteredTransactions = allTransactions.filter(t => {
        const passYear = sy === 'all' || t.year.toString() === sy, passCat = sc === 'all' || t.category === sc; let passDate = true;
        if (startLimit && endLimit) passDate = t.timestamp >= startLimit && t.timestamp <= endLimit;
        if (passYear && passCat && passDate) { if (t.timestamp < currMinTime) currMinTime = t.timestamp; if (t.timestamp > currMaxTime) currMaxTime = t.timestamp; return true; } return false;
    });
    
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0), txCount = filteredTransactions.length;
    animateValue(document.getElementById('kpiTotal'), totalAmount, true);
    animateValue(document.getElementById('kpiTxCount'), txCount, false);

    let currentDays = 1;
    if (startLimit) { currentDays = Math.max(1, (endLimit - startLimit) / (1000*60*60*24)); } 
    else if (filteredTransactions.length > 1 && currMaxTime !== -Infinity) { currentDays = Math.max(1, (currMaxTime - currMinTime) / (1000*60*60*24)); }
    const dailyAvg = txCount > 0 ? totalAmount / currentDays : 0;
    animateValue(document.getElementById('kpiAvg'), dailyAvg, true);

    let prevTotal = 0, prevTxCount = 0, prevDailyAvg = 0, hasPrevData = false;
    if (sy !== 'all' && !startLimit) {
        const prevYear = parseInt(sy) - 1, prevTxs = allTransactions.filter(t => t.year === prevYear && (sc === 'all' || t.category === sc));
        if (prevTxs.length > 0) {
            hasPrevData = true; prevTxCount = prevTxs.length; prevTotal = prevTxs.reduce((s, t) => s + t.amount, 0);
            const pMin = Math.min(...prevTxs.map(t=>t.timestamp)), pMax = Math.max(...prevTxs.map(t=>t.timestamp));
            prevDailyAvg = prevTotal / Math.max(1, (pMax - pMin)/(1000*60*60*24));
        }
    } else if (startLimit) {
        const duration = endLimit - startLimit, prevTxs = allTransactions.filter(t => t.timestamp >= (startLimit - duration) && t.timestamp < startLimit && (sc === 'all' || t.category === sc) && (sy === 'all' || t.year.toString() === sy));
        if (prevTxs.length > 0) { hasPrevData = true; prevTxCount = prevTxs.length; prevTotal = prevTxs.reduce((s, t) => s + t.amount, 0); prevDailyAvg = prevTotal / (duration / (1000*60*60*24)); }
    }

    function updateCompUI(elId, curr, prev, invertColors = false) {
        const el = document.getElementById(elId); if(!el) return;
        if (hasPrevData && prev > 0) {
            const pct = ((curr - prev) / prev) * 100; const isLess = pct < 0;
            const icon = isLess ? '<i class="fa-solid fa-arrow-down mr-1"></i>' : '<i class="fa-solid fa-arrow-up mr-1"></i>';
            let colorClass = isLess ? 'text-green-500' : 'text-red-500'; if (invertColors) colorClass = isLess ? 'text-red-500' : 'text-green-500';
            el.innerHTML = `<span class="${colorClass} mr-2">${icon}${Math.abs(pct).toFixed(1)}%</span> <span class="text-gray-400 font-medium">vs prev.</span>`;
        } else el.innerHTML = `<span class="text-gray-400 font-medium italic">Sin prev.</span>`;
    }
    updateCompUI('kpiTotalComp', totalAmount, prevTotal); updateCompUI('kpiAvgComp', dailyAvg, prevDailyAvg); updateCompUI('kpiTxComp', txCount, prevTxCount); 

    let recentMonthTotal = 0;
    const bLabel = document.getElementById('budgetMonthLabel');
    if (filteredTransactions.length > 0) { const mostRecentSortKey = filteredTransactions[0].sortKey; recentMonthTotal = filteredTransactions.filter(t => t.sortKey === mostRecentSortKey).reduce((s, t) => s + t.amount, 0); if(bLabel) bLabel.innerText = filteredTransactions[0].monthYearLabel; } 
    else { if(bLabel) bLabel.innerText = "Mes"; }
    const bLimit = document.getElementById('budgetLimitDisplay'); if(bLimit) bLimit.innerText = formatComp(monthlyBudget) + ' €';
    animateValue(document.getElementById('budgetSpent'), recentMonthTotal, true);
    let pct = (recentMonthTotal / monthlyBudget) * 100; if(isNaN(pct) || !isFinite(pct)) pct = 0;
    const bProg = document.getElementById('budgetProgress'), bCard = document.getElementById('budgetCard');
    if(bProg) { bProg.style.width = Math.min(pct, 100) + '%'; if (pct >= 90) { bProg.classList.replace('bg-emerald-500', 'bg-red-500'); if(bCard) bCard.classList.replace('border-emerald-500', 'border-red-500'); } else { bProg.classList.replace('bg-red-500', 'bg-emerald-500'); if(bCard) bCard.classList.replace('border-red-500', 'border-emerald-500'); } }

    updateCharts(); updateTopComercios(); updateTableOnly();
}

function updateCharts() {
    const barCtx = document.getElementById('barChart')?.getContext('2d'), dCtx = document.getElementById('doughnutChart')?.getContext('2d');
    if(!barCtx || !dCtx) return;
    
    // --- GRÁFICO DE BARRAS (Evolución) ---
    const monthlyMap = new Map(); filteredTransactions.forEach(t => { if(!monthlyMap.has(t.sortKey)) monthlyMap.set(t.sortKey, { label: t.monthYearLabel, amount: 0 }); monthlyMap.get(t.sortKey).amount += t.amount; });
    const sData = Array.from(monthlyMap.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1]);
    
    if (chartInstances.bar) { 
        chartInstances.bar.data.labels = sData.map(d => d.label); chartInstances.bar.data.datasets[0].data = sData.map(d => d.amount); chartInstances.bar.update(); 
    } else {
        const grad = barCtx.createLinearGradient(0, 0, 0, 400); grad.addColorStop(0, 'rgba(59, 130, 246, 0.7)'); grad.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
        chartInstances.bar = new Chart(barCtx, { type: 'line', data: { labels: sData.map(d => d.label), datasets: [{ data: sData.map(d => d.amount), backgroundColor: grad, borderColor: '#3b82f6', borderWidth: 2, fill: true, tension: 0.15, pointRadius: 2.5, pointHoverRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { left: -5, bottom: 10, top: 5, right: 5 } }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { padding: 10, bodyFont: { size: 13 }, callbacks: { label: c => ' ' + formatCur(c.raw) } } }, scales: { y: { beginAtZero: true, border: {display:false}, ticks: {font: { size: 11 }, maxTicksLimit: 6, callback: v => formatComp(v) + ' €'} }, x: { grid: {display:false}, border: {display:false}, ticks: {font: { size: 10 }, maxRotation: 45, minRotation: 0, padding: 5} } } } });
    }

    // --- GRÁFICO DE ANILLO (Distribución) ---
    const catMap = new Map(); 
    filteredTransactions.forEach(t => { 
        if (!catMap.has(t.category)) catMap.set(t.category, { amount: 0, color: t.color, emoji: t.emoji }); 
        catMap.get(t.category).amount += t.amount; 
    });
    
    // Aquí hemos eliminado el agrupamiento forzado. Ahora mapea todas tus categorías reales.
    let finalSlices = Array.from(catMap.entries()).sort((a, b) => b[1].amount - a[1].amount).map(e => ({ label: e[0], ...e[1] }));
    
    if (chartInstances.doughnut) { 
        chartInstances.doughnut.data.labels = finalSlices.map(d => d.label); 
        chartInstances.doughnut.data.datasets[0].data = finalSlices.map(d => d.amount); 
        chartInstances.doughnut.data.datasets[0].backgroundColor = finalSlices.map(d => d.color); 
        chartInstances.doughnut.update(); 
    } else {
        chartInstances.doughnut = new Chart(dCtx, { 
            type: 'doughnut', 
            data: { 
                labels: finalSlices.map(d => d.label), 
                datasets: [{ 
                    data: finalSlices.map(d => d.amount), 
                    backgroundColor: finalSlices.map(d => d.color), 
                    borderWidth: 2,
                    hoverOffset: 25 // El trozo salta y se amplía 25px al pasar el ratón
                }] 
            }, 
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '65%', 
                layout: { padding: 25 }, // Damos más espacio al lienzo para que el trozo ampliado no se corte al saltar
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10, weight: '600' } } 
                    }, 
                    tooltip: { padding: 12, callbacks: { label: c => ` ${c.label}: ${formatCur(c.raw)}` } } 
                }, 
                onHover: (e, el) => e.native.target.style.cursor = el[0] ? 'pointer' : 'default', 
                onClick: (e, elements) => { 
                    if (elements.length > 0 && window.openDrilldown) { 
                        window.openDrilldown(chartInstances.doughnut.data.labels[elements[0].index]); 
                    } 
                } 
            } 
        });
    }
    updateChartTheme();
}

function updateTopComercios() {
    const list = document.getElementById('topComerciosList');
    if(!list) return;
    const merchantMap = new Map(); filteredTransactions.forEach(t => { const name = t.normalizedConcept; if (name.toLowerCase() === "varios" || name.toLowerCase() === "varios / desconocido") return; if (!merchantMap.has(name)) merchantMap.set(name, { count: 0, amount: 0, color: t.color }); const m = merchantMap.get(name); m.count++; m.amount += t.amount; });
    const top5 = Array.from(merchantMap.entries()).sort((a,b) => b[1].count - a[1].count).slice(0, 5).map(e => ({ name: e[0], ...e[1] }));
    if (!top5.length) { list.innerHTML = `<p class="text-sm text-gray-500 italic text-center py-8">Datos insuficientes para el Top 5.</p>`; return; }
    list.innerHTML = top5.map((m, i) => `<div class="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700/50"><div class="flex items-center gap-3 overflow-hidden"><div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0" style="background-color: ${m.color}20; color: ${m.color}; border: 1px solid ${m.color}40">#${i+1}</div><div class="flex flex-col truncate"><span class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">${m.name}</span><span class="text-xs text-gray-500 dark:text-gray-400 truncate">${m.count} visitas este periodo</span></div></div><div class="text-right ml-2 flex-shrink-0"><span class="text-sm font-bold text-gray-800 dark:text-gray-200 block blur-data">${formatCur(m.amount)}</span></div></div>`).join('');
}

function updateTableOnly() {
    const table = document.getElementById('transactionsTable'), tInfo = document.getElementById('tableCountInfo'), tSearch = document.getElementById('tableSearch');
    if(!table || !tInfo || !tSearch) return;
    const search = tSearch.value.toUpperCase();
    currentlyDisplayedTableData = filteredTransactions.filter(t => t.description.includes(search) || t.category.toUpperCase().includes(search)).sort((a, b) => b.amount - a.amount);
    const displayData = currentlyDisplayedTableData.slice(0, 150);
    tInfo.innerText = `Mostrando ${displayData.length} de ${currentlyDisplayedTableData.length} resultados.`; tInfo.classList.remove('hidden');
    if (!displayData.length) { table.innerHTML = `<tr><td colspan="4" class="px-6 py-16 text-center"><div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"><i class="fa-solid fa-ghost text-5xl mb-4 opacity-50"></i><p class="text-lg font-bold text-gray-600 dark:text-gray-400">No hay movimientos aquí</p></div></td></tr>`; return; }
    table.innerHTML = displayData.map(t => `<tr class="hover:bg-blue-50/60 dark:hover:bg-blue-900/30 transition-colors"><td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 font-medium">${t.dateFormatted}</td><td class="px-6 py-4 text-sm text-gray-800 dark:text-gray-200 truncate max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md" title="${t.description}">${t.description}</td><td class="px-6 py-4 whitespace-nowrap text-sm"><span class="cat-badge px-3 py-1 inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold rounded-full shadow-sm hover:scale-105 transition-transform" data-cat="${t.category}" style="color: ${t.color}; background-color: ${t.color}15; border: 1px solid ${t.color}30"><span>${t.emoji || '🏷️'}</span> ${t.category}</span></td><td class="px-6 py-4 whitespace-nowrap text-sm text-right font-extrabold text-red-500 dark:text-red-400 tracking-tight">-<span class="blur-data">${formatCur(t.amount)}</span></td></tr>`).join('');
}

// ==========================================
// UTILIDADES UI, TOASTS Y MODALES
// ==========================================
function showLoader(msg) {
    const l = document.getElementById('globalLoader'), t = document.getElementById('globalLoaderText');
    if(l) { l.classList.remove('hidden'); l.style.opacity = '1'; }
    if(t) t.innerText = msg || 'Procesando...';
}
function hideLoader() {
    const l = document.getElementById('globalLoader');
    if(l) l.classList.add('hidden');
}
function openModal(modal) {
    if(!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const inner = modal.querySelector('.scale-95');
        if(inner) inner.classList.replace('scale-95', 'scale-100');
    });
}
function closeModal(modal) {
    if(!modal) return;
    modal.style.opacity = '0';
    const inner = modal.querySelector('.scale-100');
    if(inner) inner.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}
function animateValue(el, target, isCurrency) {
    if(!el) return;
    const duration = 600, startTime = performance.now();
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        el.innerText = isCurrency ? formatCur(current) : Math.round(current).toString();
        if(progress < 1) requestAnimationFrame(update);
        else el.innerText = isCurrency ? formatCur(target) : target.toString();
    }
    requestAnimationFrame(update);
}

window.showToast = function(msg, type = 'info', dur = 4000) {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const colors = { success: 'bg-emerald-500', error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' };
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `flex items-start gap-3 p-4 rounded-2xl shadow-2xl text-white text-sm font-semibold toast-enter ${colors[type] || colors.info} max-w-xs w-full pointer-events-auto`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} text-lg mt-0.5 flex-shrink-0"></i><span class="flex-1 leading-snug">${msg}</span><button class="ml-auto opacity-60 hover:opacity-100 flex-shrink-0 focus:outline-none" onclick="this.closest('div').remove()"><i class="fa-solid fa-xmark"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.replace('toast-enter', 'toast-leave'); setTimeout(() => toast.remove(), 300); }, dur);
};

window.showConfirmToast = function(msg) {
    return new Promise(resolve => {
        const container = document.getElementById('toastContainer');
        if(!container) { resolve(false); return; }
        const toast = document.createElement('div');
        toast.className = 'flex flex-col gap-3 p-4 rounded-2xl shadow-2xl bg-gray-800 dark:bg-gray-900 text-white text-sm font-semibold toast-enter max-w-xs w-full pointer-events-auto border border-gray-700';
        toast.innerHTML = `<span class="leading-snug"><i class="fa-solid fa-circle-question mr-2 text-amber-400"></i>${msg}</span><div class="flex gap-2"><button id="_confirmYes" class="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-1.5 text-xs font-bold transition-colors">Sí, eliminar</button><button id="_confirmNo" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white rounded-xl py-1.5 text-xs font-bold transition-colors">Cancelar</button></div>`;
        container.appendChild(toast);
        toast.querySelector('#_confirmYes').addEventListener('click', () => { toast.classList.replace('toast-enter','toast-leave'); setTimeout(()=>toast.remove(),300); resolve(true); });
        toast.querySelector('#_confirmNo').addEventListener('click', () => { toast.classList.replace('toast-enter','toast-leave'); setTimeout(()=>toast.remove(),300); resolve(false); });
    });
};

function applyCategorization(transactions, rules) {
    transactions.forEach(t => {
        let matched = false;
        for(const rule of rules) {
            if(rule.keywords.some(kw => t.description.includes(kw.toUpperCase().trim()))) {
                t.category = rule.category;
                t.color = rule.color;
                t.emoji = rule.emoji || '🏷️';
                matched = true;
                break;
            }
        }
        if(!matched) { t.category = 'Otros'; t.color = '#9ca3af'; t.emoji = '📦'; }
        const words = t.description.replace(/[*\/\\#@]/g, ' ').split(' ').filter(w => w.length > 3);
        t.normalizedConcept = words.slice(0, 2).join(' ') || t.description.slice(0, 20);
    });
    const rulesList = document.getElementById('rulesList');
    if(rulesList) {
        rulesList.innerHTML = rules.map(r => `<div class="flex items-center gap-2 py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0"><span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${r.color}"></span><span class="truncate text-gray-600 dark:text-gray-400">${r.emoji || ''} ${r.category}</span></div>`).join('');
    }
}

// ==========================================
// MÉTODOS DEL TEMA 
// ==========================================
function updateChartTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const tickColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    Object.values(chartInstances).forEach(chart => {
        if(!chart || !chart.options) return;
        if(chart.options.scales) Object.values(chart.options.scales).forEach(s => { if(s.ticks) s.ticks.color = tickColor; if(s.grid) s.grid.color = gridColor; });
        if(chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = tickColor;
        chart.update('none');
    });
}
function applyTheme(dark) {
    const html = document.documentElement, icon = document.getElementById('themeIcon');
    if(dark) { html.classList.add('dark'); html.classList.remove('light'); if(icon){icon.classList.remove('fa-moon');icon.classList.add('fa-sun');} }
    else { html.classList.remove('dark'); html.classList.add('light'); if(icon){icon.classList.remove('fa-sun');icon.classList.add('fa-moon');} }
    try { localStorage.setItem('theme', dark?'dark':'light'); } catch(e){}
    setTimeout(updateChartTheme, 50);
}
(function(){
    const saved = localStorage.getItem('theme');
    if(saved==='dark') applyTheme(true);
    else if(saved==='light') applyTheme(false);
    else if(window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme(true);
    if(localStorage.getItem('incognito')==='true') {
        document.body.classList.add('incognito-active');
        const icon = document.getElementById('incognitoIcon');
        if(icon){icon.classList.remove('fa-eye');icon.classList.add('fa-eye-slash');}
    }
})();

// ==========================================
// EXPORTACIÓN DE IMAGEN Y CSV
// ==========================================
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function exportImage() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 680; const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0,0,0,680); bg.addColorStop(0,'#0f172a'); bg.addColorStop(1,'#1e293b');
    ctx.fillStyle = bg; ctx.fillRect(0,0,1200,680);
    ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 20px Arial'; ctx.fillText('📊  Analizador Financiero PWA', 40, 48);   
    ctx.fillStyle = '#475569'; ctx.font = '13px Arial'; ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'}), 1160, 48);
    ctx.textAlign = 'left'; ctx.fillStyle = '#1e3a5f'; ctx.fillRect(40, 58, 1120, 1);
    const kpis = [
        { label: 'GASTO TOTAL', val: document.getElementById('kpiTotal')?.innerText||'0 €', color:'#3b82f6' },
        { label: 'TRANSACCIONES', val: document.getElementById('kpiTxCount')?.innerText||'0', color:'#8b5cf6' },
        { label: 'MEDIA DIARIA', val: document.getElementById('kpiAvg')?.innerText||'0 €', color:'#10b981' },
        { label: 'PRESUPUESTO MES', val: document.getElementById('budgetSpent')?.innerText||'0 €', color:'#f59e0b' }
    ];
    kpis.forEach((k,i) => {
        const x = 40+i*290, y = 72; ctx.fillStyle = 'rgba(255,255,255,0.04)'; roundRect(ctx,x,y,272,100,12); ctx.fill();
        ctx.strokeStyle = k.color+'50'; ctx.lineWidth=1; roundRect(ctx,x,y,272,100,12); ctx.stroke();
        ctx.fillStyle = k.color; ctx.font='bold 10px Arial'; ctx.fillText(k.label, x+16, y+22);
        ctx.fillStyle = '#f1f5f9'; ctx.font='bold 26px Arial'; ctx.fillText(k.val, x+16, y+62);
    });
    const catMap = new Map(); filteredTransactions.forEach(t => { if(!catMap.has(t.category)) catMap.set(t.category,{amount:0,color:t.color}); catMap.get(t.category).amount+=t.amount; });
    const cats = Array.from(catMap.entries()).sort((a,b)=>b[1].amount-a[1].amount).slice(0,7);
    const maxAmt = cats[0]?.[1].amount||1;
    ctx.fillStyle='#94a3b8'; ctx.font='bold 12px Arial'; ctx.fillText('DISTRIBUCIÓN POR CATEGORÍA', 40, 212); ctx.fillStyle='#1e3a5f'; ctx.fillRect(40,220,1120,1);
    cats.forEach(([label,data],i) => {
        const y=232+i*56, barW=Math.max(20,(data.amount/maxAmt)*740);
        ctx.fillStyle='rgba(255,255,255,0.025)'; roundRect(ctx,40,y,1120,48,8); ctx.fill(); ctx.fillStyle=data.color+'25'; roundRect(ctx,40,y,barW+180,48,8); ctx.fill();
        ctx.fillStyle=data.color; roundRect(ctx,40,y,5,48,3); ctx.fill(); ctx.fillStyle='#e2e8f0'; ctx.font='bold 14px Arial'; ctx.fillText(label, 56, y+30);
        ctx.fillStyle=data.color; ctx.font='bold 15px Arial'; ctx.textAlign='right'; ctx.fillText(formatCur(data.amount), 1148, y+30); ctx.textAlign='left';
    });
    ctx.fillStyle='#334155'; ctx.font='11px Arial'; ctx.textAlign='center'; ctx.fillText('Generado con Analizador Financiero PWA', 600, 666);   
    const link = document.createElement('a'), yFilt = document.getElementById('yearFilter');
    link.download = `Dashboard_Financiero_${yFilt?.value||'historico'}_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png'); link.click(); window.showToast('Infografía exportada correctamente.','success');
}

function exportCsv() {
    if(!filteredTransactions.length) { window.showToast('No hay datos para exportar.','warning'); return; }
    const rows = [['Fecha','Concepto','Categoría','Importe (€)'], ...filteredTransactions.map(t=>[t.dateFormatted,`"${t.description}"`,t.category,t.amount.toFixed(2)])];
    const csv = rows.map(r=>r.join(';')).join('\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const link = document.createElement('a'), yFilt = document.getElementById('yearFilter');
    link.href = URL.createObjectURL(blob); link.download = `Transacciones_Exportadas_${yFilt?.value||'todas'}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click(); window.showToast('CSV exportado correctamente.','success');
}

// ==========================================
// CALENDARIO Y DRILLDOWN
// ==========================================
function updateCalendarUI() {
    const grid = document.getElementById('calDaysGrid'), monthYearEl = document.getElementById('calMonthYear'), calTotalEl = document.getElementById('calTotalSpend');
    if(!grid) return;
    const month = currentCalDate.getMonth(), year = currentCalDate.getFullYear();
    if(monthYearEl) monthYearEl.innerText = new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(currentCalDate);
    const monthTxs = allTransactions.filter(t=>{ const d=new Date(t.timestamp); return d.getMonth()===month && d.getFullYear()===year; });
    if(calTotalEl) calTotalEl.innerText = formatCur(monthTxs.reduce((s,t)=>s+t.amount,0));
    const firstDay = new Date(year,month,1).getDay(), offset = firstDay===0?6:firstDay-1, daysInMonth = new Date(year,month+1,0).getDate();
    const daysWithTx = new Set(monthTxs.map(t=>new Date(t.timestamp).getDate()));
    let html = ''; for(let i=0;i<offset;i++) html+='<div></div>';
    for(let d=1;d<=daysInMonth;d++){
        const ts = new Date(year,month,d).getTime();
        let cls = 'calendar-day w-full aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer text-xs relative transition-colors hover:bg-gray-100 dark:hover:bg-gray-700';
        const sd = selectedStartDate?.getTime(), ed = selectedEndDate?.getTime(), hd = hoverDate?.getTime();
        if(sd && ed){ if(ts===sd&&ts===ed) cls+=' single-selected'; else if(ts===sd) cls+=' start-range'; else if(ts===ed) cls+=' end-range'; else if(ts>sd&&ts<ed) cls+=' in-range'; }
        else if(sd&&!ed){ if(ts===sd) cls+=' single-selected'; else if(hd){ const lo=Math.min(sd,hd),hi=Math.max(sd,hd); if(ts===lo) cls+=' start-range'; else if(ts===hi) cls+=' end-range'; else if(ts>lo&&ts<hi) cls+=' hover-range'; } }
        const dot = daysWithTx.has(d)?'<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400 opacity-80"></span>':'';
        html+=`<div class="${cls}" data-ts="${ts}"><div class="day-num text-xs">${d}</div>${dot}</div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.calendar-day[data-ts]').forEach(el=>{
        el.addEventListener('click',()=>{
            const ts=parseInt(el.getAttribute('data-ts')), clicked=new Date(ts);
            if(!selectedStartDate||(selectedStartDate&&selectedEndDate)){ selectedStartDate=clicked; selectedEndDate=null; }
            else { if(ts===selectedStartDate.getTime()){selectedStartDate=null;selectedEndDate=null;} else if(clicked<selectedStartDate){selectedEndDate=selectedStartDate;selectedStartDate=clicked;} else {selectedEndDate=clicked;} }
            hoverDate=null; updateCalendarBtnText(); updateCalendarUI(); updateDashboard();
        });
        el.addEventListener('mouseenter',()=>{ if(selectedStartDate&&!selectedEndDate){hoverDate=new Date(parseInt(el.getAttribute('data-ts')));updateCalendarUI();} });
    });
}
function updateCalendarBtnText() {
    const btn=document.getElementById('calendarBtnText'), clearBtn=document.getElementById('clearDateBtn');
    if(!btn) return;
    if(selectedStartDate&&selectedEndDate){ btn.innerText=`${selectedStartDate.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})} — ${selectedEndDate.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}`; if(clearBtn) clearBtn.classList.remove('hidden'); }
    else if(selectedStartDate){ btn.innerText=selectedStartDate.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}); if(clearBtn) clearBtn.classList.remove('hidden'); }
    else { btn.innerText='Rango de Fechas'; if(clearBtn) clearBtn.classList.add('hidden'); }
}

window.openDrilldown = function(categoryLabel) {
    const modal = document.getElementById('drilldownModal'); if(!modal) return;
    const txs = categoryLabel==='Otros' ? filteredTransactions.filter(t=>window.currentOtrosCategories?.includes(t.category)) : filteredTransactions.filter(t=>t.category===categoryLabel);
    if(!txs.length) return;
    const titleEl=document.getElementById('drilldownTitle'); if(titleEl) titleEl.innerText=categoryLabel;
    const totalAmt=txs.reduce((s,t)=>s+t.amount,0), grandTotal=filteredTransactions.reduce((s,t)=>s+t.amount,0);
    const ddTotal=document.getElementById('ddTotalAmount'),ddPct=document.getElementById('ddTotalPct'),ddAvg=document.getElementById('ddAvgAmount'),ddMax=document.getElementById('ddMaxMonth');
    if(ddTotal) ddTotal.innerText=formatCur(totalAmt);
    if(ddPct) ddPct.innerText=((totalAmt/grandTotal)*100).toFixed(1)+'% del periodo';
    const monthMap=new Map(); txs.forEach(t=>{if(!monthMap.has(t.sortKey))monthMap.set(t.sortKey,{label:t.monthYearLabel,amount:0});monthMap.get(t.sortKey).amount+=t.amount;});
    const months=Array.from(monthMap.values()).sort((a,b)=>a.label.localeCompare(b.label));
    const avgMonthly=months.length?totalAmt/months.length:0; const maxMonth=months.reduce((a,b)=>b.amount>a.amount?b:a,months[0]||{label:'-'});
    if(ddAvg) ddAvg.innerText=formatCur(avgMonthly); if(ddMax) ddMax.innerText='Max: '+(maxMonth?.label||'-');
    const merchantMap=new Map(); txs.forEach(t=>{const n=t.normalizedConcept;if(!merchantMap.has(n))merchantMap.set(n,0);merchantMap.set(n,merchantMap.get(n)+t.amount);});
    const top3=Array.from(merchantMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const ddTopEl=document.getElementById('ddTopMerchants');
    if(ddTopEl) ddTopEl.innerHTML=top3.map(([name,amt])=>`<div class="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"><span class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate mr-4">${name}</span><span class="text-sm font-bold text-gray-900 dark:text-white blur-data whitespace-nowrap">${formatCur(amt)}</span></div>`).join('');
    const conceptMap=new Map(); txs.forEach(t=>{const n=t.normalizedConcept;if(!conceptMap.has(n))conceptMap.set(n,0);conceptMap.set(n,conceptMap.get(n)+t.amount);});
    const topConcepts=Array.from(conceptMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const ddCtx=document.getElementById('drilldownChart')?.getContext('2d');
    if(ddCtx){if(chartInstances.drilldown)chartInstances.drilldown.destroy();chartInstances.drilldown=new Chart(ddCtx,{type:'doughnut',data:{labels:topConcepts.map(e=>e[0]),datasets:[{data:topConcepts.map(e=>e[1]),backgroundColor:drilldownPalette.slice(0,topConcepts.length),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:10},usePointStyle:true}},tooltip:{callbacks:{label:c=>` ${c.label}: ${formatCur(c.raw)}`}}}}});}
    const ddTrendCtx=document.getElementById('drilldownTrendChart')?.getContext('2d');
    if(ddTrendCtx){if(chartInstances.drilldownTrend)chartInstances.drilldownTrend.destroy();chartInstances.drilldownTrend=new Chart(ddTrendCtx,{type:'line',data:{labels:months.map(m=>m.label),datasets:[{data:months.map(m=>m.amount),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',fill:true,tension:0.3,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,border:{display:false},ticks:{callback:v=>formatComp(v)+'€',font:{size:10}}},x:{grid:{display:false},border:{display:false},ticks:{font:{size:10}}}}}});}
    openModal(modal);
};

// ==========================================
// DICCIONARIO
// ==========================================
function openDictionaryEditor() {
    const modal = document.getElementById('dictionaryModal'); if(!modal) return;
    editingRules = JSON.parse(JSON.stringify(categoryRules)); renderDictionaryRules(); openModal(modal);
}
function renderDictionaryRules() {
    const container = document.getElementById('dictionaryRulesContainer'); if(!container) return;
    container.innerHTML = editingRules.map((rule,i) => `
        <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 mb-2">
            <div class="flex items-center gap-3 mb-2"><input type="color" value="${rule.color}" data-rule="${i}" data-field="color" class="w-8 h-8 rounded cursor-pointer border-0 flex-shrink-0"><input type="text" value="${rule.emoji||'🏷️'}" data-rule="${i}" data-field="emoji" class="w-12 text-center bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-1.5 text-sm" maxlength="2"><input type="text" value="${rule.category}" data-rule="${i}" data-field="category" class="flex-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-1.5 text-sm font-bold text-gray-800 dark:text-white" placeholder="Nombre categoría"><button class="del-rule-btn text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex-shrink-0" data-rule="${i}"><i class="fa-solid fa-trash text-xs pointer-events-none"></i></button></div>
            <input type="text" value="${rule.keywords.join(', ')}" data-rule="${i}" data-field="keywords" class="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-1.5 text-xs text-gray-700 dark:text-gray-300" placeholder="Palabras clave separadas por coma">
        </div>`).join('');
    container.querySelectorAll('input[data-rule]').forEach(inp=>{
        inp.addEventListener('change',()=>{
            const i=parseInt(inp.getAttribute('data-rule')),field=inp.getAttribute('data-field');
            if(field==='keywords') editingRules[i].keywords=inp.value.split(',').map(k=>k.trim().toUpperCase()).filter(Boolean);
            else editingRules[i][field]=inp.value;
        });
    });
    container.querySelectorAll('.del-rule-btn').forEach(btn=>{ btn.addEventListener('click',()=>{editingRules.splice(parseInt(btn.getAttribute('data-rule')),1);renderDictionaryRules();}); });
}
function reapplyCategories() {
    categoryRules = JSON.parse(JSON.stringify(editingRules)); try { localStorage.setItem('customCategoryRules', JSON.stringify(categoryRules)); } catch(e){}
    applyCategorization(allTransactions, categoryRules); updateDashboard(); window.showToast('Categorías actualizadas.','success');
}
window.setCategoryFilter = function(cat) { const cFilt = document.getElementById('categoryFilter'); if(cFilt) { cFilt.value = cat; updateDashboard(); } };

// ==========================================
// EVENT LISTENERS PRINCIPALES AL CARGAR DOM
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. BOTONES GLOBALES DEL HEADER ---
    const themeBtn = document.getElementById('themeToggle');
    if(themeBtn) themeBtn.addEventListener('click', ()=>applyTheme(!document.documentElement.classList.contains('dark')));

    const incBtn=document.getElementById('incognitoToggle'), incIcon=document.getElementById('incognitoIcon');
    if(incBtn) incBtn.addEventListener('click',()=>{
        const active=document.body.classList.toggle('incognito-active');
        if(incIcon){incIcon.classList.toggle('fa-eye',!active);incIcon.classList.toggle('fa-eye-slash',active);}
        try{localStorage.setItem('incognito',active);}catch(e){}
    });

    const expBtn=document.getElementById('exportImageBtn');
    if(expBtn) expBtn.addEventListener('click', exportImage);

    const updateBtn = document.getElementById('updateDataBtn');
    const upFileInp = document.getElementById('updateFileInput');
    if(updateBtn && upFileInp) updateBtn.addEventListener('click', () => upFileInp.click());
    if(upFileInp) upFileInp.addEventListener('change', e => { if(e.target.files.length) handleFiles(e.target.files); e.target.value = ''; });

    // --- 2. MODAL DEL ALMACÉN (VAULT) ---
    const vaultBtn=document.getElementById('openVaultBtn'), vaultModal=document.getElementById('vaultModal');
    const closeVaultBtn=document.getElementById('closeVaultBtn'), deleteAllBtn=document.getElementById('deleteAllVaultBtn');
    if(vaultBtn) vaultBtn.addEventListener('click',()=>{refreshLocalVault();openModal(vaultModal);});
    if(closeVaultBtn) closeVaultBtn.addEventListener('click',()=>closeModal(vaultModal));
    if(deleteAllBtn) deleteAllBtn.addEventListener('click', async ()=>{
        const ok=await window.showConfirmToast('¿Eliminar TODOS los archivos del almacén? Esta acción no se puede deshacer.');
        if(!ok) return;
        if(savedFiles){for(const f of savedFiles) await deleteFileFromStorage(f.id,true);}
        refreshLocalVault(); window.showToast('Almacén vaciado completamente.','success');
    });
    const vaultList = document.getElementById('vaultList');
    if(vaultList) {
        vaultList.addEventListener('click', async (e) => {
            if(e.target.closest('.load-file-btn')) {
                const id = e.target.closest('.load-file-btn').getAttribute('data-id'), foundFile = savedFiles.find(x => x.id === id); 
                if(!foundFile) return; showLoader("Cargando archivo..."); closeModal(document.getElementById('vaultModal')); 
                setTimeout(() => { currentFileName = foundFile.fileName; buildDashboardModel(JSON.parse(foundFile.data)); window.showToast("Datos recuperados.", "success"); hideLoader(); }, 600);
            } else if(e.target.closest('.delete-file-btn')) {
                const id = e.target.closest('.delete-file-btn').getAttribute('data-id'), isConfirmed = await window.showConfirmToast("¿Eliminar permanentemente?"); 
                if(isConfirmed) await deleteFileFromStorage(id);
            }
        });
    }

    // --- 3. MODAL DE DICCIONARIO ---
    const dictBtn=document.getElementById('openDictionaryBtn'), dictModal=document.getElementById('dictionaryModal');
    const closeDictBtn=document.getElementById('closeDictionaryBtn'), cancelDictBtn=document.getElementById('cancelDictionaryBtn');
    const saveDictBtn=document.getElementById('saveDictionaryBtn'), restoreBtn=document.getElementById('restoreDefaultDictBtn');
    const addRuleBtn=document.getElementById('addRuleBtn');
    if(dictBtn) dictBtn.addEventListener('click', openDictionaryEditor);
    if(closeDictBtn) closeDictBtn.addEventListener('click',()=>closeModal(dictModal));
    if(cancelDictBtn) cancelDictBtn.addEventListener('click',()=>closeModal(dictModal));
    if(saveDictBtn) saveDictBtn.addEventListener('click',()=>{reapplyCategories();closeModal(dictModal);});
    if(restoreBtn) restoreBtn.addEventListener('click', async ()=>{
        const ok=await window.showConfirmToast('¿Restaurar el diccionario original? Se perderán tus cambios.');
        if(ok){editingRules=JSON.parse(JSON.stringify(defaultCategoryRules));renderDictionaryRules();window.showToast('Diccionario restaurado al original.','info');}
    });
    if(addRuleBtn) addRuleBtn.addEventListener('click',()=>{ editingRules.push({keywords:[],category:'Nueva Categoría',color:'#6366f1',emoji:'🏷️'}); renderDictionaryRules(); });

    // --- 4. MODAL DRILLDOWN Y CLICK FUERA DE MODALES ---
    const closeModalBtn=document.getElementById('closeModalBtn'), drilldownModal=document.getElementById('drilldownModal');
    if(closeModalBtn) closeModalBtn.addEventListener('click',()=>closeModal(drilldownModal));
    [vaultModal, drilldownModal, dictModal].forEach(modal=>{ if(modal) modal.addEventListener('click',e=>{if(e.target===modal) closeModal(modal);}); });

    // --- 5. PRESUPUESTO ---
    const editBudgetBtn=document.getElementById('editBudgetBtn'), budgetInputContainer=document.getElementById('budgetInputContainer');
    const budgetInput=document.getElementById('budgetInput'), saveBudgetBtn=document.getElementById('saveBudgetBtn'), cancelBudgetBtn=document.getElementById('cancelBudgetBtn');
    if(editBudgetBtn) editBudgetBtn.addEventListener('click',()=>{if(budgetInputContainer)budgetInputContainer.classList.remove('hidden');if(budgetInput){budgetInput.value=monthlyBudget;budgetInput.focus();}});
    if(saveBudgetBtn) saveBudgetBtn.addEventListener('click',()=>{
        const v=parseFloat(budgetInput?.value);
        if(!isNaN(v)&&v>0){monthlyBudget=v;try{localStorage.setItem('monthlyBudget',v);}catch(e){}updateDashboard();window.showToast('Presupuesto actualizado.','success');}
        if(budgetInputContainer) budgetInputContainer.classList.add('hidden');
    });
    if(cancelBudgetBtn) cancelBudgetBtn.addEventListener('click',()=>{if(budgetInputContainer)budgetInputContainer.classList.add('hidden');});

    // --- 6. TABLA Y EXPORTACIÓN CSV ---
    const csvBtn=document.getElementById('exportCsvBtn');
    if(csvBtn) csvBtn.addEventListener('click', exportCsv);
    const tSearch=document.getElementById('tableSearch'), clearSearchBtn=document.getElementById('clearSearchBtn');
    if(tSearch) tSearch.addEventListener('input',()=>{updateTableOnly();if(clearSearchBtn) clearSearchBtn.classList.toggle('hidden',!tSearch.value);});
    if(clearSearchBtn) clearSearchBtn.addEventListener('click',()=>{if(tSearch){tSearch.value='';clearSearchBtn.classList.add('hidden');updateTableOnly();}});
    const tableEl=document.getElementById('transactionsTable');
    if(tableEl) tableEl.addEventListener('click',e=>{const badge=e.target.closest('.cat-badge');if(badge) window.setCategoryFilter(badge.getAttribute('data-cat'));});

    // --- 7. FILTROS GENERALES Y RESET ---
    const yFilt=document.getElementById('yearFilter'), cFilt=document.getElementById('categoryFilter');
    if(yFilt) yFilt.addEventListener('change', updateDashboard);
    if(cFilt) cFilt.addEventListener('change', updateDashboard);
    const resetBtn=document.getElementById('resetBtn');
    if(resetBtn) resetBtn.addEventListener('click', async ()=>{
        const ok=await window.showConfirmToast('¿Resetear el dashboard y limpiar los datos en pantalla?'); if(!ok) return;
        allTransactions=[]; filteredTransactions=[];
        const dZone=document.getElementById('dropZoneContainer'),dBoard=document.getElementById('dashboard');
        if(dZone) dZone.classList.remove('hidden'); if(dBoard) dBoard.classList.add('hidden'); if(updateBtn) updateBtn.classList.add('hidden');
        window.showToast('Dashboard reseteado. El almacén no se ha borrado.','info');
    });

    // --- 8. ZONA DE SUBIDA Y DATOS DE PRUEBA ---
    let dragCounter = 0;
    document.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; const over = document.getElementById('globalDragOverlay'); if(over){ over.classList.remove('hidden'); over.classList.add('flex'); }});
    document.addEventListener('dragleave', e => { e.preventDefault(); dragCounter--; const over = document.getElementById('globalDragOverlay'); if (dragCounter === 0 && over) { over.classList.add('hidden'); over.classList.remove('flex'); } });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => { e.preventDefault(); dragCounter = 0; const over = document.getElementById('globalDragOverlay'); if(over){ over.classList.add('hidden'); over.classList.remove('flex'); } if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
    
    const fileInp = document.getElementById('fileInput'), dropZoneTrigger = document.getElementById('dropZoneTrigger'), examinarBtn = document.getElementById('examinarBtn');
    if(fileInp) fileInp.addEventListener('change', e => { if(e.target.files.length) handleFiles(e.target.files); e.target.value = ''; });
    if(dropZoneTrigger) dropZoneTrigger.addEventListener('click', () => { if(fileInp) fileInp.click(); });
    if(examinarBtn) examinarBtn.addEventListener('click', e => { e.stopPropagation(); if(fileInp) fileInp.click(); });
    
    const mockDataBtn = document.getElementById('mockDataBtn');
    if (mockDataBtn) mockDataBtn.addEventListener('click', loadMockData);

    const errorModal = document.getElementById('errorModal'), closeErrorModalBtn = document.getElementById('closeErrorModalBtn');
    if (closeErrorModalBtn) closeErrorModalBtn.addEventListener('click', () => closeModal(errorModal));

    // --- 9. CALENDARIO UI ---
    const openCalBtn=document.getElementById('openCalendarBtn'), calDrop=document.getElementById('calendarDropdown'), clearDateBtn=document.getElementById('clearDateBtn');
    const calPrev=document.getElementById('calPrevBtn'), calNext=document.getElementById('calNextBtn'), calQuickSelectBtn=document.getElementById('calQuickSelectBtn'), closeQuickSelectBtn=document.getElementById('closeQuickSelectBtn');
    const viewMonthBtn=document.getElementById('viewMonthBtn'), viewWeekBtn=document.getElementById('viewWeekBtn');
    if(openCalBtn) openCalBtn.addEventListener('click',e=>{e.stopPropagation();if(calDrop){calDrop.classList.toggle('hidden');if(!calDrop.classList.contains('hidden'))updateCalendarUI();}});
    if(clearDateBtn) clearDateBtn.addEventListener('click',()=>{selectedStartDate=null;selectedEndDate=null;hoverDate=null;updateCalendarBtnText();updateCalendarUI();updateDashboard();});
    if(calPrev) calPrev.addEventListener('click',()=>{currentCalDate.setMonth(currentCalDate.getMonth()-1);updateCalendarUI();});
    if(calNext) calNext.addEventListener('click',()=>{currentCalDate.setMonth(currentCalDate.getMonth()+1);updateCalendarUI();});
    if(viewMonthBtn) viewMonthBtn.addEventListener('click',()=>{calendarViewMode='month';viewMonthBtn.classList.add('bg-white','dark:bg-gray-600','shadow-sm','text-blue-600');viewWeekBtn?.classList.remove('bg-white','dark:bg-gray-600','shadow-sm','text-blue-600');updateCalendarUI();});
    if(viewWeekBtn) viewWeekBtn.addEventListener('click',()=>{calendarViewMode='week';viewWeekBtn.classList.add('bg-white','dark:bg-gray-600','shadow-sm','text-blue-600');viewMonthBtn?.classList.remove('bg-white','dark:bg-gray-600','shadow-sm','text-blue-600');updateCalendarUI();});
    if(calQuickSelectBtn) calQuickSelectBtn.addEventListener('click',()=>{
        const panel=document.getElementById('quickSelectPanel'), grid=document.getElementById('quickSelectGrid'); if(!panel||!grid) return;
        const years=[...new Set(allTransactions.map(t=>t.year))].sort((a,b)=>b-a);
        grid.innerHTML = years.length ? years.map(y=>`<button class="quick-year-btn bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg py-2 text-sm font-bold text-gray-700 dark:text-gray-200 transition-colors" data-year="${y}">${y}</button>`).join('') : '<p class="text-xs text-gray-400 col-span-3 text-center py-4">Sin datos cargados</p>';
        grid.querySelectorAll('.quick-year-btn').forEach(btn=>{ btn.addEventListener('click',()=>{ const y=parseInt(btn.getAttribute('data-year')); selectedStartDate=new Date(y,0,1); selectedEndDate=new Date(y,11,31); currentCalDate=new Date(y,0,1); updateCalendarBtnText();updateCalendarUI();updateDashboard(); panel.classList.add('hidden'); }); });
        panel.classList.remove('hidden');
    });
    if(closeQuickSelectBtn) closeQuickSelectBtn.addEventListener('click',()=>{const p=document.getElementById('quickSelectPanel');if(p)p.classList.add('hidden');});
    document.addEventListener('click',e=>{ const calContainer=document.getElementById('datePickerContainer'); if(calDrop&&!calDrop.classList.contains('hidden')&&calContainer&&!calContainer.contains(e.target)) calDrop.classList.add('hidden'); });

    // --- 10. ATAJOS DE TECLADO GLOBALES ---
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) { e.preventDefault(); if(tSearch) tSearch.focus(); }
        if (e.key === 'Escape') {
            if (document.activeElement === tSearch || (tSearch && tSearch.value.length > 0)) { tSearch.value = ''; if(clearSearchBtn) clearSearchBtn.classList.add('hidden'); updateTableOnly(); tSearch.blur(); }
            if (budgetInputContainer && !budgetInputContainer.classList.contains('hidden')) { budgetInput.value = monthlyBudget; budgetInputContainer.classList.add('hidden'); }
            if (vaultModal && !vaultModal.classList.contains('hidden')) closeModal(vaultModal);
            if (drilldownModal && !drilldownModal.classList.contains('hidden')) closeModal(drilldownModal);
            if (dictModal && !dictModal.classList.contains('hidden')) closeModal(dictModal);
            if (calDrop && !calDrop.classList.contains('hidden')) calDrop.classList.add('hidden');
        }
    });

    updateCalendarUI();
});
