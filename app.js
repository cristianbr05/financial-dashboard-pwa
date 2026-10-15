// =========================================================================
// ANALIZADOR FINANCIERO PWA v8.0 PRO — CORE ENGINE
// =========================================================================
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => console.warn('Service Worker no registrado.'));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.classList.add('flex');
    }
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.classList.add('hidden');
        installBtn.classList.remove('flex');
    }
});

// =========================================================================
// ESTADO GLOBAL Y PERSISTENCIA DE PREFERENCIAS
// =========================================================================
let monthlyBudget = 1000;
try {
    const m = localStorage.getItem('monthlyBudget');
    if (m && !isNaN(m) && parseFloat(m) > 0) monthlyBudget = parseFloat(m);
} catch (e) {}

// Metadatos por movimiento: { [txId]: { catOverride?: string, note?: string, excluded?: boolean } }
let txCustomMeta = {};
try {
    const savedMeta = localStorage.getItem('txCustomMeta');
    if (savedMeta) txCustomMeta = JSON.parse(savedMeta) || {};
} catch (e) { txCustomMeta = {}; }

function saveTxMetaToStorage() {
    try { localStorage.setItem('txCustomMeta', JSON.stringify(txCustomMeta)); } catch (e) {}
}

let allTransactions = [];
let filteredTransactions = [];
let currentlyDisplayedTableData = [];
let chartInstances = {};
let currentFileName = "";
let currentVaultId = null;
let editingRules = [];
let selectedStartDate = null;
let selectedEndDate = null;
let currentCalDate = new Date();
let hoverDate = null;
let calendarViewMode = 'month';
let evolutionChartType = 'line';

// Ordenación, Selección Múltiple y Virtualización de Tabla
let tableSortField = 'timestamp';
let tableSortAsc = false;
let selectedTxIds = new Set();
let selectedVaultIds = new Set();
let editingSingleTxId = null;
let isPrintingMode = false;

const VIRTUAL_ROW_HEIGHT = 49;
const VIRTUAL_BUFFER = 14;
let virtualScrollTicking = false;

window.currentOtrosCategories = [];

// =========================================================================
// UTILIDADES DE SEGURIDAD (ANTI-XSS) Y FORMATO NUMÉRICO
// =========================================================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCur(val) {
    if (isNaN(val) || val === null || val === undefined) return '0,00 €';
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: 'always'
    }).format(val);
}

function formatComp(val) {
    if (isNaN(val) || val === null || val === undefined) return '0';
    if (Math.abs(val) >= 1000) {
        return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(val / 1000) + 'k';
    }
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(val);
}

// Reglas por defecto con soporte para Sub-presupuestos por Categoría (Feature 5)
const defaultCategoryRules = [
    { keywords: ['AMZN', 'AMAZON', 'AMZ', 'PAYPAL', 'PAYPAL *', 'PAYPAL*', 'ALIEXPRESS', 'MIRAVIA', 'SHEIN', 'ZALANDO'], category: 'Compras Online', color: '#3b82f6', emoji: '🛍️', budget: 150 },
    { keywords: ['MERCADONA', 'MERCAT', 'LIDL', 'ALDI', 'CARREFOUR', 'DIA ', 'ALCAMPO', 'CONSUM', 'EROSKI'], category: 'Supermercado', color: '#10b981', emoji: '🛒', budget: 300 },
    { keywords: ['UBER EATS', 'UBEREATS', 'UBER*EATS', 'GLOVO', 'JUST EAT', 'DELIVEROO'], category: 'Delivery', color: '#f97316', emoji: '🍔', budget: 80 },
    { keywords: ['APPLE.COM', 'APPLE STORE', 'ITUNES', 'MAC STORE', 'PCCOMPONENTES', 'MEDIAMARKT'], category: 'Tecnología', color: '#64748b', emoji: '💻', budget: 0 },
    { keywords: ['GOOGLE*', 'GOOGLE PLAY', 'YOUTUBE', 'NETFLIX', 'NETFLIX.COM', 'SPOTIFY', 'SPOTIFY AB', 'HBO', 'DISNEY', 'PRIME VIDEO', 'APPLE', 'ICLOUD'], category: 'Suscripciones', color: '#ec4899', emoji: '📺', budget: 45 },
    { keywords: ['BIZUM', 'TRANSFERENCIA ENVIADA'], category: 'Transferencias', color: '#8b5cf6', emoji: '💸', budget: 0 },
    { keywords: ['REPSOL', 'BP ', 'CEPSA', 'GALP', 'SHELL', 'GASOLINERA', 'PETRONOR', 'PLENOIL', 'BALLENOIL'], category: 'Gasolinera', color: '#eab308', emoji: '🚗', budget: 120 },
    { keywords: ['ZARA', 'H&M', 'MANGO', 'PULL&BEAR', 'BERSHKA', 'STRADIVARIUS', 'PRIMARK', 'ASOS', 'UNIQLO'], category: 'Ropa', color: '#06b6d4', emoji: '👕', budget: 100 },
    { keywords: ['CORREOS', 'SEUR', 'MRW', 'GLS ', 'DHL', 'UPS '], category: 'Paquetería', color: '#d946ef', emoji: '📦', budget: 0 },
    { keywords: ['CLINICA', 'FARMACIA', 'FCIA ', 'DENTISTA', 'OPTICA', 'MEDICO', 'SANITAS', 'ADESLAS', 'SEGURO MEDICO'], category: 'Salud', color: '#ef4444', emoji: '💊', budget: 0 },
    { keywords: ['BAR ', 'CAFE ', 'CAFETERIA', 'RESTAURANTE', 'MCDONALDS', 'BURGER KING', 'KFC', 'DOMINOS', 'TELEPIZZA', 'PIZZA', 'BURGER'], category: 'Restauración', color: '#f59e0b', emoji: '🍽️', budget: 150 },
    { keywords: ['RENFE', 'ALSA', 'BLABLACAR', 'EMT ', 'METRO ', 'CABIFY', 'UBER ', 'PARKING'], category: 'Transporte', color: '#14b8a6', emoji: '🚆', budget: 60 },
    { keywords: ['GYM', 'GIMNASIO', 'DECATHLON', 'FITNESS', 'NIKE', 'ADIDAS'], category: 'Deporte', color: '#84cc16', emoji: '🏋️', budget: 50 },
    { keywords: ['STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'EPIC GAMES', 'BLIZZARD', 'GAME'], category: 'Gaming', color: '#6366f1', emoji: '🎮', budget: 50 },
    { keywords: ['IKEA', 'LEROY MERLIN', 'BRICODEPOT', 'LEROY', 'ALQUILER', 'HIPOTECA', 'COMUNIDAD'], category: 'Hogar', color: '#a855f7', emoji: '🏠', budget: 0 },
    { keywords: ['MOVISTAR', 'VODAFONE', 'ORANGE', 'DIGI', 'YOIGO', 'IBERDROLA', 'ENDESA', 'NATURGY', 'AGUA ', 'JAZZTEL', 'MASMOVIL'], category: 'Facturas Hogar / Tlf', color: '#0d9488', emoji: '📱', budget: 140 },
    { keywords: ['CAJERO', 'RETIRADA EFECTIVO'], category: 'Retirada Cajero', color: '#78716c', emoji: '🏧', budget: 0 },
    { keywords: ['ACADEMIA', 'UNIVERSIDAD', 'UNED', 'CURSO', 'LIBRO'], category: 'Educación', color: '#f43f5e', emoji: '🎓', budget: 0 },
    { keywords: ['HOTEL', 'VUELO', 'AIRBNB', 'BOOKING', 'RENTALCARS', 'RYANAIR', 'IBERIA', 'VUELING'], category: 'Viajes', color: '#0ea5e9', emoji: '✈️', budget: 0 },
    { keywords: ['VETERINARIO', 'TIENDA ANIMALES', 'PIENSO', 'KIWOKO', 'TIENDANIMAL'], category: 'Mascotas', color: '#d97706', emoji: '🐾', budget: 0 },
    { keywords: ['NOMINA', 'SALARIO', 'BECA', 'TRANSFERENCIA A FAVOR', 'ABONO', 'DEVOLUCION', 'INGRESO'], category: 'Ingresos y Devoluciones', color: '#10b981', emoji: '💰', budget: 0 }
];

let categoryRules = [];
try {
    const stored = localStorage.getItem('customCategoryRules');
    categoryRules = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(defaultCategoryRules));
    categoryRules.forEach(r => { if (r.budget === undefined) r.budget = 0; });
} catch (e) {
    categoryRules = JSON.parse(JSON.stringify(defaultCategoryRules));
}

const drilldownPalette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f43f5e', '#14b8a6', '#eab308', '#6366f1'];

// =========================================================================
// WEB WORKER INLINE PARA DEDUPLICACIÓN Y PROCESAMIENTO MASIVO (Feature 15)
// =========================================================================
function runDeduplicationWorker(existingRawData, validDataArrays) {
    return new Promise((resolve) => {
        const workerCode = `
            self.onmessage = function(e) {
                const { existingRawData, validDataArrays } = e.data;
                const existingCounts = new Map();
                existingRawData.forEach(tx => {
                    const type = tx.t || 'ex';
                    const baseKey = tx.d + '_' + type + '_' + Number(tx.a).toFixed(2) + '_' + tx.c;
                    existingCounts.set(baseKey, (existingCounts.get(baseKey) || 0) + 1);
                });

                const combinedRawData = [...existingRawData];
                let addedCount = 0;
                let ignoredCount = 0;

                validDataArrays.forEach(fileRows => {
                    const fileBatchCounts = new Map();
                    fileRows.forEach(tx => {
                        const type = tx.t || 'ex';
                        const baseKey = tx.d + '_' + type + '_' + Number(tx.a).toFixed(2) + '_' + tx.c;
                        const occInFile = (fileBatchCounts.get(baseKey) || 0) + 1;
                        fileBatchCounts.set(baseKey, occInFile);

                        const alreadyInDB = existingCounts.get(baseKey) || 0;
                        if (occInFile > alreadyInDB) {
                            combinedRawData.push({ d: tx.d, c: tx.c, a: Number(tx.a), t: type });
                            existingCounts.set(baseKey, alreadyInDB + 1);
                            addedCount++;
                        } else {
                            ignoredCount++;
                        }
                    });
                });

                self.postMessage({ combinedRawData, addedCount, ignoredCount });
            };
        `;
        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);
            worker.onmessage = (msg) => {
                URL.revokeObjectURL(url);
                worker.terminate();
                resolve(msg.data);
            };
            worker.onerror = () => {
                URL.revokeObjectURL(url);
                worker.terminate();
                resolve(fallbackMainThreadDeduplication(existingRawData, validDataArrays));
            };
            worker.postMessage({ existingRawData, validDataArrays });
        } catch (err) {
            resolve(fallbackMainThreadDeduplication(existingRawData, validDataArrays));
        }
    });
}

function fallbackMainThreadDeduplication(existingRawData, validDataArrays) {
    const existingCounts = new Map();
    existingRawData.forEach(tx => {
        const type = tx.t || 'ex';
        const baseKey = `${tx.d}_${type}_${Number(tx.a).toFixed(2)}_${tx.c}`;
        existingCounts.set(baseKey, (existingCounts.get(baseKey) || 0) + 1);
    });
    const combinedRawData = [...existingRawData];
    let addedCount = 0, ignoredCount = 0;
    validDataArrays.forEach(fileRows => {
        const fileBatchCounts = new Map();
        fileRows.forEach(tx => {
            const type = tx.t || 'ex';
            const baseKey = `${tx.d}_${type}_${Number(tx.a).toFixed(2)}_${tx.c}`;
            const occInFile = (fileBatchCounts.get(baseKey) || 0) + 1;
            fileBatchCounts.set(baseKey, occInFile);
            const alreadyInDB = existingCounts.get(baseKey) || 0;
            if (occInFile > alreadyInDB) {
                combinedRawData.push({ d: tx.d, c: tx.c, a: Number(tx.a), t: type });
                existingCounts.set(baseKey, alreadyInDB + 1);
                addedCount++;
            } else {
                ignoredCount++;
            }
        });
    });
    return { combinedRawData, addedCount, ignoredCount };
}

// =========================================================================
// BASE DE DATOS LOCAL (IndexedDB) + AUTO-CARGA DE SESIÓN (Feature 10, 11, 12)
// =========================================================================
const DB_NAME = 'FinDashboardDB';
const STORE_NAME = 'bank_files';
let localDB = null;
let savedFiles = [];

function initLocalDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = e => { localDB = e.target.result; res(); };
        req.onerror = e => rej(e.target.error);
        req.onblocked = () => window.showToast("Cierra otras pestañas para actualizar la base de datos.", "warning");
    });
}

async function saveToLocalDB(id, fileName, dataJson, customDate = null) {
    return new Promise((res, rej) => {
        const tx = localDB.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
            id,
            fileName,
            uploadDate: customDate || new Date().toISOString(),
            data: dataJson
        });
        tx.oncomplete = res;
        tx.onerror = rej;
    });
}

async function getLocalDBFiles() {
    return new Promise((res, rej) => {
        const tx = localDB.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}

async function deleteLocalDBFile(id) {
    return new Promise((res, rej) => {
        const tx = localDB.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = res;
        tx.onerror = rej;
    });
}

async function initStorage() {
    const badge = document.getElementById('storageStatusBadge');
    if (badge) badge.classList.remove('hidden');
    try {
        await initLocalDB();
        await refreshLocalVault();

        // Auto-carga de la última sesión activa (Feature 10)
        const lastVaultId = localStorage.getItem('lastActiveVaultId');
        const sessionExplicitlyClosed = localStorage.getItem('sessionClosed') === 'true';

        if (savedFiles.length > 0) {
            const targetFile = savedFiles.find(f => f.id === lastVaultId) || savedFiles[0];
            const resumeBtn = document.getElementById('resumeLastSessionBtn');
            const resumeName = document.getElementById('resumeLastSessionName');
            if (resumeBtn && resumeName && targetFile) {
                resumeName.innerText = targetFile.fileName;
                resumeBtn.classList.remove('hidden');
                resumeBtn.classList.add('flex');
                resumeBtn.onclick = () => loadVaultDataset(targetFile);
            }
            if (!sessionExplicitlyClosed && targetFile) {
                loadVaultDataset(targetFile, true);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function loadVaultDataset(fileRecord, silent = false) {
    try {
        const parsed = JSON.parse(fileRecord.data);
        currentFileName = fileRecord.fileName;
        currentVaultId = fileRecord.id;
        localStorage.setItem('lastActiveVaultId', fileRecord.id);
        localStorage.setItem('sessionClosed', 'false');
        buildDashboardModel(parsed);
        if (!silent) window.showToast(`Sesión cargada: "${fileRecord.fileName}"`, "success");
    } catch (e) {
        window.showToast("Error al leer el archivo del almacén.", "error");
    }
}

async function saveFileToStorage(jsonData, forceFilename = null) {
    if (!localDB) return null;
    const newDocId = 'file_' + Date.now();
    const fName = forceFilename || currentFileName || 'Extracto';
    await saveToLocalDB(newDocId, fName, jsonData);
    currentVaultId = newDocId;
    try {
        localStorage.setItem('lastActiveVaultId', newDocId);
        localStorage.setItem('sessionClosed', 'false');
    } catch (e) {}
    await refreshLocalVault();
    return newDocId;
}

async function deleteFileFromStorage(id, silent = false) {
    if (localDB) {
        await deleteLocalDBFile(id);
        selectedVaultIds.delete(id);
        if (!silent) await refreshLocalVault();
    }
    if (!silent) window.showToast("Archivo eliminado del almacén.", "success");
}

async function refreshLocalVault() {
    if (!localDB) return;
    savedFiles = await getLocalDBFiles();
    savedFiles.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    const countBadge = document.getElementById('vaultCountBadge');
    if (countBadge) {
        countBadge.innerText = savedFiles.length.toString();
        countBadge.classList.toggle('hidden', savedFiles.length === 0);
    }
    renderVaultList();
}

function updateVaultMergeBtnUI() {
    const mergeBtn = document.getElementById('mergeSelectedVaultBtn');
    if (!mergeBtn) return;
    if (selectedVaultIds.size >= 2) {
        mergeBtn.classList.remove('hidden');
        mergeBtn.classList.add('flex');
        mergeBtn.innerHTML = `<i class="fa-solid fa-code-merge"></i> Fusionar (${selectedVaultIds.size}) seleccionados`;
    } else {
        mergeBtn.classList.add('hidden');
        mergeBtn.classList.remove('flex');
    }
}

function renderVaultList() {
    const list = document.getElementById('vaultList');
    if (!list) return;
    updateVaultMergeBtnUI();

    if (!savedFiles.length) {
        list.innerHTML = `<li class="p-12 text-center text-slate-500 dark:text-slate-400 italic">Tu almacén local está vacío. Importa un extracto o restaura un backup .JSON.</li>`;
        return;
    }

    list.innerHTML = savedFiles.map(f => {
        const dateObj = new Date(f.uploadDate);
        let txCount = 0, expenseSum = 0, incomeSum = 0;
        try {
            const parsed = JSON.parse(f.data);
            txCount = parsed.length;
            parsed.forEach(item => {
                const amt = Number(item.a) || 0;
                if (item.t === 'in') incomeSum += amt;
                else expenseSum += amt;
            });
        } catch (e) {}

        const safeName = escapeHTML(f.fileName);
        const safeId = escapeHTML(f.id);
        const isChecked = selectedVaultIds.has(f.id) ? 'checked' : '';
        const isCurrent = currentVaultId === f.id;

        return `
        <li class="p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${isCurrent ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}">
            <div class="flex items-center min-w-0 gap-3 flex-1">
                <input type="checkbox" data-vault-cb="${safeId}" ${isChecked} title="Seleccionar para fusionar" class="vault-merge-cb w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0">
                <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex justify-center items-center flex-shrink-0 border border-blue-100 dark:border-blue-900/50">
                    <i class="fa-solid fa-file-csv text-lg"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-slate-800 dark:text-white text-sm sm:text-base truncate" title="${safeName}">${safeName}</h4>
                        ${isCurrent ? '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">ACTIVO</span>' : ''}
                        <button type="button" class="rename-file-btn text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded-lg transition-colors" data-id="${safeId}" title="Renombrar dataset">
                            <i class="fa-solid fa-pen text-xs pointer-events-none"></i>
                        </button>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums flex flex-wrap items-center gap-x-2">
                        <span><i class="fa-regular fa-clock mr-1"></i>${dateObj.toLocaleDateString('es-ES')} ${dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span class="font-semibold text-slate-700 dark:text-slate-300">${txCount} movs.</span>
                        <span>•</span>
                        <span class="font-bold text-red-500 dark:text-red-400 blur-data">-${formatCur(expenseSum)}</span>
                        ${incomeSum > 0 ? `<span class="font-bold text-emerald-600 dark:text-emerald-400 blur-data">+${formatCur(incomeSum)}</span>` : ''}
                    </p>
                </div>
            </div>
            <div class="flex gap-2 w-full sm:w-auto flex-shrink-0">
                <button class="load-file-btn px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center flex-1 sm:flex-initial" data-id="${safeId}">
                    <i class="fa-solid fa-folder-open mr-2"></i> Cargar
                </button>
                <button class="delete-file-btn px-3 py-2 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center" data-id="${safeId}" title="Eliminar archivo">
                    <i class="fa-solid fa-trash-can pointer-events-none"></i>
                </button>
            </div>
        </li>`;
    }).join('');
}

// =========================================================================
// COPIA DE SEGURIDAD TOTAL (.JSON BACKUP EXPORT & IMPORT - Feature 11)
// =========================================================================
async function exportFullBackupJSON() {
    await refreshLocalVault();
    const backupPayload = {
        app: 'AnalizadorFinancieroPWA',
        version: '8.0',
        exportedAt: new Date().toISOString(),
        monthlyBudget,
        categoryRules,
        txCustomMeta,
        vaultFiles: savedFiles
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FinDash_Backup_Total_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.showToast('Copia de seguridad (.JSON) exportada con éxito.', 'success');
}

async function importFullBackupJSON(file) {
    showLoader('Restaurando copia de seguridad completa...');
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || parsed.app !== 'AnalizadorFinancieroPWA') {
            hideLoader();
            window.showToast('El archivo JSON no es una copia de seguridad válida de FinDash.', 'error');
            return;
        }
        if (parsed.monthlyBudget && !isNaN(parsed.monthlyBudget)) {
            monthlyBudget = parseFloat(parsed.monthlyBudget);
            localStorage.setItem('monthlyBudget', monthlyBudget);
        }
        if (Array.isArray(parsed.categoryRules) && parsed.categoryRules.length > 0) {
            categoryRules = parsed.categoryRules;
            localStorage.setItem('customCategoryRules', JSON.stringify(categoryRules));
        }
        if (parsed.txCustomMeta && typeof parsed.txCustomMeta === 'object') {
            txCustomMeta = { ...txCustomMeta, ...parsed.txCustomMeta };
            saveTxMetaToStorage();
        }
        if (Array.isArray(parsed.vaultFiles) && localDB) {
            for (const vf of parsed.vaultFiles) {
                if (vf.id && vf.fileName && vf.data) {
                    await saveToLocalDB(vf.id, vf.fileName, vf.data, vf.uploadDate);
                }
            }
        }
        await refreshLocalVault();
        hideLoader();
        if (savedFiles.length > 0) {
            loadVaultDataset(savedFiles[0], true);
        }
        window.showToast('Copia de seguridad restaurada (extractos, reglas y notas).', 'success');
    } catch (e) {
        hideLoader();
        window.showToast('Error al restaurar el archivo JSON.', 'error');
    }
}

// =========================================================================
// PARSEO DE ARCHIVOS CON SOPORTE DE INGRESOS Y GASTOS (Feature 1)
// =========================================================================
function parseBankDate(val) {
    if (val instanceof Date) return val;
    if (typeof val === 'number' && val > 25000 && val < 60000) {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
    }
    let s = String(val).replace(/["']/g, '').trim().split(' ')[0];
    if (s.includes('/')) {
        let p = s.split('/');
        if (p[2] && p[2].length === 4) return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
        if (p[0] && p[0].length === 4) return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        if (p[2] && p[2].length === 2) return new Date(2000 + parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    }
    if (s.includes('-')) {
        let p = s.split('-');
        if (p[2] && p[2].length === 4) return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
        if (p[0] && p[0].length === 4) return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    }
    return new Date(s);
}

function parseAmountValue(amountRaw) {
    if (typeof amountRaw === 'number') return amountRaw;
    let clean = String(amountRaw).replace(/[\s\xA0€$£]/g, '').replace(/[^0-9,.\-+]/g, '');
    if (!clean) return NaN;
    if (clean.includes(',') && (!clean.includes('.') || clean.indexOf(',') > clean.lastIndexOf('.'))) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',') && clean.includes('.') && clean.indexOf('.') > clean.lastIndexOf(',')) {
        clean = clean.replace(/,/g, '');
    }
    return parseFloat(clean);
}

function extractDataFromRaw(data) {
    let headerRowIndex = -1, dateColIndex = -1, descColIndex = -1, amountColIndex = -1;
    const extractedData = [];

    for (let i = 0; i < Math.min(50, data.length) && headerRowIndex === -1; i++) {
        if (!Array.isArray(data[i])) continue;
        const rStr = data[i].map(c => String(c).toLowerCase().trim());
        const dIdx = rStr.findIndex(c => /fecha|f\.?\s*valor|operaci[oó]n|date/.test(c));
        const aIdx = rStr.findIndex(c => /importe|cantidad|monto|amount|cargo|valor/.test(c));
        const cIdx = rStr.findIndex(c => /concepto|movimiento|detalle|observaciones|descripci[oó]n|comercio/.test(c));
        if (dIdx !== -1 && aIdx !== -1) {
            headerRowIndex = i;
            dateColIndex = dIdx;
            amountColIndex = aIdx;
            descColIndex = (cIdx !== -1) ? cIdx : (dIdx + 1 !== aIdx ? dIdx + 1 : dIdx + 2);
        }
    }

    if (headerRowIndex === -1) {
        for (let i = 0; i < Math.min(50, data.length) && headerRowIndex === -1; i++) {
            const row = data[i];
            if (Array.isArray(row) && row.length >= 3) {
                const isDate = c => c instanceof Date || (typeof c === 'string' && (/^\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(c.trim()) || /^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(c.trim())));
                const isMoney = c => typeof c === 'number' || (typeof c === 'string' && /^[+-]?\d[\d.,]*[.,]\d{2}\s*€?$/.test(c.trim()));
                if (row.some(isDate) && row.some(isMoney)) {
                    headerRowIndex = i - 1;
                    dateColIndex = row.findIndex(isDate);
                    amountColIndex = row.findIndex(isMoney);
                    descColIndex = (dateColIndex + 1 !== amountColIndex) ? dateColIndex + 1 : dateColIndex + 2;
                }
            }
        }
    }

    if (headerRowIndex === -1) return { error: "Columnas no detectadas" };

    // Detectar si el archivo incluye importes negativos (extracto bancario estándar con cargos '-' y abonos '+')
    let hasNegativeAmounts = false;
    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row[amountColIndex] === undefined) continue;
        const val = parseAmountValue(row[amountColIndex]);
        if (!isNaN(val) && val < -0.01) {
            hasNegativeAmounts = true;
            break;
        }
    }

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row[dateColIndex] === undefined || row[amountColIndex] === undefined) continue;
        let dateRaw = row[dateColIndex];
        let descStr = String(row[descColIndex] || "").toUpperCase().trim().replace(/\s+/g, ' ');
        if (descStr === 'TARJETA' || descStr === '') continue;

        let dateObj = parseBankDate(dateRaw);
        if (!dateObj || isNaN(dateObj.getTime()) || dateObj.getFullYear() < 2000) continue;
        const normalizedDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

        let amount = parseAmountValue(row[amountColIndex]);
        if (isNaN(amount) || Math.abs(amount) < 0.01) continue;

        // Si el extracto tiene signos negativos, los negativos son gastos ('ex') y los positivos son ingresos/devoluciones ('in').
        // Si todos los números del archivo son positivos (ej. extracto exclusivo de tarjeta de crédito), se tratan como gastos ('ex') salvo palabras de abono/nómina.
        let txType = 'ex';
        if (hasNegativeAmounts) {
            txType = amount > 0 ? 'in' : 'ex';
        } else if (/NOMINA|ABONO|DEVOLUCION|TRANSFERENCIA A FAVOR|INGRESO/.test(descStr)) {
            txType = 'in';
        }

        extractedData.push({
            d: normalizedDate.getTime(),
            c: descStr,
            a: Math.abs(amount),
            t: txType
        });
    }
    return extractedData;
}

function decodeCSVBuffer(arrayBuffer) {
    try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(arrayBuffer);
    } catch (e) {
        const fallbackDecoder = new TextDecoder('windows-1252');
        return fallbackDecoder.decode(arrayBuffer);
    }
}

async function processAndMergeFiles(files) {
    if (!files.length) return;

    // Si el usuario suelta un archivo .json de copia de seguridad, lo restauramos directamente
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) {
        await importFullBackupJSON(files[0]);
        return;
    }

    showLoader("Procesando extractos en segundo plano...");

    const filePromises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['csv', 'xlsx', 'xls'].includes(ext)) {
                resolve({ error: 'Extensión no admitida' });
                return;
            }
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    if (['xlsx', 'xls'].includes(ext)) {
                        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
                        resolve(extractDataFromRaw(rows));
                    } else {
                        const text = decodeCSVBuffer(e.target.result);
                        Papa.parse(text, {
                            header: false,
                            skipEmptyLines: 'greedy',
                            complete: res => resolve(extractDataFromRaw(res.data))
                        });
                    }
                } catch (err) {
                    resolve({ error: 'Error leyendo archivo' });
                }
            };
            reader.readAsArrayBuffer(file);
        });
    });

    const results = await Promise.all(filePromises);
    const validDataArrays = results.filter(r => Array.isArray(r) && r.length > 0);
    if (!validDataArrays.length) {
        hideLoader();
        const errorModal = document.getElementById('errorModal');
        if (errorModal) openModal(errorModal);
        return;
    }

    const existingRawData = allTransactions.map(tx => ({
        d: tx.timestamp,
        c: tx.description,
        a: tx.amount,
        t: tx.type
    }));

    const { combinedRawData, addedCount, ignoredCount } = await runDeduplicationWorker(existingRawData, validDataArrays);

    if (addedCount > 0) {
        const baseName = files.length === 1
            ? files[0].name.replace(/\.[^/.]+$/, "")
            : `Fusión_${new Date().toISOString().slice(0, 10)}`;
        currentFileName = baseName;
        await saveFileToStorage(JSON.stringify(combinedRawData), baseName);
        hideLoader();
        buildDashboardModel(combinedRawData);
        window.showToast(`¡Completado! ${addedCount} movimientos añadidos (${ignoredCount} duplicados omitidos).`, "success");
    } else {
        hideLoader();
        window.showToast(`Sin novedades: los ${ignoredCount} movimientos ya estaban cargados.`, "info");
    }
}

function handleFiles(files) {
    processAndMergeFiles(files);
}

// =========================================================================
// GENERADOR DE DATOS DE DEMOSTRACIÓN (CON INGRESOS, DEVOLUCIONES Y GASTOS)
// =========================================================================
function loadMockData() {
    showLoader("Generando escenario financiero completo...");
    const mockData = [];
    const dummyExpenses = [
        { c: 'MERCADONA S.A.', min: 22, max: 98 },
        { c: 'CONSUM COOPERATIVA', min: 14, max: 62 },
        { c: 'AMAZON EU SARL', min: 12.99, max: 84 },
        { c: 'NETFLIX.COM', min: 12.99, max: 12.99 },
        { c: 'SPOTIFY AB', min: 10.99, max: 10.99 },
        { c: 'RESTAURANTE EL PINO', min: 25, max: 64 },
        { c: 'REPSOL ESTACION SERVICIO', min: 45, max: 75 },
        { c: 'ZARA ESPAÑA', min: 24, max: 95 },
        { c: 'FARMACIA CENTRAL', min: 6, max: 28 },
        { c: 'UBER EATS DELIVERY', min: 14, max: 36 },
        { c: 'GIMNASIO FITNESS PARK', min: 29.90, max: 29.90 },
        { c: 'IBERDROLA CLIENTES', min: 52, max: 92 },
        { c: 'STEAM GAMES', min: 14.99, max: 49.99 },
        { c: 'PCCOMPONENTES', min: 39, max: 155 }
    ];

    const today = new Date();
    // 6 meses de nóminas y devoluciones puntuales
    for (let m = 0; m < 6; m++) {
        const salaryDate = new Date(today.getFullYear(), today.getMonth() - m, 28);
        if (salaryDate <= today) {
            mockData.push({
                d: salaryDate.getTime(),
                c: 'ABONO NOMINA MENSUAL EMPRESA S.L.',
                a: 1650.00,
                t: 'in'
            });
        }
        const bizumInDate = new Date(today.getFullYear(), today.getMonth() - m, 15);
        if (bizumInDate <= today) {
            mockData.push({
                d: bizumInDate.getTime(),
                c: 'BIZUM RECIBIDO CENA COMPARTIDA',
                a: parseFloat((18 + Math.random() * 25).toFixed(2)),
                t: 'in'
            });
        }
    }

    for (let i = 0; i < 170; i++) {
        const randomDaysAgo = Math.floor(Math.random() * 180);
        const txDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - randomDaysAgo);
        const merchant = dummyExpenses[Math.floor(Math.random() * dummyExpenses.length)];
        const amount = merchant.min + (Math.random() * (merchant.max - merchant.min));

        mockData.push({
            d: txDate.getTime(),
            c: `${merchant.c} #${Math.floor(100 + Math.random() * 899)}`,
            a: parseFloat(amount.toFixed(2)),
            t: 'ex'
        });
    }

    setTimeout(async () => {
        currentFileName = "Demo_Cashflow_Pro";
        await saveFileToStorage(JSON.stringify(mockData), "Demo_Cashflow_Pro");
        hideLoader();
        buildDashboardModel(mockData);
        window.showToast("Escenario Pro cargado con ingresos, devoluciones y gastos.", "success");
    }, 350);
}

// =========================================================================
// CONSTRUCCIÓN DEL MODELO, METADATOS INDIVIDUALES Y CATEGORIZACIÓN
// =========================================================================
function buildDashboardModel(rawData) {
    allTransactions = [];
    selectedTxIds.clear();
    updateBulkActionBarUI();

    const occCounter = new Map();
    rawData.forEach(item => {
        const dateObj = new Date(item.d);
        const type = item.t === 'in' ? 'in' : 'ex';
        const amount = Number(item.a) || 0;
        const desc = String(item.c || '');
        const baseKey = `${item.d}_${type}_${amount.toFixed(2)}_${desc}`;
        const occ = (occCounter.get(baseKey) || 0) + 1;
        occCounter.set(baseKey, occ);
        const txId = `${baseKey}#${occ}`;

        allTransactions.push({
            id: txId,
            timestamp: item.d,
            dateObj,
            dateFormatted: dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            year: dateObj.getFullYear(),
            sortKey: dateObj.getFullYear() * 100 + (dateObj.getMonth() + 1),
            monthYearLabel: new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(dateObj),
            description: desc,
            amount,
            type
        });
    });

    allTransactions.sort((a, b) => b.timestamp - a.timestamp);
    applyCategorization(allTransactions, categoryRules);

    document.getElementById('dropZoneContainer')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.remove('hidden');
    document.getElementById('updateDataBtn')?.classList.remove('hidden');

    const yFilt = document.getElementById('yearFilter');
    if (yFilt) {
        const years = [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a);
        yFilt.innerHTML = `<option value="all">Todos los años (${years.length})</option>` +
            years.map(y => `<option value="${y}">Año ${y}</option>`).join('');
        const savedYear = localStorage.getItem('filterYear');
        if (savedYear && [...yFilt.options].some(o => o.value === savedYear)) yFilt.value = savedYear;
    }

    refreshCategoryFilterOptions();

    const drDisp = document.getElementById('dateRangeDisplay');
    if (drDisp && allTransactions.length > 0) {
        const minD = new Date(allTransactions[allTransactions.length - 1].timestamp);
        const maxD = new Date(allTransactions[0].timestamp);
        drDisp.innerHTML = `<i class="fa-regular fa-calendar-check mr-2 text-blue-500"></i><span class="font-bold">${minD.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} — ${maxD.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>`;
        drDisp.classList.remove('hidden');
        currentCalDate = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
    }

    selectedStartDate = null;
    selectedEndDate = null;
    updateCalendarBtnText();
    updateCalendarUI();
    updateDashboard();
}

function applyCategorization(transactions, rules) {
    let classifiedCount = 0;
    const ruleMap = new Map(rules.map(r => [r.category, r]));

    transactions.forEach(t => {
        const meta = txCustomMeta[t.id] || {};
        t.note = meta.note || '';
        t.excluded = Boolean(meta.excluded);
        t.hasOverride = Boolean(meta.catOverride);

        if (meta.catOverride && ruleMap.has(meta.catOverride)) {
            const r = ruleMap.get(meta.catOverride);
            t.category = r.category;
            t.color = r.color;
            t.emoji = r.emoji || '🏷️';
            classifiedCount++;
        } else {
            let matched = false;
            for (const rule of rules) {
                if (rule.keywords.some(kw => kw && t.description.includes(kw.toUpperCase().trim()))) {
                    t.category = rule.category;
                    t.color = rule.color;
                    t.emoji = rule.emoji || '🏷️';
                    matched = true;
                    classifiedCount++;
                    break;
                }
            }
            if (!matched) {
                if (t.type === 'in') {
                    t.category = 'Ingresos y Devoluciones';
                    t.color = '#10b981';
                    t.emoji = '💰';
                    classifiedCount++;
                } else {
                    t.category = 'Sin Clasificar';
                    t.color = '#64748b';
                    t.emoji = '❓';
                }
            }
        }

        const words = t.description.replace(/[*\/\\#@0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        t.normalizedConcept = words.slice(0, 2).join(' ') || t.description.slice(0, 18);
    });

    const total = transactions.length;
    const pct = total > 0 ? Math.round((classifiedCount / total) * 100) : 100;
    const uncategorized = total - classifiedCount;

    const pctBadge = document.getElementById('categorizedPctBadge');
    const progBar = document.getElementById('categorizedProgressBar');
    const hintEl = document.getElementById('uncategorizedHint');
    if (pctBadge) pctBadge.innerText = `${pct}%`;
    if (progBar) progBar.style.width = `${pct}%`;
    if (hintEl) {
        if (uncategorized > 0) {
            hintEl.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-semibold">${uncategorized} movs. sin clasificar.</span> Pulsa <i class="fa-solid fa-pen-to-square"></i> en la fila para clasificarlos.`;
        } else {
            hintEl.innerText = '100% de movimientos clasificados.';
        }
    }

    const rulesList = document.getElementById('rulesList');
    if (rulesList) {
        rulesList.innerHTML = rules.map(r => `
            <div class="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <div class="flex items-center gap-2 truncate">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${escapeHTML(r.color)}"></span>
                    <span class="truncate text-slate-700 dark:text-slate-300 font-medium">${escapeHTML(r.emoji || '')} ${escapeHTML(r.category)}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono ml-2">${r.budget > 0 ? formatComp(r.budget) + '€' : r.keywords.length + ' kw'}</span>
            </div>`).join('');
    }
}

function refreshCategoryFilterOptions() {
    const cFilt = document.getElementById('categoryFilter');
    const bulkCatSelect = document.getElementById('bulkCategorySelect');
    const cats = [...new Set(allTransactions.map(t => t.category))].sort();

    if (cFilt) {
        const currentCatFilter = cFilt.value;
        cFilt.innerHTML = `<option value="all">Todas las categorías (${cats.length})</option>` +
            cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
        const savedCat = localStorage.getItem('filterCat') || currentCatFilter;
        if (savedCat && [...cFilt.options].some(o => o.value === savedCat)) cFilt.value = savedCat;
        else cFilt.value = 'all';
    }

    if (bulkCatSelect) {
        bulkCatSelect.innerHTML = categoryRules.map(r =>
            `<option value="${escapeHTML(r.category)}">${escapeHTML(r.emoji || '🏷️')} ${escapeHTML(r.category)}</option>`
        ).join('');
    }
}

// =========================================================================
// ACTUALIZACIÓN DE KPIS, FLUJO DE CAJA Y SUB-PRESUPUESTOS (Features 1, 5, 7)
// =========================================================================
function updateDashboard() {
    const yFilt = document.getElementById('yearFilter');
    const cFilt = document.getElementById('categoryFilter');
    const sy = yFilt ? yFilt.value : 'all';
    const sc = cFilt ? cFilt.value : 'all';
    try {
        localStorage.setItem('filterYear', sy);
        localStorage.setItem('filterCat', sc);
    } catch (e) {}

    let currMinTime = Infinity;
    let currMaxTime = -Infinity;
    const startLimit = selectedStartDate ? selectedStartDate.getTime() : null;
    const endLimit = selectedEndDate ? selectedEndDate.getTime() + 86399999 : (startLimit ? startLimit + 86399999 : null);

    // Filtrado general (incluye excluidos para la tabla, pero los separamos para KPIs y Gráficos)
    filteredTransactions = allTransactions.filter(t => {
        const passYear = sy === 'all' || t.year.toString() === sy;
        const passCat = sc === 'all' || t.category === sc;
        let passDate = true;
        if (startLimit && endLimit) passDate = t.timestamp >= startLimit && t.timestamp <= endLimit;
        if (passYear && passCat && passDate) {
            if (!t.excluded) {
                if (t.timestamp < currMinTime) currMinTime = t.timestamp;
                if (t.timestamp > currMaxTime) currMaxTime = t.timestamp;
            }
            return true;
        }
        return false;
    });

    const activeTxs = filteredTransactions.filter(t => !t.excluded);
    const excludedCount = filteredTransactions.length - activeTxs.length;

    const expenseTxs = activeTxs.filter(t => t.type === 'ex');
    const incomeTxs = activeTxs.filter(t => t.type === 'in');

    const totalExpense = expenseTxs.reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = incomeTxs.reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpense;
    const txCount = expenseTxs.length;
    const avgTicket = txCount > 0 ? totalExpense / txCount : 0;

    animateValue(document.getElementById('kpiTotal'), totalExpense, true);
    animateValue(document.getElementById('kpiTxCount'), activeTxs.length, false);

    const incomeEl = document.getElementById('kpiIncomeTotal');
    if (incomeEl) incomeEl.innerText = `+${formatCur(totalIncome)}`;

    // Balance Neto / Flujo de Caja
    const netEl = document.getElementById('kpiNetBalance');
    const rateEl = document.getElementById('kpiSavingsRate');
    if (netEl) {
        if (totalIncome > 0) {
            netEl.innerText = (netBalance >= 0 ? '+' : '') + formatCur(netBalance);
            netEl.className = `text-2xl sm:text-3xl font-extrabold tracking-tight blur-data tabular-nums truncate ${netBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`;
        } else {
            netEl.innerText = `-${formatCur(totalExpense)}`;
            netEl.className = 'text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight blur-data tabular-nums truncate';
        }
    }
    if (rateEl) {
        if (totalIncome > 0) {
            const savingsPct = ((netBalance / totalIncome) * 100).toFixed(1);
            rateEl.innerText = `${savingsPct}% ahorro`;
            rateEl.className = `text-xs font-bold px-2 py-0.5 rounded-md tabular-nums blur-data ${netBalance >= 0 ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300'}`;
        } else {
            rateEl.innerText = 'Solo gastos';
            rateEl.className = 'text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 tabular-nums';
        }
    }

    const avgTicketEl = document.getElementById('kpiAvgTicket');
    if (avgTicketEl) avgTicketEl.innerText = `(~${formatCur(avgTicket)}/gasto)`;

    const exclBadge = document.getElementById('kpiExcludedCount');
    if (exclBadge) {
        exclBadge.innerText = `${excludedCount} excl.`;
        exclBadge.classList.toggle('hidden', excludedCount === 0);
    }

    let currentDays = 1;
    if (startLimit) {
        currentDays = Math.max(1, Math.round((endLimit - startLimit) / 86400000));
    } else if (expenseTxs.length > 1 && currMaxTime !== -Infinity) {
        currentDays = Math.max(1, Math.round((currMaxTime - currMinTime) / 86400000) + 1);
    }
    const dailyAvg = txCount > 0 ? totalExpense / currentDays : 0;
    animateValue(document.getElementById('kpiAvg'), dailyAvg, true);

    // Comparativa con periodo previo
    let prevTotal = 0, prevDailyAvg = 0, hasPrevData = false;
    if (sy !== 'all' && !startLimit) {
        const prevYear = parseInt(sy, 10) - 1;
        const prevTxs = allTransactions.filter(t => !t.excluded && t.type === 'ex' && t.year === prevYear && (sc === 'all' || t.category === sc));
        if (prevTxs.length > 0) {
            hasPrevData = true;
            prevTotal = prevTxs.reduce((s, t) => s + t.amount, 0);
            const pMin = Math.min(...prevTxs.map(t => t.timestamp));
            const pMax = Math.max(...prevTxs.map(t => t.timestamp));
            prevDailyAvg = prevTotal / Math.max(1, Math.round((pMax - pMin) / 86400000) + 1);
        }
    } else if (startLimit) {
        const duration = endLimit - startLimit;
        const prevTxs = allTransactions.filter(t =>
            !t.excluded && t.type === 'ex' &&
            t.timestamp >= (startLimit - duration) &&
            t.timestamp < startLimit &&
            (sc === 'all' || t.category === sc)
        );
        if (prevTxs.length > 0) {
            hasPrevData = true;
            prevTotal = prevTxs.reduce((s, t) => s + t.amount, 0);
            prevDailyAvg = prevTotal / Math.max(1, Math.round(duration / 86400000));
        }
    }

    function updateCompUI(elId, curr, prev) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (hasPrevData && prev > 0) {
            const pct = ((curr - prev) / prev) * 100;
            const isLess = pct <= 0;
            const icon = isLess ? '<i class="fa-solid fa-arrow-trend-down mr-1"></i>' : '<i class="fa-solid fa-arrow-trend-up mr-1"></i>';
            const colorClass = isLess ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
            el.innerHTML = `<span class="${colorClass}">${icon}${Math.abs(pct).toFixed(1)}% vs prev.</span>`;
        } else {
            el.innerHTML = `<span class="text-slate-400 font-normal">Periodo base</span>`;
        }
    }

    updateCompUI('kpiTotalComp', totalExpense, prevTotal);
    updateCompUI('kpiAvgComp', dailyAvg, prevDailyAvg);

    // Presupuesto del último mes activo en vista
    let recentMonthTotal = 0;
    let mostRecentSortKey = null;
    const bLabel = document.getElementById('budgetMonthLabel');
    if (expenseTxs.length > 0) {
        mostRecentSortKey = expenseTxs[0].sortKey;
        recentMonthTotal = expenseTxs
            .filter(t => t.sortKey === mostRecentSortKey)
            .reduce((s, t) => s + t.amount, 0);
        if (bLabel) bLabel.innerText = expenseTxs[0].monthYearLabel;
    } else if (bLabel) {
        bLabel.innerText = "Mes";
    }

    const bLimit = document.getElementById('budgetLimitDisplay');
    if (bLimit) bLimit.innerText = formatComp(monthlyBudget) + ' €';
    animateValue(document.getElementById('budgetSpent'), recentMonthTotal, true);

    let pct = (recentMonthTotal / monthlyBudget) * 100;
    if (isNaN(pct) || !isFinite(pct)) pct = 0;

    const bProg = document.getElementById('budgetProgress');
    const bCard = document.getElementById('budgetCard');
    const bStatus = document.getElementById('budgetStatusText');
    const bPctText = document.getElementById('budgetPctText');

    if (bPctText) bPctText.innerText = `${pct.toFixed(0)}%`;
    if (bProg) {
        bProg.style.width = Math.min(pct, 100) + '%';
        bProg.classList.remove('bg-emerald-500', 'bg-amber-500', 'bg-red-500');
        bCard?.classList.remove('border-l-emerald-500', 'border-l-amber-500', 'border-l-red-500');

        if (pct >= 100) {
            bProg.classList.add('bg-red-500');
            bCard?.classList.add('border-l-red-500');
            if (bStatus) bStatus.innerText = `Excedido en ${formatCur(recentMonthTotal - monthlyBudget)}`;
        } else if (pct >= 80) {
            bProg.classList.add('bg-amber-500');
            bCard?.classList.add('border-l-amber-500');
            if (bStatus) bStatus.innerText = `Disponible: ${formatCur(monthlyBudget - recentMonthTotal)}`;
        } else {
            bProg.classList.add('bg-emerald-500');
            bCard?.classList.add('border-l-emerald-500');
            if (bStatus) bStatus.innerText = `Disponible: ${formatCur(monthlyBudget - recentMonthTotal)}`;
        }
    }

    renderCategorySubBudgets(expenseTxs, mostRecentSortKey);
    renderActiveFiltersBar();
    updateCharts(activeTxs, expenseTxs);
    updateTopComercios(expenseTxs);
    updateTableOnly();
}

// Renderizado de Sub-presupuestos por Categoría (Feature 5)
function renderCategorySubBudgets(expenseTxs, targetSortKey) {
    const listEl = document.getElementById('categoryBudgetsList');
    if (!listEl) return;

    const rulesWithBudget = categoryRules.filter(r => Number(r.budget) > 0);
    if (!rulesWithBudget.length) {
        listEl.innerHTML = `<p class="text-[11px] text-slate-400 italic">No has definido topes por categoría. Pulsa "Configurar" para asignar límites mensuales.</p>`;
        return;
    }

    const monthTxs = targetSortKey ? expenseTxs.filter(t => t.sortKey === targetSortKey) : [];
    const spentByCat = new Map();
    monthTxs.forEach(t => {
        spentByCat.set(t.category, (spentByCat.get(t.category) || 0) + t.amount);
    });

    listEl.innerHTML = rulesWithBudget.map(r => {
        const spent = spentByCat.get(r.category) || 0;
        const limit = Number(r.budget);
        const pct = Math.min(100, Math.round((spent / limit) * 100));
        const isOver = spent > limit;
        const barColor = isOver ? '#ef4444' : (pct >= 80 ? '#f59e0b' : r.color);

        return `
        <div class="text-xs">
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-700 dark:text-slate-200 truncate">${escapeHTML(r.emoji || '')} ${escapeHTML(r.category)}</span>
                <span class="tabular-nums font-semibold ${isOver ? 'text-red-500 font-bold' : 'text-slate-500 dark:text-slate-400'} blur-data">
                    ${formatCur(spent)} / ${formatComp(limit)}€
                </span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div class="h-1.5 rounded-full transition-all duration-500" style="width:${pct}%; background-color:${barColor}"></div>
            </div>
        </div>`;
    }).join('');
}

function renderActiveFiltersBar() {
    const bar = document.getElementById('activeFiltersBar');
    const chipsContainer = document.getElementById('activeFilterChips');
    const yFilt = document.getElementById('yearFilter');
    const cFilt = document.getElementById('categoryFilter');
    const typeFilt = document.getElementById('txTypeFilter');
    const tSearch = document.getElementById('tableSearch');
    if (!bar || !chipsContainer) return;

    const chips = [];
    if (yFilt && yFilt.value !== 'all') {
        chips.push({ label: `Año: ${escapeHTML(yFilt.value)}`, action: () => { yFilt.value = 'all'; updateDashboard(); } });
    }
    if (cFilt && cFilt.value !== 'all') {
        chips.push({ label: `Categoría: ${escapeHTML(cFilt.value)}`, action: () => { cFilt.value = 'all'; updateDashboard(); } });
    }
    if (typeFilt && typeFilt.value !== 'all') {
        const labelMap = { expenses: 'Solo Gastos', income: 'Solo Ingresos', notes: 'Con Nota', excluded: 'Excluidos' };
        chips.push({ label: `Vista: ${labelMap[typeFilt.value] || typeFilt.value}`, action: () => { typeFilt.value = 'all'; updateTableOnly(); renderActiveFiltersBar(); } });
    }
    if (selectedStartDate) {
        const rangeText = selectedEndDate
            ? `${selectedStartDate.toLocaleDateString('es-ES')} - ${selectedEndDate.toLocaleDateString('es-ES')}`
            : selectedStartDate.toLocaleDateString('es-ES');
        chips.push({ label: `Fecha: ${rangeText}`, action: () => { selectedStartDate = null; selectedEndDate = null; updateCalendarBtnText(); updateCalendarUI(); updateDashboard(); } });
    }
    if (tSearch && tSearch.value.trim() !== '') {
        chips.push({ label: `Búsqueda: "${escapeHTML(tSearch.value.trim())}"`, action: () => { tSearch.value = ''; document.getElementById('clearSearchBtn')?.classList.add('hidden'); updateTableOnly(); renderActiveFiltersBar(); } });
    }

    if (chips.length === 0) {
        bar.classList.add('hidden');
        bar.classList.remove('flex');
        return;
    }

    bar.classList.remove('hidden');
    bar.classList.add('flex');
    chipsContainer.innerHTML = chips.map((c, idx) => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 font-bold text-xs shadow-sm">
            ${c.label}
            <button type="button" data-chip-idx="${idx}" class="remove-chip-btn text-slate-400 hover:text-red-500 focus:outline-none">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </span>
    `).join('');

    chipsContainer.querySelectorAll('.remove-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-chip-idx'), 10);
            if (chips[idx]) chips[idx].action();
        });
    });
}

// =========================================================================
// MOTOR DE GRÁFICOS (GASTOS VS INGRESOS + DISTRIBUCIÓN)
// =========================================================================
function updateCharts(activeTxs, expenseTxs) {
    const barCtx = document.getElementById('barChart')?.getContext('2d');
    const dCtx = document.getElementById('doughnutChart')?.getContext('2d');
    if (!barCtx || !dCtx) return;

    const monthlyMap = new Map();
    activeTxs.forEach(t => {
        if (!monthlyMap.has(t.sortKey)) {
            monthlyMap.set(t.sortKey, { sortKey: t.sortKey, label: t.monthYearLabel, expense: 0, income: 0 });
        }
        if (t.type === 'in') monthlyMap.get(t.sortKey).income += t.amount;
        else monthlyMap.get(t.sortKey).expense += t.amount;
    });
    const sData = Array.from(monthlyMap.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1]);
    const hasAnyIncome = sData.some(d => d.income > 0);

    if (chartInstances.bar) chartInstances.bar.destroy();

    const gradExp = barCtx.createLinearGradient(0, 0, 0, 320);
    gradExp.addColorStop(0, evolutionChartType === 'line' ? 'rgba(59, 130, 246, 0.42)' : 'rgba(59, 130, 246, 0.85)');
    gradExp.addColorStop(1, evolutionChartType === 'line' ? 'rgba(59, 130, 246, 0.02)' : 'rgba(59, 130, 246, 0.35)');

    const datasets = [
        {
            label: 'Gastos',
            data: sData.map(d => d.expense),
            backgroundColor: gradExp,
            borderColor: '#3b82f6',
            borderWidth: 2.5,
            borderRadius: evolutionChartType === 'bar' ? 6 : 0,
            fill: evolutionChartType === 'line',
            tension: 0.25,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            order: 2
        },
        {
            label: 'Objetivo Presupuesto',
            type: 'line',
            data: sData.map(() => monthlyBudget),
            borderColor: 'rgba(245, 158, 11, 0.7)',
            borderWidth: 1.5,
            borderDash: [6, 6],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            order: 1
        }
    ];

    if (hasAnyIncome) {
        datasets.push({
            label: 'Ingresos / Abonos',
            data: sData.map(d => d.income),
            backgroundColor: evolutionChartType === 'bar' ? 'rgba(16, 185, 129, 0.75)' : 'rgba(16, 185, 129, 0.12)',
            borderColor: '#10b981',
            borderWidth: 2,
            borderRadius: evolutionChartType === 'bar' ? 6 : 0,
            fill: false,
            tension: 0.25,
            pointRadius: 3,
            order: 2
        });
    }

    chartInstances.bar = new Chart(barCtx, {
        type: evolutionChartType,
        data: {
            labels: sData.map(d => d.label),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: hasAnyIncome, position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
                tooltip: {
                    padding: 10,
                    callbacks: { label: c => ` ${c.dataset.label}: ${formatCur(c.raw)}` }
                }
            },
            onHover: (e, el) => {
                if (e?.native?.target) e.native.target.style.cursor = el.length ? 'pointer' : 'default';
            },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const item = sData[elements[0].index];
                    if (item) {
                        const y = Math.floor(item.sortKey / 100);
                        const m = (item.sortKey % 100) - 1;
                        selectedStartDate = new Date(y, m, 1);
                        selectedEndDate = new Date(y, m + 1, 0);
                        currentCalDate = new Date(y, m, 1);
                        updateCalendarBtnText();
                        updateCalendarUI();
                        updateDashboard();
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    ticks: { font: { size: 11 }, maxTicksLimit: 6, callback: v => formatComp(v) + ' €' }
                },
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 }
                }
            }
        }
    });

    // Gráfico de Distribución (Solo sobre Gastos activos)
    const catMap = new Map();
    expenseTxs.forEach(t => {
        if (!catMap.has(t.category)) catMap.set(t.category, { amount: 0, color: t.color, emoji: t.emoji });
        catMap.get(t.category).amount += t.amount;
    });

    const allSlices = Array.from(catMap.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(e => ({ label: e[0], ...e[1] }));

    const finalSlices = [];
    let restoAmount = 0;
    window.currentOtrosCategories = [];

    allSlices.forEach((cat, index) => {
        if (index >= 8) {
            restoAmount += cat.amount;
            window.currentOtrosCategories.push(cat.label);
        } else {
            finalSlices.push(cat);
        }
    });

    if (restoAmount > 0) {
        finalSlices.push({ label: 'Resto de Gastos', amount: restoAmount, color: '#94a3b8', emoji: '🧩' });
    }

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
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '66%',
                layout: { padding: 6 },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10, weight: '600' } }
                    },
                    tooltip: {
                        padding: 10,
                        callbacks: {
                            label: c => {
                                const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                                const pct = ((c.raw / total) * 100).toFixed(1);
                                return ` ${c.label}: ${formatCur(c.raw)} (${pct}%)`;
                            }
                        }
                    }
                },
                onHover: (e, el) => {
                    if (e?.native?.target) e.native.target.style.cursor = el[0] ? 'pointer' : 'default';
                },
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

function openExpandedChart() {
    const modal = document.getElementById('expandedChartModal');
    const ctx = document.getElementById('expandedDoughnutCanvas')?.getContext('2d');
    if (!modal || !ctx) return;

    const catMap = new Map();
    filteredTransactions.filter(t => !t.excluded && t.type === 'ex').forEach(t => {
        if (!catMap.has(t.category)) catMap.set(t.category, { amount: 0, color: t.color });
        catMap.get(t.category).amount += t.amount;
    });
    const allSlices = Array.from(catMap.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(e => ({ label: e[0], ...e[1] }));

    if (chartInstances.expandedDoughnut) chartInstances.expandedDoughnut.destroy();

    chartInstances.expandedDoughnut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: allSlices.map(d => d.label),
            datasets: [{
                data: allSlices.map(d => d.amount),
                backgroundColor: allSlices.map(d => d.color),
                borderWidth: 2,
                hoverOffset: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '52%',
            layout: { padding: 28 },
            plugins: {
                legend: {
                    position: 'right',
                    labels: { usePointStyle: true, boxWidth: 12, padding: 16, font: { size: 13, weight: 'bold' } }
                },
                tooltip: {
                    padding: 14,
                    bodyFont: { size: 14 },
                    callbacks: {
                        label: c => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                            return ` ${c.label}: ${formatCur(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)`;
                        }
                    }
                }
            },
            onHover: (e, el) => {
                if (e?.native?.target) e.native.target.style.cursor = el[0] ? 'pointer' : 'default';
            },
            onClick: (e, elements) => {
                if (elements.length > 0 && window.openDrilldown) {
                    closeModal(modal);
                    setTimeout(() => window.openDrilldown(chartInstances.expandedDoughnut.data.labels[elements[0].index]), 220);
                }
            }
        }
    });
    updateChartTheme();
    openModal(modal);
}

function updateTopComercios(expenseTxs) {
    const list = document.getElementById('topComerciosList');
    if (!list) return;

    const merchantMap = new Map();
    expenseTxs.forEach(t => {
        const name = t.normalizedConcept;
        if (!name || name.toLowerCase() === "varios") return;
        if (!merchantMap.has(name)) merchantMap.set(name, { count: 0, amount: 0, color: t.color });
        const m = merchantMap.get(name);
        m.count++;
        m.amount += t.amount;
    });

    const top5 = Array.from(merchantMap.entries())
        .sort((a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount)
        .slice(0, 5)
        .map(e => ({ name: e[0], ...e[1] }));

    if (!top5.length) {
        list.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-8">Sin datos suficientes en este filtro.</p>`;
        return;
    }

    list.innerHTML = top5.map((m, i) => {
        const safeName = escapeHTML(m.name);
        return `
        <button type="button" data-merchant="${safeName}" class="top-merchant-item w-full text-left flex items-center justify-between p-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 group">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs flex-shrink-0 tabular-nums" style="background-color: ${m.color}20; color: ${m.color}; border: 1px solid ${m.color}40">#${i + 1}</div>
                <div class="flex flex-col truncate">
                    <span class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${safeName}</span>
                    <span class="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">${m.count} ${m.count === 1 ? 'cargo' : 'cargos'}</span>
                </div>
            </div>
            <div class="text-right ml-2 flex-shrink-0">
                <span class="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 block blur-data tabular-nums">${formatCur(m.amount)}</span>
            </div>
        </button>`;
    }).join('');

    list.querySelectorAll('.top-merchant-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const merchant = btn.getAttribute('data-merchant');
            const tSearch = document.getElementById('tableSearch');
            const clearBtn = document.getElementById('clearSearchBtn');
            if (tSearch && merchant) {
                tSearch.value = merchant;
                clearBtn?.classList.remove('hidden');
                updateTableOnly();
                renderActiveFiltersBar();
                tSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}

// =========================================================================
// TABLA VIRTUALIZADA + SELECCIÓN MÚLTIPLE + EDICIÓN (Features 6, 7, 8, 15)
// =========================================================================
function updateTableOnly() {
    const tInfo = document.getElementById('tableCountInfo');
    const tSearch = document.getElementById('tableSearch');
    const typeFilter = document.getElementById('txTypeFilter')?.value || 'all';
    const scrollContainer = document.getElementById('tableScrollContainer');
    if (!tInfo || !tSearch) return;

    const search = tSearch.value.trim().toUpperCase();

    currentlyDisplayedTableData = filteredTransactions.filter(t => {
        if (typeFilter === 'expenses' && (t.type !== 'ex' || t.excluded)) return false;
        if (typeFilter === 'income' && (t.type !== 'in' || t.excluded)) return false;
        if (typeFilter === 'notes' && !t.note) return false;
        if (typeFilter === 'excluded' && !t.excluded) return false;

        if (!search) return true;
        return t.description.includes(search) ||
               t.category.toUpperCase().includes(search) ||
               (t.note && t.note.toUpperCase().includes(search));
    });

    currentlyDisplayedTableData.sort((a, b) => {
        let valA = a[tableSortField];
        let valB = b[tableSortField];
        if (typeof valA === 'string') {
            const cmp = valA.localeCompare(valB, 'es');
            return tableSortAsc ? cmp : -cmp;
        }
        return tableSortAsc ? valA - valB : valB - valA;
    });

    tInfo.innerText = `${currentlyDisplayedTableData.length} movs.`;
    tInfo.classList.remove('hidden');

    if (scrollContainer) scrollContainer.scrollTop = 0;
    renderVirtualTableRows();
    updateSelectAllCheckboxState();
}

function renderVirtualTableRows() {
    const table = document.getElementById('transactionsTable');
    const scrollContainer = document.getElementById('tableScrollContainer');
    if (!table || !scrollContainer) return;

    const totalRows = currentlyDisplayedTableData.length;
    if (totalRows === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-16 text-center">
                    <div class="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                        <i class="fa-solid fa-magnifying-glass-minus text-4xl mb-3 opacity-50"></i>
                        <p class="text-sm font-bold text-slate-600 dark:text-slate-400">No hay movimientos que coincidan con los filtros</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    let startIdx = 0;
    let endIdx = totalRows;

    if (!isPrintingMode && totalRows > 60) {
        const scrollTop = scrollContainer.scrollTop;
        const viewportHeight = scrollContainer.clientHeight || 600;
        startIdx = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_BUFFER);
        endIdx = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_BUFFER);
    } else if (isPrintingMode) {
        endIdx = Math.min(totalRows, 250);
    }

    const topSpacerHeight = startIdx * VIRTUAL_ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, (totalRows - endIdx) * VIRTUAL_ROW_HEIGHT);

    const visibleSlice = currentlyDisplayedTableData.slice(startIdx, endIdx);

    let html = '';
    if (topSpacerHeight > 0) {
        html += `<tr class="virtual-spacer-row" style="height: ${topSpacerHeight}px"><td colspan="5"></td></tr>`;
    }

    html += visibleSlice.map(t => {
        const safeId = escapeHTML(t.id);
        const safeDesc = escapeHTML(t.description);
        const safeCat = escapeHTML(t.category);
        const safeNote = escapeHTML(t.note || '');
        const isChecked = selectedTxIds.has(t.id) ? 'checked' : '';
        const isIncome = t.type === 'in';
        const amountColor = isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
        const sign = isIncome ? '+' : '-';

        return `
        <tr class="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors group ${t.excluded ? 'tx-excluded' : ''}" data-row-id="${safeId}">
            <td class="no-print px-3 py-3 text-center whitespace-nowrap">
                <input type="checkbox" data-tx-cb="${safeId}" ${isChecked} class="tx-row-cb w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
            </td>
            <td class="px-3 sm:px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 font-medium tabular-nums">${t.dateFormatted}</td>
            <td class="px-3 sm:px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 max-w-[170px] sm:max-w-xs md:max-w-md truncate font-medium" title="${safeDesc}">
                <div class="flex items-center gap-1.5 truncate">
                    <span class="truncate">${safeDesc}</span>
                    ${t.excluded ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex-shrink-0">Excluido</span>' : ''}
                </div>
                ${safeNote ? `<div class="text-[11px] text-blue-600 dark:text-blue-400 font-semibold truncate mt-0.5"><i class="fa-regular fa-note-sticky mr-1"></i>${safeNote}</div>` : ''}
            </td>
            <td class="px-3 sm:px-4 py-3 whitespace-nowrap text-xs">
                <div class="flex items-center gap-1">
                    <button type="button" class="cat-badge px-2.5 py-0.5 inline-flex items-center gap-1 cursor-pointer text-[11px] font-bold rounded-full hover:scale-105 transition-transform" data-cat="${safeCat}" style="color: ${t.color}; background-color: ${t.color}18; border: 1px solid ${t.color}35" title="Filtrar por ${safeCat}">
                        <span>${escapeHTML(t.emoji || '🏷️')}</span> ${safeCat}${t.hasOverride ? ' *' : ''}
                    </button>
                    <button type="button" class="no-print tx-edit-trigger opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center" data-tx-id="${safeId}" title="Editar categoría, añadir nota o crear regla">
                        <i class="fa-solid fa-pen-to-square text-[11px] pointer-events-none"></i>
                    </button>
                    <button type="button" class="no-print tx-exclude-trigger opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-lg ${t.excluded ? 'text-amber-500 opacity-100' : 'text-slate-400 hover:text-amber-600'} hover:bg-amber-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center" data-tx-id="${safeId}" title="${t.excluded ? 'Volver a incluir en el cómputo' : 'Ignorar / Excluir este movimiento'}">
                        <i class="fa-solid fa-ban text-[11px] pointer-events-none"></i>
                    </button>
                </div>
            </td>
            <td class="px-4 sm:px-6 py-3 whitespace-nowrap text-xs sm:text-sm text-right font-extrabold ${amountColor} tabular-nums">
                <span class="tx-amount-val">${sign}<span class="blur-data">${formatCur(t.amount)}</span></span>
            </td>
        </tr>`;
    }).join('');

    if (bottomSpacerHeight > 0) {
        html += `<tr class="virtual-spacer-row" style="height: ${bottomSpacerHeight}px"><td colspan="5"></td></tr>`;
    }

    table.innerHTML = html;
}

function updateSelectAllCheckboxState() {
    const selectAllCb = document.getElementById('selectAllTxCb');
    if (!selectAllCb) return;
    if (!currentlyDisplayedTableData.length) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
        return;
    }
    const visibleSelected = currentlyDisplayedTableData.filter(t => selectedTxIds.has(t.id)).length;
    selectAllCb.checked = visibleSelected === currentlyDisplayedTableData.length;
    selectAllCb.indeterminate = visibleSelected > 0 && visibleSelected < currentlyDisplayedTableData.length;
}

// Barra Flotante Calculadora en Vivo por Selección Múltiple (Feature 8)
function updateBulkActionBarUI() {
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const sumEl = document.getElementById('bulkSelectedSum');
    const avgEl = document.getElementById('bulkSelectedAvg');
    if (!bar) return;

    if (selectedTxIds.size === 0) {
        bar.classList.add('hidden');
        bar.classList.remove('flex');
        return;
    }

    const selectedTxs = allTransactions.filter(t => selectedTxIds.has(t.id));
    if (!selectedTxs.length) {
        selectedTxIds.clear();
        bar.classList.add('hidden');
        bar.classList.remove('flex');
        return;
    }

    // Suma neta (Ingresos suman, Gastos restan; si todo son gastos mostramos el valor total seleccionado)
    const allAreExpenses = selectedTxs.every(t => t.type === 'ex');
    const sumVal = allAreExpenses
        ? selectedTxs.reduce((acc, t) => acc + t.amount, 0)
        : selectedTxs.reduce((acc, t) => acc + (t.type === 'in' ? t.amount : -t.amount), 0);
    const avgVal = sumVal / selectedTxs.length;

    if (countEl) countEl.innerText = selectedTxs.length.toString();
    if (sumEl) sumEl.innerText = formatCur(sumVal);
    if (avgEl) avgEl.innerText = `(media: ${formatCur(Math.abs(avgVal))})`;

    bar.classList.remove('hidden');
    bar.classList.add('flex');
}

function updateSortHeadersUI() {
    document.querySelectorAll('.sortable-th').forEach(th => {
        const field = th.getAttribute('data-sort');
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (field === tableSortField) {
            icon.className = `fa-solid ${tableSortAsc ? 'fa-sort-up' : 'fa-sort-down'} ml-1 text-blue-500 sort-icon`;
        } else {
            icon.className = 'fa-solid fa-sort ml-1 opacity-40 sort-icon';
        }
    });
}

// =========================================================================
// EDICIÓN INDIVIDUAL DE MOVIMIENTO Y EXCLUSIÓN (Features 6 & 7)
// =========================================================================
function openTxEditModal(txId) {
    const tx = allTransactions.find(t => t.id === txId);
    const modal = document.getElementById('txEditModal');
    if (!tx || !modal) return;

    editingSingleTxId = txId;
    document.getElementById('txEditConceptDisplay').innerText = tx.description;
    document.getElementById('txEditDateAmountDisplay').innerText = `${tx.dateFormatted} • ${tx.type === 'in' ? '+' : '-'}${formatCur(tx.amount)}`;

    const modeSelect = document.getElementById('txEditModeSelect');
    const kwWrapper = document.getElementById('txEditKeywordWrapper');
    const kwInput = document.getElementById('txEditKeywordInput');
    const catSelect = document.getElementById('txEditCategorySelect');
    const noteInput = document.getElementById('txEditNoteInput');
    const excludeCb = document.getElementById('txEditExcludeCb');

    if (modeSelect) modeSelect.value = 'single';
    if (kwWrapper) kwWrapper.classList.add('hidden');
    if (kwInput) kwInput.value = tx.normalizedConcept;

    if (catSelect) {
        catSelect.innerHTML = categoryRules.map(r =>
            `<option value="${escapeHTML(r.category)}" ${r.category === tx.category ? 'selected' : ''}>${escapeHTML(r.emoji || '🏷️')} ${escapeHTML(r.category)}</option>`
        ).join('');
    }
    if (noteInput) noteInput.value = tx.note || '';
    if (excludeCb) excludeCb.checked = Boolean(tx.excluded);

    openModal(modal);
}

function toggleExcludeSingleTx(txId) {
    const tx = allTransactions.find(t => t.id === txId);
    if (!tx) return;
    if (!txCustomMeta[txId]) txCustomMeta[txId] = {};
    txCustomMeta[txId].excluded = !tx.excluded;
    saveTxMetaToStorage();
    applyCategorization(allTransactions, categoryRules);
    updateDashboard();
    window.showToast(txCustomMeta[txId].excluded ? 'Movimiento excluido del cómputo.' : 'Movimiento incluido de nuevo.', 'info', 2500);
}

// =========================================================================
// PALETA DE COMANDOS RÁPIDA CTRL+K (Feature 13)
// =========================================================================
let cmdPaletteItems = [];
let cmdActiveIndex = 0;

function buildCommandPaletteItems(query = '') {
    const q = query.trim().toLowerCase();
    const actions = [
        { icon: 'fa-database text-blue-500', title: 'Abrir Almacén y Copias de Seguridad', sub: 'Gestionar datasets o exportar .JSON', run: () => { refreshLocalVault(); openModal(document.getElementById('vaultModal')); } },
        { icon: 'fa-tags text-purple-500', title: 'Configurar Reglas y Topes por Categoría', sub: 'Editar diccionario y sub-presupuestos', run: () => openDictionaryEditor() },
        { icon: 'fa-eye-slash text-amber-500', title: 'Alternar Modo Incógnito', sub: 'Ocultar o mostrar importes sensibles (Alt+I)', run: () => document.getElementById('incognitoToggle')?.click() },
        { icon: 'fa-moon text-indigo-500', title: 'Cambiar Tema Claro / Oscuro', sub: 'Alternar apariencia visual', run: () => document.getElementById('themeToggle')?.click() },
        { icon: 'fa-print text-slate-500', title: 'Imprimir / Guardar Informe en PDF', sub: 'Formato ejecutivo A4', run: () => triggerPrintReport() },
        { icon: 'fa-camera text-emerald-500', title: 'Exportar Infografía PNG', sub: 'Descargar resumen visual en alta resolución', run: () => exportImage() },
        { icon: 'fa-file-csv text-emerald-600', title: 'Exportar Movimientos Filtrados a CSV', sub: 'Formato compatible con Excel', run: () => exportCsv() },
        { icon: 'fa-file-export text-blue-600', title: 'Descargar Copia de Seguridad Total (.JSON)', sub: 'Backup completo de archivos, reglas y notas', run: () => exportFullBackupJSON() },
        { icon: 'fa-filter-circle-xmark text-red-500', title: 'Restablecer Todos los Filtros', sub: 'Mostrar todos los años y categorías', run: () => document.getElementById('clearAllFiltersBtn')?.click() },
        { icon: 'fa-wand-magic-sparkles text-purple-500', title: 'Cargar Escenario de Demostración', sub: 'Generar datos de prueba con ingresos y gastos', run: () => loadMockData() }
    ];

    // Añadir categorías dinámicamente
    const cats = [...new Set(allTransactions.map(t => t.category))].sort();
    cats.forEach(c => {
        actions.push({
            icon: 'fa-tag text-blue-400',
            title: `Filtrar Categoría: ${c}`,
            sub: 'Acotar dashboard a esta categoría',
            run: () => window.setCategoryFilter(c)
        });
        actions.push({
            icon: 'fa-microscope text-indigo-400',
            title: `Radiografía Drilldown: ${c}`,
            sub: 'Abrir análisis detallado de comercios',
            run: () => window.openDrilldown(c)
        });
    });

    // Añadir años disponibles
    const years = [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a);
    years.forEach(y => {
        actions.push({
            icon: 'fa-calendar text-emerald-500',
            title: `Filtrar Año Fiscal: ${y}`,
            sub: `Ver solo movimientos de ${y}`,
            run: () => {
                const yf = document.getElementById('yearFilter');
                if (yf) { yf.value = String(y); updateDashboard(); }
            }
        });
    });

    cmdPaletteItems = actions.filter(item =>
        !q || item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    ).slice(0, 20);
    cmdActiveIndex = 0;
    renderCommandPaletteList();
}

function renderCommandPaletteList() {
    const list = document.getElementById('cmdResultsList');
    if (!list) return;
    if (!cmdPaletteItems.length) {
        list.innerHTML = `<li class="p-6 text-center text-xs text-slate-400 italic">No se encontraron comandos para esa búsqueda.</li>`;
        return;
    }
    list.innerHTML = cmdPaletteItems.map((item, idx) => `
        <li data-cmd-idx="${idx}" class="cmd-item px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${idx === cmdActiveIndex ? 'cmd-item-active font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}">
            <div class="flex items-center gap-3 min-w-0">
                <i class="fa-solid ${item.icon} w-5 text-center text-sm flex-shrink-0"></i>
                <div class="truncate">
                    <div class="text-xs sm:text-sm truncate">${escapeHTML(item.title)}</div>
                    <div class="text-[11px] text-slate-400 font-normal truncate">${escapeHTML(item.sub)}</div>
                </div>
            </div>
            <i class="fa-solid fa-arrow-turn-down fa-rotate-90 text-[10px] opacity-40 ml-2"></i>
        </li>
    `).join('');

    list.querySelectorAll('.cmd-item').forEach(li => {
        li.addEventListener('click', () => {
            const idx = parseInt(li.getAttribute('data-cmd-idx'), 10);
            executeCommandPaletteItem(idx);
        });
    });
}

function executeCommandPaletteItem(idx) {
    const item = cmdPaletteItems[idx];
    const modal = document.getElementById('cmdPaletteModal');
    if (!item) return;
    closeModal(modal);
    setTimeout(() => item.run(), 120);
}

function openCommandPalette() {
    const modal = document.getElementById('cmdPaletteModal');
    const inp = document.getElementById('cmdSearchInput');
    if (!modal || !inp) return;
    inp.value = '';
    buildCommandPaletteItems('');
    openModal(modal);
    setTimeout(() => inp.focus(), 60);
}

// =========================================================================
// MODO IMPRESIÓN / INFORME PDF EJECUTIVO (Feature 14)
// =========================================================================
function triggerPrintReport() {
    if (!filteredTransactions.length) {
        window.showToast('Carga datos antes de generar el informe PDF.', 'warning');
        return;
    }
    const dateEl = document.getElementById('printReportDate');
    const sumEl = document.getElementById('printReportSummary');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    if (sumEl) {
        const yVal = document.getElementById('yearFilter')?.value || 'all';
        const cVal = document.getElementById('categoryFilter')?.value || 'all';
        sumEl.innerText = `Archivo: ${currentFileName || 'Dataset'} • Año: ${yVal === 'all' ? 'Todos' : yVal} • Categoría: ${cVal === 'all' ? 'Todas' : cVal}`;
    }

    isPrintingMode = true;
    renderVirtualTableRows();
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            isPrintingMode = false;
            renderVirtualTableRows();
        }, 400);
    }, 150);
}

// =========================================================================
// UTILIDADES UI, TOASTS Y MODALES
// =========================================================================
function showLoader(msg) {
    const l = document.getElementById('globalLoader');
    const t = document.getElementById('globalLoaderText');
    if (l) { l.classList.remove('hidden'); l.style.opacity = '1'; }
    if (t) t.innerText = msg || 'Procesando...';
}

function hideLoader() {
    const l = document.getElementById('globalLoader');
    if (l) l.classList.add('hidden');
}

function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const inner = modal.querySelector('.scale-95');
        if (inner) inner.classList.replace('scale-95', 'scale-100');
    });
}

function closeModal(modal) {
    if (!modal || modal.classList.contains('hidden')) return;
    modal.style.opacity = '0';
    const inner = modal.querySelector('.scale-100');
    if (inner) inner.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function animateValue(el, target, isCurrency) {
    if (!el) return;
    const duration = 400;
    const startTime = performance.now();
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        el.innerText = isCurrency ? formatCur(current) : Math.round(current).toString();
        if (progress < 1) requestAnimationFrame(update);
        else el.innerText = isCurrency ? formatCur(target) : target.toString();
    }
    requestAnimationFrame(update);
}

window.showToast = function (msg, type = 'info', dur = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const colors = {
        success: 'bg-emerald-600 border-emerald-500',
        error: 'bg-red-600 border-red-500',
        warning: 'bg-amber-500 border-amber-400',
        info: 'bg-slate-800 dark:bg-slate-800 border-slate-700'
    };
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info text-blue-400'
    };
    const toast = document.createElement('div');
    toast.className = `flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border text-white text-xs sm:text-sm font-semibold toast-enter ${colors[type] || colors.info} max-w-xs w-full pointer-events-auto`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} text-base mt-0.5 flex-shrink-0"></i><span class="flex-1 leading-snug">${escapeHTML(msg)}</span><button class="ml-auto opacity-70 hover:opacity-100 flex-shrink-0 focus:outline-none"><i class="fa-solid fa-xmark"></i></button>`;
    toast.querySelector('button')?.addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => {
        if (!toast.parentElement) return;
        toast.classList.replace('toast-enter', 'toast-leave');
        setTimeout(() => toast.remove(), 250);
    }, dur);
};

window.showConfirmToast = function (msg) {
    return new Promise(resolve => {
        const container = document.getElementById('toastContainer');
        if (!container) { resolve(false); return; }
        const toast = document.createElement('div');
        toast.className = 'flex flex-col gap-3 p-4 rounded-2xl shadow-2xl bg-slate-900 text-white text-xs sm:text-sm font-semibold toast-enter max-w-xs w-full pointer-events-auto border border-slate-700';
        toast.innerHTML = `
            <span class="leading-snug"><i class="fa-solid fa-circle-question mr-2 text-amber-400"></i>${escapeHTML(msg)}</span>
            <div class="flex gap-2">
                <button class="confirm-yes flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl py-1.5 text-xs font-bold transition-colors">Confirmar</button>
                <button class="confirm-no flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-1.5 text-xs font-bold transition-colors">Cancelar</button>
            </div>`;
        container.appendChild(toast);
        toast.querySelector('.confirm-yes').addEventListener('click', () => {
            toast.classList.replace('toast-enter', 'toast-leave');
            setTimeout(() => toast.remove(), 220);
            resolve(true);
        });
        toast.querySelector('.confirm-no').addEventListener('click', () => {
            toast.classList.replace('toast-enter', 'toast-leave');
            setTimeout(() => toast.remove(), 220);
            resolve(false);
        });
    });
};

// =========================================================================
// GESTIÓN DE TEMA, EXPORTACIÓN PNG Y CSV
// =========================================================================
function updateChartTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)';
    Object.values(chartInstances).forEach(chart => {
        if (!chart || !chart.options) return;
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(s => {
                if (s.ticks) s.ticks.color = tickColor;
                if (s.grid) s.grid.color = gridColor;
            });
        }
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = tickColor;
        }
        chart.update('none');
    });
}

function applyTheme(dark) {
    const html = document.documentElement;
    const icon = document.getElementById('themeIcon');
    if (dark) {
        html.classList.add('dark');
        html.classList.remove('light');
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
    } else {
        html.classList.remove('dark');
        html.classList.add('light');
        if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
    }
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
    setTimeout(updateChartTheme, 40);
}

(function () {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') applyTheme(true);
    else if (saved === 'light') applyTheme(false);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme(true);

    if (localStorage.getItem('incognito') === 'true') {
        document.body.classList.add('incognito-active');
        const icon = document.getElementById('incognitoIcon');
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    }
})();

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function exportImage() {
    if (!filteredTransactions.length) {
        window.showToast('Carga datos antes de exportar la infografía.', 'warning');
        return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, 680);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 680);

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('📊 Informe Ejecutivo — Analizador Financiero PWA v8.0', 40, 48);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }), 1160, 48);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(40, 60, 1120, 1);

    const kpis = [
        { label: 'GASTO BRUTO', val: document.getElementById('kpiTotal')?.innerText || '0 €', color: '#3b82f6' },
        { label: 'FLUJO NETO', val: document.getElementById('kpiNetBalance')?.innerText || '0 €', color: '#8b5cf6' },
        { label: 'RITMO DIARIO', val: document.getElementById('kpiAvg')?.innerText || '0 €', color: '#f59e0b' },
        { label: 'ÚLTIMO MES', val: document.getElementById('budgetSpent')?.innerText || '0 €', color: '#10b981' }
    ];

    kpis.forEach((k, i) => {
        const x = 40 + i * 288, y = 76;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        roundRect(ctx, x, y, 268, 96, 14);
        ctx.fill();
        ctx.strokeStyle = k.color + '55';
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, 268, 96, 14);
        ctx.stroke();
        ctx.fillStyle = k.color;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(k.label, x + 18, y + 26);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 25px system-ui, sans-serif';
        ctx.fillText(k.val, x + 18, y + 66);
    });

    const activeExpenses = filteredTransactions.filter(t => !t.excluded && t.type === 'ex');
    const catMap = new Map();
    activeExpenses.forEach(t => {
        if (!catMap.has(t.category)) catMap.set(t.category, { amount: 0, color: t.color });
        catMap.get(t.category).amount += t.amount;
    });
    const cats = Array.from(catMap.entries()).sort((a, b) => b[1].amount - a[1].amount).slice(0, 7);
    const maxAmt = cats[0]?.[1].amount || 1;
    const totalAmt = activeExpenses.reduce((s, t) => s + t.amount, 0) || 1;

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('DESGLOSE PRINCIPAL POR CATEGORÍA DE GASTO', 40, 210);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(40, 218, 1120, 1);

    cats.forEach(([label, data], i) => {
        const y = 232 + i * 56;
        const barW = Math.max(24, (data.amount / maxAmt) * 720);
        const pct = ((data.amount / totalAmt) * 100).toFixed(1) + '%';
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        roundRect(ctx, 40, y, 1120, 46, 10);
        ctx.fill();
        ctx.fillStyle = data.color + '28';
        roundRect(ctx, 40, y, barW + 180, 46, 10);
        ctx.fill();
        ctx.fillStyle = data.color;
        roundRect(ctx, 40, y, 6, 46, 3);
        ctx.fill();
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`${label} (${pct})`, 58, y + 28);
        ctx.fillStyle = data.color;
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatCur(data.amount), 1144, y + 28);
        ctx.textAlign = 'left';
    });

    ctx.fillStyle = '#475569';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Generado localmente con Analizador Financiero PWA v8.0 Pro', 600, 662);

    const link = document.createElement('a');
    const yFilt = document.getElementById('yearFilter');
    link.download = `Informe_Financiero_${yFilt?.value || 'historico'}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.showToast('Infografía PNG exportada correctamente.', 'success');
}

function exportCsv() {
    if (!currentlyDisplayedTableData.length) {
        window.showToast('No hay movimientos en la vista actual para exportar.', 'warning');
        return;
    }
    const rows = [
        ['Fecha', 'Concepto', 'Nota Personal', 'Categoría', 'Tipo', 'Excluido', 'Importe (€)'],
        ...currentlyDisplayedTableData.map(t => [
            t.dateFormatted,
            `"${t.description.replace(/"/g, '""')}"`,
            `"${(t.note || '').replace(/"/g, '""')}"`,
            `"${t.category.replace(/"/g, '""')}"`,
            t.type === 'in' ? 'Ingreso' : 'Gasto',
            t.excluded ? 'Sí' : 'No',
            (t.type === 'in' ? Math.abs(t.amount) : -Math.abs(t.amount)).toFixed(2).replace('.', ',')
        ])
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const yFilt = document.getElementById('yearFilter');
    link.href = URL.createObjectURL(blob);
    link.download = `Movimientos_${yFilt?.value || 'todos'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.showToast('Archivo CSV exportado correctamente.', 'success');
}

// =========================================================================
// CALENDARIO Y DRILLDOWN
// =========================================================================
function updateCalendarUI() {
    const grid = document.getElementById('calDaysGrid');
    const monthYearEl = document.getElementById('calMonthYear');
    const calTotalEl = document.getElementById('calTotalSpend');
    const calSpendLabel = document.getElementById('calSpendLabel');
    if (!grid) return;

    const month = currentCalDate.getMonth();
    const year = currentCalDate.getFullYear();

    if (calendarViewMode === 'week') {
        const dayOfWeek = currentCalDate.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(year, month, currentCalDate.getDate() + diffToMonday);
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59);

        if (monthYearEl) {
            monthYearEl.innerText = `${monday.getDate()} ${monday.toLocaleDateString('es-ES', { month: 'short' })} — ${sunday.getDate()} ${sunday.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}`;
        }
        if (calSpendLabel) calSpendLabel.innerText = 'Gasto en la semana';

        const weekTxs = allTransactions.filter(t => !t.excluded && t.type === 'ex' && t.timestamp >= monday.getTime() && t.timestamp <= sunday.getTime());
        if (calTotalEl) calTotalEl.innerText = formatCur(weekTxs.reduce((s, t) => s + t.amount, 0));

        let html = '';
        for (let i = 0; i < 7; i++) {
            const dObj = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
            const ts = dObj.getTime();
            const daySpend = allTransactions
                .filter(t => !t.excluded && t.type === 'ex' && t.timestamp >= ts && t.timestamp <= ts + 86399999)
                .reduce((s, t) => s + t.amount, 0);

            let cls = 'calendar-day w-full py-2 flex flex-col items-center justify-center rounded-xl cursor-pointer text-xs relative transition-colors hover:bg-slate-100 dark:hover:bg-slate-800';
            const sd = selectedStartDate?.getTime(), ed = selectedEndDate?.getTime();
            if (sd && ed && ts >= sd && ts <= ed) cls += ' in-range font-bold';
            else if (sd && ts === sd) cls += ' single-selected';

            html += `
                <div class="${cls}" data-ts="${ts}">
                    <div class="day-num text-xs font-bold">${dObj.getDate()}</div>
                    <span class="text-[9px] mt-1 ${daySpend > 0 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-300 dark:text-slate-600'}">${daySpend > 0 ? formatComp(daySpend) + '€' : '-'}</span>
                </div>`;
        }
        grid.innerHTML = html;
    } else {
        if (monthYearEl) monthYearEl.innerText = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentCalDate);
        if (calSpendLabel) calSpendLabel.innerText = 'Gasto en el mes';

        const monthTxs = allTransactions.filter(t => {
            if (t.excluded || t.type !== 'ex') return false;
            const d = new Date(t.timestamp);
            return d.getMonth() === month && d.getFullYear() === year;
        });
        if (calTotalEl) calTotalEl.innerText = formatCur(monthTxs.reduce((s, t) => s + t.amount, 0));

        const firstDay = new Date(year, month, 1).getDay();
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysWithTx = new Set(monthTxs.map(t => new Date(t.timestamp).getDate()));

        let html = '';
        for (let i = 0; i < offset; i++) html += '<div></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const ts = new Date(year, month, d).getTime();
            let cls = 'calendar-day w-full aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer text-xs relative transition-colors hover:bg-slate-100 dark:hover:bg-slate-800';
            const sd = selectedStartDate?.getTime(), ed = selectedEndDate?.getTime(), hd = hoverDate?.getTime();
            if (sd && ed) {
                if (ts === sd && ts === ed) cls += ' single-selected';
                else if (ts === sd) cls += ' start-range';
                else if (ts === ed) cls += ' end-range';
                else if (ts > sd && ts < ed) cls += ' in-range';
            } else if (sd && !ed) {
                if (ts === sd) cls += ' single-selected';
                else if (hd) {
                    const lo = Math.min(sd, hd), hi = Math.max(sd, hd);
                    if (ts === lo) cls += ' start-range';
                    else if (ts === hi) cls += ' end-range';
                    else if (ts > lo && ts < hi) cls += ' hover-range';
                }
            }
            const dot = daysWithTx.has(d) ? '<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500"></span>' : '';
            html += `<div class="${cls}" data-ts="${ts}"><div class="day-num text-xs">${d}</div>${dot}</div>`;
        }
        grid.innerHTML = html;
    }

    grid.querySelectorAll('.calendar-day[data-ts]').forEach(el => {
        el.addEventListener('click', () => {
            const ts = parseInt(el.getAttribute('data-ts'), 10);
            const clicked = new Date(ts);
            if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
                selectedStartDate = clicked;
                selectedEndDate = null;
            } else {
                if (ts === selectedStartDate.getTime()) {
                    selectedStartDate = null;
                    selectedEndDate = null;
                } else if (clicked < selectedStartDate) {
                    selectedEndDate = selectedStartDate;
                    selectedStartDate = clicked;
                } else {
                    selectedEndDate = clicked;
                }
            }
            hoverDate = null;
            updateCalendarBtnText();
            updateCalendarUI();
            updateDashboard();
        });
        el.addEventListener('mouseenter', () => {
            if (selectedStartDate && !selectedEndDate && calendarViewMode === 'month') {
                hoverDate = new Date(parseInt(el.getAttribute('data-ts'), 10));
                updateCalendarUI();
            }
        });
    });
}

function updateCalendarBtnText() {
    const btn = document.getElementById('calendarBtnText');
    const clearBtn = document.getElementById('clearDateBtn');
    if (!btn) return;
    if (selectedStartDate && selectedEndDate) {
        btn.innerText = `${selectedStartDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} — ${selectedEndDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`;
        if (clearBtn) clearBtn.classList.remove('hidden');
    } else if (selectedStartDate) {
        btn.innerText = selectedStartDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
        btn.innerText = 'Rango de Fechas';
        if (clearBtn) clearBtn.classList.add('hidden');
    }
}

let currentDrilldownCategory = null;

window.openDrilldown = function (categoryLabel) {
    const modal = document.getElementById('drilldownModal');
    if (!modal) return;

    const isResto = categoryLabel === 'Resto de Gastos' || categoryLabel === 'Otros';
    const activeTxs = filteredTransactions.filter(t => !t.excluded);
    const txs = isResto
        ? activeTxs.filter(t => window.currentOtrosCategories?.includes(t.category))
        : activeTxs.filter(t => t.category === categoryLabel);

    if (!txs.length) return;
    currentDrilldownCategory = isResto ? null : categoryLabel;

    const filterBtn = document.getElementById('ddFilterTableBtn');
    if (filterBtn) filterBtn.classList.toggle('hidden', isResto);

    const titleEl = document.getElementById('drilldownTitle');
    if (titleEl) titleEl.innerText = categoryLabel;

    const totalAmt = txs.reduce((s, t) => s + t.amount, 0);
    const grandTotal = activeTxs.filter(t => t.type === 'ex').reduce((s, t) => s + t.amount, 0) || 1;

    const ddTotal = document.getElementById('ddTotalAmount');
    const ddPct = document.getElementById('ddTotalPct');
    const ddAvg = document.getElementById('ddAvgAmount');
    const ddMax = document.getElementById('ddMaxMonth');

    if (ddTotal) ddTotal.innerText = formatCur(totalAmt);
    if (ddPct) ddPct.innerText = ((totalAmt / grandTotal) * 100).toFixed(1) + '% del gasto filtrado';

    const monthMap = new Map();
    txs.forEach(t => {
        if (!monthMap.has(t.sortKey)) monthMap.set(t.sortKey, { sortKey: t.sortKey, label: t.monthYearLabel, amount: 0 });
        monthMap.get(t.sortKey).amount += t.amount;
    });
    const months = Array.from(monthMap.values()).sort((a, b) => a.sortKey - b.sortKey);

    const avgMonthly = months.length ? totalAmt / months.length : 0;
    const maxMonth = months.reduce((a, b) => (b.amount > a.amount ? b : a), months[0] || { label: '-' });

    if (ddAvg) ddAvg.innerText = formatCur(avgMonthly);
    if (ddMax) ddMax.innerText = `Pico: ${maxMonth?.label || '-'} (${formatCur(maxMonth?.amount || 0)})`;

    const merchantMap = new Map();
    txs.forEach(t => {
        const n = isResto ? t.category : t.normalizedConcept;
        merchantMap.set(n, (merchantMap.get(n) || 0) + t.amount);
    });
    const topMerchants = Array.from(merchantMap.entries()).sort((a, b) => b[1] - a[1]);
    const top3 = topMerchants.slice(0, 4);

    const ddTopEl = document.getElementById('ddTopMerchants');
    if (ddTopEl) {
        ddTopEl.innerHTML = top3.map(([name, amt]) => {
            const pct = ((amt / totalAmt) * 100).toFixed(0);
            return `
            <div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span class="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 truncate mr-4">${escapeHTML(name)}</span>
                <div class="flex items-center gap-2 flex-shrink-0 tabular-nums">
                    <span class="text-[11px] text-slate-400 font-semibold">${pct}%</span>
                    <span class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white blur-data">${formatCur(amt)}</span>
                </div>
            </div>`;
        }).join('');
    }

    const topConcepts = topMerchants.slice(0, 8);
    const ddCtx = document.getElementById('drilldownChart')?.getContext('2d');
    if (ddCtx) {
        if (chartInstances.drilldown) chartInstances.drilldown.destroy();
        chartInstances.drilldown = new Chart(ddCtx, {
            type: 'doughnut',
            data: {
                labels: topConcepts.map(e => e[0]),
                datasets: [{
                    data: topConcepts.map(e => e[1]),
                    backgroundColor: drilldownPalette.slice(0, topConcepts.length),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true } },
                    tooltip: { callbacks: { label: c => ` ${c.label}: ${formatCur(c.raw)}` } }
                }
            }
        });
    }

    // 1. Abrimos primero el modal para que el canvas tenga dimensiones reales (> 0px)
    openModal(modal);

    // 2. Si solo hay 1 mes, desglosamos por días para que siempre exista una curva visible
    let trendPoints = months;
    if (months.length <= 1) {
        const dayMap = new Map();
        txs.forEach(t => {
            if (!dayMap.has(t.timestamp)) {
                dayMap.set(t.timestamp, {
                    sortKey: t.timestamp,
                    label: t.dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                    amount: 0
                });
            }
            dayMap.get(t.timestamp).amount += t.amount;
        });
        trendPoints = Array.from(dayMap.values()).sort((a, b) => a.sortKey - b.sortKey);
    }

    requestAnimationFrame(() => {
        const ddTrendCtx = document.getElementById('drilldownTrendChart')?.getContext('2d');
        if (ddTrendCtx) {
            if (chartInstances.drilldownTrend) chartInstances.drilldownTrend.destroy();
            const isSinglePoint = trendPoints.length === 1;
            chartInstances.drilldownTrend = new Chart(ddTrendCtx, {
                type: isSinglePoint ? 'bar' : 'line',
                data: {
                    labels: trendPoints.map(m => m.label),
                    datasets: [{
                        data: trendPoints.map(m => m.amount),
                        borderColor: '#3b82f6',
                        backgroundColor: isSinglePoint ? 'rgba(59, 130, 246, 0.65)' : 'rgba(59, 130, 246, 0.15)',
                        borderWidth: 2.5,
                        borderRadius: isSinglePoint ? 8 : 0,
                        fill: !isSinglePoint,
                        tension: 0.25,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: c => ' ' + formatCur(c.raw) } }
                    },
                    scales: {
                        y: { beginAtZero: true, border: { display: false }, ticks: { callback: v => formatComp(v) + ' €', font: { size: 10 }, maxTicksLimit: 5 } },
                        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } }
                    }
                }
            });
        }
        updateChartTheme();
    });
};

// =========================================================================
// EDITOR DE REGLAS Y SUB-PRESUPUESTOS (Feature 5)
// =========================================================================
function openDictionaryEditor() {
    const modal = document.getElementById('dictionaryModal');
    if (!modal) return;
    editingRules = JSON.parse(JSON.stringify(categoryRules));
    const searchInp = document.getElementById('dictSearchInput');
    if (searchInp) searchInp.value = '';
    renderDictionaryRules();
    openModal(modal);
}

function renderDictionaryRules(filterText = '') {
    const container = document.getElementById('dictionaryRulesContainer');
    if (!container) return;
    const query = filterText.trim().toUpperCase();

    container.innerHTML = editingRules.map((rule, i) => {
        const matches = !query ||
            rule.category.toUpperCase().includes(query) ||
            rule.keywords.some(k => k.toUpperCase().includes(query));
        if (!matches) return '';

        return `
        <div class="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="flex flex-wrap items-center gap-2.5 mb-2.5">
                <div class="flex flex-col gap-0.5">
                    <button type="button" class="move-rule-up text-slate-400 hover:text-blue-600 disabled:opacity-20 text-[10px] leading-none p-0.5" data-rule="${i}" ${i === 0 ? 'disabled' : ''} title="Subir prioridad">
                        <i class="fa-solid fa-chevron-up pointer-events-none"></i>
                    </button>
                    <button type="button" class="move-rule-down text-slate-400 hover:text-blue-600 disabled:opacity-20 text-[10px] leading-none p-0.5" data-rule="${i}" ${i === editingRules.length - 1 ? 'disabled' : ''} title="Bajar prioridad">
                        <i class="fa-solid fa-chevron-down pointer-events-none"></i>
                    </button>
                </div>
                <input type="color" value="${escapeHTML(rule.color)}" data-rule="${i}" data-field="color" class="w-8 h-8 rounded-lg cursor-pointer border-0 flex-shrink-0">
                <input type="text" value="${escapeHTML(rule.emoji || '🏷️')}" data-rule="${i}" data-field="emoji" class="w-11 text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-1.5 text-sm" maxlength="3">
                <input type="text" value="${escapeHTML(rule.category)}" data-rule="${i}" data-field="category" class="flex-1 min-w-[140px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-1.5 px-3 text-sm font-bold text-slate-800 dark:text-white" placeholder="Nombre de categoría">
                <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1">
                    <span class="text-[10px] font-bold uppercase text-slate-400">Tope €/mes:</span>
                    <input type="number" min="0" step="10" value="${Number(rule.budget) || 0}" data-rule="${i}" data-field="budget" class="w-16 bg-transparent text-xs font-extrabold text-right text-slate-800 dark:text-white tabular-nums focus:outline-none" title="0 = Sin límite específico">
                </div>
                <button type="button" class="del-rule-btn text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex-shrink-0" data-rule="${i}" title="Eliminar regla">
                    <i class="fa-solid fa-trash-can text-xs pointer-events-none"></i>
                </button>
            </div>
            <input type="text" value="${escapeHTML(rule.keywords.join(', '))}" data-rule="${i}" data-field="keywords" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 px-3 text-xs font-mono text-slate-700 dark:text-slate-300" placeholder="Palabras clave separadas por coma (ej: MERCADONA, LIDL, CONSUM)">
        </div>`;
    }).join('');

    container.querySelectorAll('input[data-rule]').forEach(inp => {
        inp.addEventListener('input', () => {
            const i = parseInt(inp.getAttribute('data-rule'), 10);
            const field = inp.getAttribute('data-field');
            if (field === 'keywords') {
                editingRules[i].keywords = inp.value.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
            } else if (field === 'budget') {
                editingRules[i].budget = Math.max(0, parseFloat(inp.value) || 0);
            } else {
                editingRules[i][field] = inp.value;
            }
        });
    });

    container.querySelectorAll('.del-rule-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-rule'), 10);
            editingRules.splice(idx, 1);
            renderDictionaryRules(document.getElementById('dictSearchInput')?.value || '');
        });
    });

    container.querySelectorAll('.move-rule-up').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-rule'), 10);
            if (idx > 0) {
                [editingRules[idx - 1], editingRules[idx]] = [editingRules[idx], editingRules[idx - 1]];
                renderDictionaryRules(document.getElementById('dictSearchInput')?.value || '');
            }
        });
    });

    container.querySelectorAll('.move-rule-down').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-rule'), 10);
            if (idx < editingRules.length - 1) {
                [editingRules[idx + 1], editingRules[idx]] = [editingRules[idx], editingRules[idx + 1]];
                renderDictionaryRules(document.getElementById('dictSearchInput')?.value || '');
            }
        });
    });
}

function reapplyCategories() {
    categoryRules = JSON.parse(JSON.stringify(editingRules));
    try { localStorage.setItem('customCategoryRules', JSON.stringify(categoryRules)); } catch (e) {}
    applyCategorization(allTransactions, categoryRules);
    refreshCategoryFilterOptions();
    updateDashboard();
    window.showToast('Reglas y topes de categoría actualizados.', 'success');
}

window.setCategoryFilter = function (cat) {
    const cFilt = document.getElementById('categoryFilter');
    if (cFilt) {
        cFilt.value = cat;
        updateDashboard();
    }
};

// =========================================================================
// EVENT LISTENERS PRINCIPALES AL CARGAR EL DOM
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initStorage();

    // 1. HEADER, PWA, IMPRESIÓN Y PALETA CTRL+K
    document.getElementById('openCmdPaletteBtn')?.addEventListener('click', openCommandPalette);
    document.getElementById('closeCmdPaletteBtn')?.addEventListener('click', () => closeModal(document.getElementById('cmdPaletteModal')));
    document.getElementById('printReportBtn')?.addEventListener('click', triggerPrintReport);

    const cmdSearchInput = document.getElementById('cmdSearchInput');
    if (cmdSearchInput) {
        cmdSearchInput.addEventListener('input', () => buildCommandPaletteItems(cmdSearchInput.value));
        cmdSearchInput.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (cmdPaletteItems.length) {
                    cmdActiveIndex = (cmdActiveIndex + 1) % cmdPaletteItems.length;
                    renderCommandPaletteList();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (cmdPaletteItems.length) {
                    cmdActiveIndex = (cmdActiveIndex - 1 + cmdPaletteItems.length) % cmdPaletteItems.length;
                    renderCommandPaletteList();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                executeCommandPaletteItem(cmdActiveIndex);
            }
        });
    }

    const installAppBtn = document.getElementById('installAppBtn');
    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            installAppBtn.classList.add('hidden');
        });
    }

    document.getElementById('themeToggle')?.addEventListener('click', () => applyTheme(!document.documentElement.classList.contains('dark')));

    const incBtn = document.getElementById('incognitoToggle');
    const incIcon = document.getElementById('incognitoIcon');
    function toggleIncognito() {
        const active = document.body.classList.toggle('incognito-active');
        if (incIcon) {
            incIcon.classList.toggle('fa-eye', !active);
            incIcon.classList.toggle('fa-eye-slash', active);
        }
        try { localStorage.setItem('incognito', active); } catch (e) {}
    }
    if (incBtn) incBtn.addEventListener('click', toggleIncognito);

    document.getElementById('exportImageBtn')?.addEventListener('click', exportImage);

    const updateBtn = document.getElementById('updateDataBtn');
    const upFileInp = document.getElementById('updateFileInput');
    if (updateBtn && upFileInp) updateBtn.addEventListener('click', () => upFileInp.click());
    if (upFileInp) {
        upFileInp.addEventListener('change', e => {
            if (e.target.files.length) handleFiles(e.target.files);
            e.target.value = '';
        });
    }

    // 2. MODAL ALMACÉN, BACKUP JSON, RENOMBRADO Y FUSIÓN (Features 11 & 12)
    const vaultBtn = document.getElementById('openVaultBtn');
    const vaultModal = document.getElementById('vaultModal');
    const closeVaultBtn = document.getElementById('closeVaultBtn');
    const deleteAllBtn = document.getElementById('deleteAllVaultBtn');
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const importBackupInput = document.getElementById('importBackupInput');
    const mergeSelectedVaultBtn = document.getElementById('mergeSelectedVaultBtn');

    if (vaultBtn) vaultBtn.addEventListener('click', () => { refreshLocalVault(); openModal(vaultModal); });
    if (closeVaultBtn) closeVaultBtn.addEventListener('click', () => closeModal(vaultModal));
    if (exportBackupBtn) exportBackupBtn.addEventListener('click', exportFullBackupJSON);
    if (importBackupBtn && importBackupInput) {
        importBackupBtn.addEventListener('click', () => importBackupInput.click());
        importBackupInput.addEventListener('change', e => {
            if (e.target.files.length) importFullBackupJSON(e.target.files[0]);
            e.target.value = '';
        });
    }

    if (mergeSelectedVaultBtn) {
        mergeSelectedVaultBtn.addEventListener('click', async () => {
            const filesToMerge = savedFiles.filter(f => selectedVaultIds.has(f.id));
            if (filesToMerge.length < 2) return;
            showLoader('Fusionando datasets seleccionados...');
            const dataArrays = filesToMerge.map(f => {
                try { return JSON.parse(f.data); } catch (e) { return []; }
            });
            const { combinedRawData } = await runDeduplicationWorker([], dataArrays);
            const mergedName = `Fusión_${filesToMerge.length}_Archivos_${new Date().toISOString().slice(0, 10)}`;
            await saveFileToStorage(JSON.stringify(combinedRawData), mergedName);
            selectedVaultIds.clear();
            await refreshLocalVault();
            hideLoader();
            buildDashboardModel(combinedRawData);
            window.showToast(`Creado "${mergedName}" con ${combinedRawData.length} movimientos únicos.`, 'success');
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async () => {
            if (!savedFiles.length) return;
            const ok = await window.showConfirmToast('¿Eliminar TODOS los archivos guardados en el almacén local?');
            if (!ok) return;
            for (const f of savedFiles) await deleteFileFromStorage(f.id, true);
            selectedVaultIds.clear();
            await refreshLocalVault();
            window.showToast('Almacén vaciado por completo.', 'success');
        });
    }

    const vaultList = document.getElementById('vaultList');
    if (vaultList) {
        vaultList.addEventListener('click', async (e) => {
            const cb = e.target.closest('.vault-merge-cb');
            if (cb) {
                const id = cb.getAttribute('data-vault-cb');
                if (cb.checked) selectedVaultIds.add(id);
                else selectedVaultIds.delete(id);
                updateVaultMergeBtnUI();
                return;
            }
            const renameBtn = e.target.closest('.rename-file-btn');
            if (renameBtn) {
                const id = renameBtn.getAttribute('data-id');
                const foundFile = savedFiles.find(x => x.id === id);
                if (!foundFile) return;
                const newName = prompt('Nuevo nombre para este dataset:', foundFile.fileName);
                if (newName && newName.trim() !== '') {
                    await saveToLocalDB(foundFile.id, newName.trim(), foundFile.data, foundFile.uploadDate);
                    if (currentVaultId === foundFile.id) currentFileName = newName.trim();
                    await refreshLocalVault();
                    window.showToast('Nombre actualizado.', 'success');
                }
                return;
            }
            const loadBtn = e.target.closest('.load-file-btn');
            const delBtn = e.target.closest('.delete-file-btn');
            if (loadBtn) {
                const id = loadBtn.getAttribute('data-id');
                const foundFile = savedFiles.find(x => x.id === id);
                if (!foundFile) return;
                closeModal(vaultModal);
                loadVaultDataset(foundFile);
            } else if (delBtn) {
                const id = delBtn.getAttribute('data-id');
                const isConfirmed = await window.showConfirmToast("¿Eliminar este archivo del almacén?");
                if (isConfirmed) await deleteFileFromStorage(id);
            }
        });
    }

    // 3. MODAL DICCIONARIO Y SUB-PRESUPUESTOS
    const dictModal = document.getElementById('dictionaryModal');
    const dictSearchInput = document.getElementById('dictSearchInput');
    document.getElementById('openDictionaryBtn')?.addEventListener('click', openDictionaryEditor);
    document.getElementById('quickEditRulesBtn')?.addEventListener('click', openDictionaryEditor);
    document.getElementById('configCatBudgetsBtn')?.addEventListener('click', openDictionaryEditor);
    document.getElementById('closeDictionaryBtn')?.addEventListener('click', () => closeModal(dictModal));
    document.getElementById('cancelDictionaryBtn')?.addEventListener('click', () => closeModal(dictModal));
    document.getElementById('saveDictionaryBtn')?.addEventListener('click', () => { reapplyCategories(); closeModal(dictModal); });

    if (dictSearchInput) {
        dictSearchInput.addEventListener('input', () => renderDictionaryRules(dictSearchInput.value));
    }
    document.getElementById('restoreDefaultDictBtn')?.addEventListener('click', async () => {
        const ok = await window.showConfirmToast('¿Restaurar las reglas y topes originales de fábrica?');
        if (ok) {
            editingRules = JSON.parse(JSON.stringify(defaultCategoryRules));
            renderDictionaryRules();
            window.showToast('Reglas restauradas (pulsa Guardar para aplicar).', 'info');
        }
    });
    document.getElementById('addRuleBtn')?.addEventListener('click', () => {
        editingRules.unshift({ keywords: [], category: 'Nueva Categoría', color: '#6366f1', emoji: '🏷️', budget: 0 });
        if (dictSearchInput) dictSearchInput.value = '';
        renderDictionaryRules();
    });

    // 4. MODAL EDICIÓN INDIVIDUAL DE MOVIMIENTO (Feature 6 & 7)
    const txEditModal = document.getElementById('txEditModal');
    const txEditModeSelect = document.getElementById('txEditModeSelect');
    const txEditKeywordWrapper = document.getElementById('txEditKeywordWrapper');

    if (txEditModeSelect && txEditKeywordWrapper) {
        txEditModeSelect.addEventListener('change', () => {
            txEditKeywordWrapper.classList.toggle('hidden', txEditModeSelect.value !== 'rule');
        });
    }
    document.getElementById('closeTxEditBtn')?.addEventListener('click', () => closeModal(txEditModal));
    document.getElementById('cancelTxEditBtn')?.addEventListener('click', () => closeModal(txEditModal));
    document.getElementById('saveTxEditBtn')?.addEventListener('click', () => {
        if (!editingSingleTxId) return;
        const mode = txEditModeSelect?.value || 'single';
        const chosenCat = document.getElementById('txEditCategorySelect')?.value;
        const noteVal = document.getElementById('txEditNoteInput')?.value.trim() || '';
        const exclVal = Boolean(document.getElementById('txEditExcludeCb')?.checked);

        if (!txCustomMeta[editingSingleTxId]) txCustomMeta[editingSingleTxId] = {};
        txCustomMeta[editingSingleTxId].note = noteVal;
        txCustomMeta[editingSingleTxId].excluded = exclVal;

        if (mode === 'single') {
            txCustomMeta[editingSingleTxId].catOverride = chosenCat;
        } else {
            const kw = document.getElementById('txEditKeywordInput')?.value.trim().toUpperCase();
            const targetRule = categoryRules.find(r => r.category === chosenCat);
            if (kw && targetRule && !targetRule.keywords.includes(kw)) {
                targetRule.keywords.push(kw);
                try { localStorage.setItem('customCategoryRules', JSON.stringify(categoryRules)); } catch (e) {}
            }
            delete txCustomMeta[editingSingleTxId].catOverride;
        }

        saveTxMetaToStorage();
        applyCategorization(allTransactions, categoryRules);
        refreshCategoryFilterOptions();
        updateDashboard();
        closeModal(txEditModal);
        window.showToast('Movimiento actualizado correctamente.', 'success');
    });

    // 5. BARRA DE ACCIONES EN LOTE / MULTI-SELECCIÓN (Feature 8)
    document.getElementById('bulkApplyCategoryBtn')?.addEventListener('click', () => {
        const chosenCat = document.getElementById('bulkCategorySelect')?.value;
        if (!chosenCat || !selectedTxIds.size) return;
        selectedTxIds.forEach(id => {
            if (!txCustomMeta[id]) txCustomMeta[id] = {};
            txCustomMeta[id].catOverride = chosenCat;
        });
        saveTxMetaToStorage();
        applyCategorization(allTransactions, categoryRules);
        updateDashboard();
        window.showToast(`Categoría "${chosenCat}" asignada a ${selectedTxIds.size} movimientos.`, 'success');
    });

    document.getElementById('bulkToggleExcludeBtn')?.addEventListener('click', () => {
        if (!selectedTxIds.size) return;
        const selectedTxs = allTransactions.filter(t => selectedTxIds.has(t.id));
        const shouldExclude = !selectedTxs.every(t => t.excluded);
        selectedTxIds.forEach(id => {
            if (!txCustomMeta[id]) txCustomMeta[id] = {};
            txCustomMeta[id].excluded = shouldExclude;
        });
        saveTxMetaToStorage();
        applyCategorization(allTransactions, categoryRules);
        updateDashboard();
        window.showToast(shouldExclude ? `${selectedTxIds.size} movs. excluidos del cómputo.` : `${selectedTxIds.size} movs. incluidos de nuevo.`, 'info');
    });

    document.getElementById('bulkClearSelectionBtn')?.addEventListener('click', () => {
        selectedTxIds.clear();
        updateBulkActionBarUI();
        renderVirtualTableRows();
        updateSelectAllCheckboxState();
    });

    // 6. DRILLDOWN, EXPANDED CHART Y CIERRE DE MODALES AL HACER CLIC FUERA
    const drilldownModal = document.getElementById('drilldownModal');
    const expandedChartModal = document.getElementById('expandedChartModal');
    const errorModal = document.getElementById('errorModal');
    const cmdPaletteModal = document.getElementById('cmdPaletteModal');

    document.getElementById('closeModalBtn')?.addEventListener('click', () => closeModal(drilldownModal));
    document.getElementById('ddFilterTableBtn')?.addEventListener('click', () => {
        if (currentDrilldownCategory) {
            window.setCategoryFilter(currentDrilldownCategory);
            closeModal(drilldownModal);
        }
    });
    document.getElementById('expandChartBtn')?.addEventListener('click', openExpandedChart);
    document.getElementById('closeExpandedChartBtn')?.addEventListener('click', () => closeModal(expandedChartModal));
    document.getElementById('closeErrorModalBtn')?.addEventListener('click', () => closeModal(errorModal));

    [vaultModal, drilldownModal, dictModal, expandedChartModal, errorModal, txEditModal, cmdPaletteModal].forEach(modal => {
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
    });

    // 7. PRESUPUESTO GENERAL
    const editBudgetBtn = document.getElementById('editBudgetBtn');
    const budgetInputContainer = document.getElementById('budgetInputContainer');
    const budgetInput = document.getElementById('budgetInput');

    if (editBudgetBtn) {
        editBudgetBtn.addEventListener('click', () => {
            budgetInputContainer?.classList.remove('hidden');
            if (budgetInput) { budgetInput.value = monthlyBudget; budgetInput.focus(); budgetInput.select(); }
        });
    }
    function saveBudget() {
        const v = parseFloat(budgetInput?.value);
        if (!isNaN(v) && v > 0) {
            monthlyBudget = v;
            try { localStorage.setItem('monthlyBudget', v); } catch (e) {}
            updateDashboard();
            window.showToast('Objetivo mensual actualizado.', 'success');
        }
        budgetInputContainer?.classList.add('hidden');
    }
    document.getElementById('saveBudgetBtn')?.addEventListener('click', saveBudget);
    if (budgetInput) budgetInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBudget(); });
    document.getElementById('cancelBudgetBtn')?.addEventListener('click', () => budgetInputContainer?.classList.add('hidden'));

    // 8. TABLA VIRTUALIZADA, EVENTOS DE FILA Y FILTROS
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsv);

    const tableScrollContainer = document.getElementById('tableScrollContainer');
    if (tableScrollContainer) {
        tableScrollContainer.addEventListener('scroll', () => {
            if (!virtualScrollTicking) {
                window.requestAnimationFrame(() => {
                    renderVirtualTableRows();
                    virtualScrollTicking = false;
                });
                virtualScrollTicking = true;
            }
        }, { passive: true });
    }

    const selectAllTxCb = document.getElementById('selectAllTxCb');
    if (selectAllTxCb) {
        selectAllTxCb.addEventListener('change', () => {
            if (selectAllTxCb.checked) {
                currentlyDisplayedTableData.forEach(t => selectedTxIds.add(t.id));
            } else {
                currentlyDisplayedTableData.forEach(t => selectedTxIds.delete(t.id));
            }
            renderVirtualTableRows();
            updateBulkActionBarUI();
        });
    }

    const tSearch = document.getElementById('tableSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const txTypeFilter = document.getElementById('txTypeFilter');

    if (txTypeFilter) {
        txTypeFilter.addEventListener('change', () => {
            updateTableOnly();
            renderActiveFiltersBar();
        });
    }
    if (tSearch) {
        tSearch.addEventListener('input', () => {
            updateTableOnly();
            renderActiveFiltersBar();
            clearSearchBtn?.classList.toggle('hidden', !tSearch.value);
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (tSearch) {
                tSearch.value = '';
                clearSearchBtn.classList.add('hidden');
                updateTableOnly();
                renderActiveFiltersBar();
            }
        });
    }

    document.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            if (!field) return;
            if (tableSortField === field) {
                tableSortAsc = !tableSortAsc;
            } else {
                tableSortField = field;
                tableSortAsc = field === 'description' || field === 'category';
            }
            updateSortHeadersUI();
            updateTableOnly();
        });
    });

    const tableEl = document.getElementById('transactionsTable');
    if (tableEl) {
        tableEl.addEventListener('click', e => {
            const cb = e.target.closest('.tx-row-cb');
            if (cb) {
                const txId = cb.getAttribute('data-tx-cb');
                if (cb.checked) selectedTxIds.add(txId);
                else selectedTxIds.delete(txId);
                updateBulkActionBarUI();
                updateSelectAllCheckboxState();
                return;
            }
            const badge = e.target.closest('.cat-badge');
            const editBtn = e.target.closest('.tx-edit-trigger');
            const exclBtn = e.target.closest('.tx-exclude-trigger');
            if (badge) {
                window.setCategoryFilter(badge.getAttribute('data-cat'));
            } else if (editBtn) {
                openTxEditModal(editBtn.getAttribute('data-tx-id'));
            } else if (exclBtn) {
                toggleExcludeSingleTx(exclBtn.getAttribute('data-tx-id'));
            }
        });
    }

    // 9. FILTROS GENERALES Y RESET DE SESIÓN
    const yFilt = document.getElementById('yearFilter');
    const cFilt = document.getElementById('categoryFilter');
    if (yFilt) yFilt.addEventListener('change', updateDashboard);
    if (cFilt) cFilt.addEventListener('change', updateDashboard);

    document.getElementById('clearAllFiltersBtn')?.addEventListener('click', () => {
        if (yFilt) yFilt.value = 'all';
        if (cFilt) cFilt.value = 'all';
        if (txTypeFilter) txTypeFilter.value = 'all';
        if (tSearch) tSearch.value = '';
        clearSearchBtn?.classList.add('hidden');
        selectedStartDate = null;
        selectedEndDate = null;
        updateCalendarBtnText();
        updateCalendarUI();
        updateDashboard();
    });

    document.getElementById('resetBtn')?.addEventListener('click', async () => {
        const ok = await window.showConfirmToast('¿Cerrar la vista actual? Tus archivos siguen guardados en el Almacén.');
        if (!ok) return;
        allTransactions = [];
        filteredTransactions = [];
        selectedTxIds.clear();
        updateBulkActionBarUI();
        try { localStorage.setItem('sessionClosed', 'true'); } catch (e) {}
        document.getElementById('dropZoneContainer')?.classList.remove('hidden');
        document.getElementById('dashboard')?.classList.add('hidden');
        document.getElementById('dateRangeDisplay')?.classList.add('hidden');
        updateBtn?.classList.add('hidden');
        await refreshLocalVault();
        window.showToast('Vista cerrada. Puedes reabrir tu sesión en cualquier momento.', 'info');
    });

    // 10. DRAG & DROP Y SUBIDA DE ARCHIVOS
    let dragCounter = 0;
    document.addEventListener('dragenter', e => {
        e.preventDefault();
        dragCounter++;
        const over = document.getElementById('globalDragOverlay');
        if (over) { over.classList.remove('hidden'); over.classList.add('flex'); }
    });
    document.addEventListener('dragleave', e => {
        e.preventDefault();
        dragCounter--;
        const over = document.getElementById('globalDragOverlay');
        if (dragCounter <= 0 && over) {
            dragCounter = 0;
            over.classList.add('hidden');
            over.classList.remove('flex');
        }
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
        e.preventDefault();
        dragCounter = 0;
        const over = document.getElementById('globalDragOverlay');
        if (over) { over.classList.add('hidden'); over.classList.remove('flex'); }
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    });

    const fileInp = document.getElementById('fileInput');
    if (fileInp) fileInp.addEventListener('change', e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ''; });
    document.getElementById('dropZoneTrigger')?.addEventListener('click', () => fileInp?.click());
    document.getElementById('examinarBtn')?.addEventListener('click', e => { e.stopPropagation(); fileInp?.click(); });
    document.getElementById('mockDataBtn')?.addEventListener('click', loadMockData);

    // 11. CONTROLES DE GRÁFICA Y CALENDARIO
    const chartTypeLineBtn = document.getElementById('chartTypeLineBtn');
    const chartTypeBarBtn = document.getElementById('chartTypeBarBtn');
    if (chartTypeLineBtn && chartTypeBarBtn) {
        chartTypeLineBtn.addEventListener('click', () => {
            evolutionChartType = 'line';
            chartTypeLineBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all';
            chartTypeBarBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all';
            updateDashboard();
        });
        chartTypeBarBtn.addEventListener('click', () => {
            evolutionChartType = 'bar';
            chartTypeBarBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all';
            chartTypeLineBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all';
            updateDashboard();
        });
    }

    const openCalBtn = document.getElementById('openCalendarBtn');
    const calDrop = document.getElementById('calendarDropdown');
    const viewMonthBtn = document.getElementById('viewMonthBtn');
    const viewWeekBtn = document.getElementById('viewWeekBtn');

    if (openCalBtn) {
        openCalBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (calDrop) {
                calDrop.classList.toggle('hidden');
                if (!calDrop.classList.contains('hidden')) updateCalendarUI();
            }
        });
    }
    document.getElementById('clearDateBtn')?.addEventListener('click', () => {
        selectedStartDate = null;
        selectedEndDate = null;
        hoverDate = null;
        updateCalendarBtnText();
        updateCalendarUI();
        updateDashboard();
    });
    document.getElementById('calPrevBtn')?.addEventListener('click', () => {
        if (calendarViewMode === 'week') currentCalDate.setDate(currentCalDate.getDate() - 7);
        else currentCalDate.setMonth(currentCalDate.getMonth() - 1);
        updateCalendarUI();
    });
    document.getElementById('calNextBtn')?.addEventListener('click', () => {
        if (calendarViewMode === 'week') currentCalDate.setDate(currentCalDate.getDate() + 7);
        else currentCalDate.setMonth(currentCalDate.getMonth() + 1);
        updateCalendarUI();
    });
    if (viewMonthBtn) {
        viewMonthBtn.addEventListener('click', () => {
            calendarViewMode = 'month';
            viewMonthBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-md bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all';
            if (viewWeekBtn) viewWeekBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all';
            updateCalendarUI();
        });
    }
    if (viewWeekBtn) {
        viewWeekBtn.addEventListener('click', () => {
            calendarViewMode = 'week';
            viewWeekBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-md bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transition-all';
            if (viewMonthBtn) viewMonthBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all';
            updateCalendarUI();
        });
    }

    document.querySelectorAll('.cal-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!allTransactions.length) return;
            const preset = btn.getAttribute('data-preset');
            const latestDate = new Date(allTransactions[0].timestamp);
            if (preset === '30d') {
                selectedEndDate = new Date(latestDate.getFullYear(), latestDate.getMonth(), latestDate.getDate());
                selectedStartDate = new Date(selectedEndDate.getTime() - 29 * 86400000);
            } else if (preset === 'thisMonth') {
                selectedStartDate = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
                selectedEndDate = new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0);
            } else if (preset === 'prevMonth') {
                selectedStartDate = new Date(latestDate.getFullYear(), latestDate.getMonth() - 1, 1);
                selectedEndDate = new Date(latestDate.getFullYear(), latestDate.getMonth(), 0);
            }
            if (selectedStartDate) currentCalDate = new Date(selectedStartDate.getFullYear(), selectedStartDate.getMonth(), 1);
            updateCalendarBtnText();
            updateCalendarUI();
            updateDashboard();
        });
    });

    document.getElementById('calQuickSelectBtn')?.addEventListener('click', () => {
        const panel = document.getElementById('quickSelectPanel');
        const grid = document.getElementById('quickSelectGrid');
        if (!panel || !grid) return;
        const years = [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a);
        grid.innerHTML = years.length
            ? years.map(y => `<button class="quick-year-btn bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-950/60 rounded-xl py-2 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors" data-year="${y}">${y}</button>`).join('')
            : '<p class="text-xs text-slate-400 col-span-3 text-center py-4">Sin datos cargados</p>';
        grid.querySelectorAll('.quick-year-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const y = parseInt(btn.getAttribute('data-year'), 10);
                selectedStartDate = new Date(y, 0, 1);
                selectedEndDate = new Date(y, 11, 31);
                currentCalDate = new Date(y, 0, 1);
                updateCalendarBtnText();
                updateCalendarUI();
                updateDashboard();
                panel.classList.add('hidden');
            });
        });
        panel.classList.remove('hidden');
    });
    document.getElementById('closeQuickSelectBtn')?.addEventListener('click', () => document.getElementById('quickSelectPanel')?.classList.add('hidden'));

    document.addEventListener('click', e => {
        const calContainer = document.getElementById('datePickerContainer');
        if (calDrop && !calDrop.classList.contains('hidden') && calContainer && !calContainer.contains(e.target)) {
            calDrop.classList.add('hidden');
        }
    });

    // 12. ATAJOS DE TECLADO GLOBALES (Ctrl+K, Ctrl+F, /, Alt+I, Escape)
    document.addEventListener('keydown', e => {
        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !isTyping)) {
            if (!document.getElementById('dashboard')?.classList.contains('hidden')) {
                e.preventDefault();
                tSearch?.focus();
            }
        }
        if (e.altKey && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            toggleIncognito();
        }
        if (e.key === 'Escape') {
            if (cmdPaletteModal && !cmdPaletteModal.classList.contains('hidden')) {
                closeModal(cmdPaletteModal);
                return;
            }
            if (document.activeElement === tSearch || (tSearch && tSearch.value.length > 0)) {
                tSearch.value = '';
                clearSearchBtn?.classList.add('hidden');
                updateTableOnly();
                renderActiveFiltersBar();
                tSearch.blur();
            }
            budgetInputContainer?.classList.add('hidden');
            [vaultModal, drilldownModal, dictModal, expandedChartModal, errorModal, txEditModal].forEach(m => {
                if (m && !m.classList.contains('hidden')) closeModal(m);
            });
            calDrop?.classList.add('hidden');
        }
    });

    updateSortHeadersUI();
    updateCalendarUI();
});

// =========================================================================
// SELECTOR DINÁMICO DE COLOR DE ACENTO (6 PALETAS CON TRANSICIÓN SUAVE)
// =========================================================================
const ACCENT_THEMES = [
    { id: 'cobalto',  name: 'Azul Cobalto',      hex: '#3b82f6', rgb: '59, 130, 246' },
    { id: 'petroleo', name: 'Acero Petróleo',    hex: '#06b6d4', rgb: '6, 182, 212' },
    { id: 'jade',     name: 'Verde Jade',        hex: '#10b981', rgb: '16, 185, 129' },
    { id: 'amatista', name: 'Violeta Amatista',  hex: '#8b5cf6', rgb: '139, 92, 246' },
    { id: 'ambar',    name: 'Oro Ejecutivo',     hex: '#f59e0b', rgb: '245, 158, 11' },
    { id: 'rubi',     name: 'Rojo Rubí',         hex: '#f43f5e', rgb: '244, 63, 94' }
];

let currentAccentIndex = 0;

function applyAccentTheme(index, showNotification = false) {
    currentAccentIndex = ((index % ACCENT_THEMES.length) + ACCENT_THEMES.length) % ACCENT_THEMES.length;
    const theme = ACCENT_THEMES[currentAccentIndex];
    document.documentElement.setAttribute('data-accent', theme.id);
    try { localStorage.setItem('accentTheme', theme.id); } catch (e) {}

    // Sincronizar también el color del gráfico de evolución y drilldown
    if (chartInstances.bar && chartInstances.bar.data?.datasets?.[0]) {
        const ds = chartInstances.bar.data.datasets[0];
        const ctx = document.getElementById('barChart')?.getContext('2d');
        ds.borderColor = theme.hex;
        if (ctx) {
            const grad = ctx.createLinearGradient(0, 0, 0, 320);
            grad.addColorStop(0, evolutionChartType === 'line' ? `rgba(${theme.rgb}, 0.42)` : `rgba(${theme.rgb}, 0.85)`);
            grad.addColorStop(1, evolutionChartType === 'line' ? `rgba(${theme.rgb}, 0.02)` : `rgba(${theme.rgb}, 0.35)`);
            ds.backgroundColor = grad;
        }
        chartInstances.bar.update();
    }

    if (chartInstances.drilldownTrend && chartInstances.drilldownTrend.data?.datasets?.[0]) {
        chartInstances.drilldownTrend.data.datasets[0].borderColor = theme.hex;
        chartInstances.drilldownTrend.data.datasets[0].backgroundColor = `rgba(${theme.rgb}, 0.12)`;
        chartInstances.drilldownTrend.update();
    }

    if (showNotification && window.showToast) {
        window.showToast(`Estilo visual: ${theme.name}`, 'info', 1800);
    }
}

// Conectar a updateChartTheme para mantener el color al filtrar o cambiar datos
const _originalUpdateChartTheme = updateChartTheme;
updateChartTheme = function () {
    _originalUpdateChartTheme();
    applyAccentTheme(currentAccentIndex, false);
};

// Inicializar color guardado y evento del botón
(function initAccentSwitcher() {
    const savedId = localStorage.getItem('accentTheme');
    const foundIdx = ACCENT_THEMES.findIndex(t => t.id === savedId);
    applyAccentTheme(foundIdx !== -1 ? foundIdx : 0, false);

    window.addEventListener('DOMContentLoaded', () => {
        const accentBtn = document.getElementById('accentToggle');
        if (accentBtn) {
            accentBtn.addEventListener('click', () => {
                applyAccentTheme(currentAccentIndex + 1, true);
            });
        }
    });
})();