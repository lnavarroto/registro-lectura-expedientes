const GAS_URL = 'https://script.google.com/macros/s/AKfycbyBWRh9RciPTjqUxv-A8AzkwwWd_Jv3FJ9Zn9BDoCN_-5Lh64T1iYmAVg87Yjmtkrre/exec';
const REGISTROS_LOCAL_KEY = 'registros_lectura_local_v1';
const MAX_PDF_SIZE_MB = 10;
const RESULTS_PER_PAGE = 10;

let currentResults = [];
let currentPage = 1;
let isActionBusy = false;
let actionProgressTimer = null;

function announce(message, mode = 'polite') {
    const id = mode === 'assertive' ? 'alertLiveRegion' : 'statusLiveRegion';
    const region = document.getElementById(id);
    if (!region) return;
    region.textContent = '';
    setTimeout(() => {
        region.textContent = message;
    }, 20);
}

function normalizeText(value) {
    return (value || '').toString().trim().toUpperCase();
}

function parseDriveFileId(value) {
    const text = (value || '').toString().trim();
    if (!text) return '';

    const idMatchFromPath = text.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (idMatchFromPath) return idMatchFromPath[1];

    const idMatchFromQuery = text.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (idMatchFromQuery) return idMatchFromQuery[1];

    if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;

    return '';
}

function resolvePdfLink(pdfValue) {
    const text = (pdfValue || '').toString().trim();
    if (!text) return '';

    if (/^https?:\/\//i.test(text)) {
        return text;
    }

    const driveId = parseDriveFileId(text);
    if (driveId) {
        return `https://drive.google.com/file/d/${driveId}/view`;
    }

    return '';
}

function extractPdfFileName(pdfValue, resolvedLink = '') {
    const raw = (pdfValue || '').toString().trim();
    if (!raw) return '';

    const inParenthesis = raw.match(/\(([^)]+\.pdf)\)/i);
    if (inParenthesis) {
        return inParenthesis[1].trim();
    }

    const directPdfName = raw.match(/([^\\/]+\.pdf)$/i);
    if (directPdfName && !/^https?:\/\//i.test(raw)) {
        return directPdfName[1].trim();
    }

    const urlCandidate = resolvedLink || raw;
    if (!/^https?:\/\//i.test(urlCandidate)) {
        return '';
    }

    try {
        const url = new URL(urlCandidate);
        const namedParams = ['filename', 'fileName', 'name'];
        for (const param of namedParams) {
            const val = url.searchParams.get(param);
            if (val && /\.pdf$/i.test(val)) {
                return val.trim();
            }
        }

        const pathName = decodeURIComponent(url.pathname || '');
        const pathSegment = pathName.split('/').filter(Boolean).pop() || '';
        if (/\.pdf$/i.test(pathSegment)) {
            return pathSegment.trim();
        }
    } catch {
        return '';
    }

    return '';
}

function escapeHtml(value) {
    return (value || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDateTimeForDisplay(value) {
    const raw = (value || '').toString().trim();
    if (!raw || raw === '-') return '-';

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    const day = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit' });
    const month = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', month: '2-digit' });
    const year = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', year: 'numeric' });
    const hour = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const minute = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', minute: '2-digit' });
    const second = parsed.toLocaleString('es-PE', { timeZone: 'America/Lima', second: '2-digit' });

    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

function getField(record, keys, fallback = '-') {
    for (const key of keys) {
        if (record && record[key] !== undefined && record[key] !== null && record[key] !== '') {
            return record[key];
        }
    }
    return fallback;
}

function getLocalRecords() {
    const raw = localStorage.getItem(REGISTROS_LOCAL_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function setLocalRecords(records) {
    localStorage.setItem(REGISTROS_LOCAL_KEY, JSON.stringify(records));
}

function getCodeFromRecord(record) {
    return getField(record, ['codigo', 'Codigo_Lectura', 'CÓDIGO'], '').toString();
}

function setPdfStatusInRecord(record, value) {
    if ('pdfFirmado' in record) {
        record.pdfFirmado = value;
        return;
    }
    if ('PDF_Firmado' in record) {
        record.PDF_Firmado = value;
        return;
    }
    if ('PDF FIRMADO' in record) {
        record['PDF FIRMADO'] = value;
        return;
    }
    record.pdfFirmado = value;
}

function upsertPdfStatusLocal(codigo, pdfStatus) {
    if (!codigo) return;
    const localRecords = getLocalRecords();
    const idx = localRecords.findIndex((record) => getCodeFromRecord(record) === codigo);
    if (idx >= 0) {
        setPdfStatusInRecord(localRecords[idx], pdfStatus);
    } else {
        localRecords.unshift({ codigo, pdfFirmado: pdfStatus });
    }
    setLocalRecords(localRecords);
}

function matchesQuery(record, query) {
    const q = normalizeText(query);
    if (!q) return true;

    const codigo = getField(record, ['codigo', 'Codigo_Lectura', 'CÓDIGO']);
    const nombre = getField(record, ['nombre', 'Nombre', 'NOMBRE COMPLETO']);
    const dni = getField(record, ['dni', 'DNI', 'NÚMERO DE DOCUMENTO']);
    const expediente = getField(record, ['expediente', 'Expediente', 'NÚMERO DE EXPEDIENTE']);
    const juzgado = getField(record, ['juzgado', 'Juzgado', 'JUZGADO /SALA']);
    const especialista = getField(record, ['especialista', 'Especialista', 'ESPECIALISTA']);
    const rol = getField(record, ['rolProcesal', 'Rol_Procesal', 'ROL PROCESAL']);
    const fecha = getField(record, ['fechaRegistro', 'Fecha_Hora', 'FECHA Y HORA']);
    const fechaFormateada = formatDateTimeForDisplay(fecha);
    const pdf = getField(record, ['pdfFirmado', 'PDF_Firmado', 'PDF FIRMADO']);

    const bag = [
        codigo,
        nombre,
        dni,
        expediente,
        juzgado,
        especialista,
        rol,
        fecha,
        fechaFormateada,
        pdf
    ]
        .map(normalizeText)
        .join(' | ');

    return bag.includes(q);
}

function sortResultsDescending(records) {
    return records.sort((a, b) => {
        const fechaA = getField(a, ['fechaRegistro', 'Fecha_Hora', 'FECHA Y HORA'], '');
        const fechaB = getField(b, ['fechaRegistro', 'Fecha_Hora', 'FECHA Y HORA'], '');
        
        const parsedA = new Date(fechaA).getTime();
        const parsedB = new Date(fechaB).getTime();
        
        if (isNaN(parsedA) || isNaN(parsedB)) {
            return 0;
        }
        
        return parsedB - parsedA;
    });
}

function renderResults(records) {
    currentResults = Array.isArray(records) ? records : [];
    currentResults = sortResultsDescending(currentResults);
    currentPage = 1;
    renderCurrentPage();
}

function renderPagination(totalRecords, page, pageSize) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    if (totalRecords <= pageSize) {
        container.innerHTML = '';
        return;
    }

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalRecords);

    const pageButtons = [];
    const neighbors = 1;

    for (let i = 1; i <= totalPages; i++) {
        const isEdge = i === 1 || i === totalPages;
        const isNear = Math.abs(i - page) <= neighbors;
        if (isEdge || isNear) pageButtons.push(i);
    }

    const buttonHtml = [];
    let previous = 0;
    pageButtons.forEach((pageNumber) => {
        if (previous && pageNumber - previous > 1) {
            buttonHtml.push('<span class="pagination-dots" aria-hidden="true">...</span>');
        }
        buttonHtml.push(`
            <button type="button" class="pagination-btn pagination-number ${pageNumber === page ? 'is-active' : ''}" data-page="${pageNumber}" aria-label="Ir a pagina ${pageNumber}" ${pageNumber === page ? 'aria-current="page"' : ''}>
                ${pageNumber}
            </button>
        `);
        previous = pageNumber;
    });

    container.innerHTML = `
        <div class="pagination-wrap">
            <p class="pagination-info">Mostrando ${start}-${end} de ${totalRecords} registros</p>
            <div class="pagination-controls" role="navigation" aria-label="Paginacion de resultados">
                <button type="button" class="pagination-btn pagination-nav" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Anterior</button>
                ${buttonHtml.join('')}
                <button type="button" class="pagination-btn pagination-nav" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Siguiente</button>
            </div>
        </div>
    `;
}

function renderCurrentPage() {
    const records = Array.isArray(currentResults) ? currentResults : [];
    const totalRecords = records.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / RESULTS_PER_PAGE));

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    if (currentPage < 1) {
        currentPage = 1;
    }

    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const pageRecords = records.slice(startIndex, startIndex + RESULTS_PER_PAGE);

    const body = document.getElementById('resultsBody');
    body.innerHTML = '';

    if (!pageRecords.length) {
        body.innerHTML = '<tr><td colspan="10" class="px-3 py-6 text-center text-slate-500">Sin resultados</td></tr>';
        renderPagination(0, 1, RESULTS_PER_PAGE);
        return;
    }

    const rows = pageRecords.map((record) => {

        const codigo = getField(record, ['codigo', 'Codigo_Lectura', 'CÓDIGO']);
        const nombre = getField(record, ['nombre', 'Nombre', 'NOMBRE COMPLETO']);
        const dni = getField(record, ['dni', 'DNI', 'NÚMERO DE DOCUMENTO']);
        const expediente = getField(record, ['expediente', 'Expediente', 'NÚMERO DE EXPEDIENTE']);
        const juzgado = getField(record, ['juzgado', 'Juzgado', 'JUZGADO /SALA']);
        const especialista = getField(record, ['especialista', 'Especialista', 'ESPECIALISTA']);
        const rol = getField(record, ['rolProcesal', 'Rol_Procesal', 'ROL PROCESAL']);
        const fecha = getField(record, ['fechaRegistro', 'Fecha_Hora', 'FECHA Y HORA']);
        const fechaDisplay = formatDateTimeForDisplay(fecha);
        const estado = getField(record, ['estado', 'Estado', 'ESTADO', 'situacion', 'Situacion', 'SITUACION'], '');

        let pdfFirmado = getField(record, ['pdfFirmado', 'PDF_Firmado', 'PDF FIRMADO', 'pdf', 'PDF', 'PdfFirmado'], 'PENDIENTE');
        pdfFirmado = (pdfFirmado || '').toString().trim();

        const pdfLink = resolvePdfLink(pdfFirmado);
        const normalizedPdf = normalizeText(pdfFirmado);
        const normalizedEstado = normalizeText(estado);
        const isAnulado = normalizedPdf === 'ANULADO' || normalizedEstado === 'ANULADO';
        const isPending = !normalizedPdf || normalizedPdf === 'PENDIENTE' || normalizedPdf === '-' || isAnulado;
        const isSigned = !isPending;
        const hasCode = codigo && codigo !== '-';

        let pdfDisplay = `<span class="pdf-status-pill pdf-status-pending">PENDIENTE</span>`;

        if (isAnulado) {
            pdfDisplay = `<span class="pdf-status-pill pdf-status-pending">ANULADO</span>`;
        } else if (pdfLink) {
            const fallbackFileName = hasCode ? `${codigo}.PDF` : 'ARCHIVO.PDF';
            const pdfFileName = extractPdfFileName(pdfFirmado, pdfLink) || fallbackFileName;
            pdfDisplay = `
                <div class="pdf-file-cell">
                    <span class="pdf-file-name" title="${escapeHtml(pdfFileName)}">${escapeHtml(pdfFileName)}</span>
                </div>
            `;
        } else if (isSigned) {
            pdfDisplay = `<span class="pdf-status-pill pdf-status-signed">${escapeHtml(pdfFirmado)}</span>`;
        }

        const actionButtons = [];

        if (isSigned) {
            const fileNameForLabel = extractPdfFileName(pdfFirmado, pdfLink) || `${codigo}.PDF`;
            const viewPdfAction = pdfLink
                ? `
                    <a href="${escapeHtml(pdfLink)}" target="_blank" rel="noopener noreferrer" class="action-view-btn" aria-label="Ver PDF ${escapeHtml(fileNameForLabel)}">
                        <svg class="pdf-view-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                        </svg>
                        <span>Ver PDF</span>
                    </a>
                `
                : `
                    <button type="button" class="action-view-btn" disabled aria-disabled="true">Ver PDF</button>
                `;

            actionButtons.push(viewPdfAction);
            actionButtons.push(`
                <button
                    type="button"
                    class="action-delete-btn"
                    data-action="delete-pdf"
                    data-codigo="${escapeHtml(codigo)}"
                    ${hasCode ? '' : 'disabled'}
                >
                    <svg class="action-delete-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2z" fill="currentColor"></path>
                        <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z" fill="currentColor" opacity="0.9"></path>
                        <path d="M10 11v7M14 11v7" stroke="#fff" stroke-width="1.7" stroke-linecap="round"></path>
                    </svg>
                    <span>Eliminar</span>
                </button>
            `);
        } else {
            actionButtons.push(`
                <button
                    type="button"
                    class="action-upload-btn"
                    data-action="upload-pdf"
                    data-codigo="${escapeHtml(codigo)}"
                    ${hasCode ? '' : 'disabled'}
                >
                    Subir PDF
                </button>
            `);
        }

        return `
            <tr>
                <td>${escapeHtml(codigo)}</td>
                <td>${escapeHtml(nombre)}</td>
                <td>${escapeHtml(dni)}</td>
                <td class="col-expediente">${escapeHtml(expediente)}</td>
                <td>${escapeHtml(juzgado)}</td>
                <td>${escapeHtml(especialista)}</td>
                <td>${escapeHtml(rol)}</td>
                <td>${escapeHtml(fechaDisplay)}</td>
                <td>${pdfDisplay}</td>
                <td>
                    <div class="action-buttons-group">
                        ${actionButtons.join('')}
                    </div>
                </td>
            </tr>
        `;

    });

    body.innerHTML = rows.join('');
    renderPagination(totalRecords, currentPage, RESULTS_PER_PAGE);
}

function clearMessage() {
    const box = document.getElementById('messageBox');
    if (!box) return;
    box.className = '';
    box.innerHTML = '';
}

function setMessage(text, type = 'info') {
    const box = document.getElementById('messageBox');
    box.className = type;
    box.textContent = text;
}

function setLoadingMessage(text = 'Cargando registros...') {
    const box = document.getElementById('messageBox');
    if (!box) return;

    box.className = 'loading';
    box.innerHTML = `
        <div class="loading-inline" role="status" aria-live="polite" aria-atomic="true">
            <span class="loading-spinner" aria-hidden="true"></span>
            <span class="loading-text">${escapeHtml(text)}</span>
        </div>
        <div class="loading-progress" aria-hidden="true">
            <span class="loading-progress-bar"></span>
        </div>
    `;
}

function renderLoadingSkeleton(rowCount = 6) {
    const body = document.getElementById('resultsBody');
    if (!body) return;

    const rows = Array.from({ length: rowCount }, () => `
        <tr class="skeleton-row" aria-hidden="true">
            ${Array.from({ length: 10 }, () => '<td><span class="skeleton-line"></span></td>').join('')}
        </tr>
    `).join('');

    body.innerHTML = rows;
}

function lockInterface(isBusy) {
    if (isBusy) {
        document.body.classList.add('ui-busy');
    } else {
        document.body.classList.remove('ui-busy');
    }
}

function showActionLoading(title = 'Procesando...', message = 'Por favor espera', progress = 0) {
    const modal = document.getElementById('actionLoadingModal');
    const titleEl = document.getElementById('actionLoadingTitle');
    const messageEl = document.getElementById('actionLoadingMessage');
    const progressBar = document.getElementById('actionProgressBar');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    if (modal) modal.classList.remove('hidden');

    announce(message);
}

function updateActionLoading(message, progress) {
    const messageEl = document.getElementById('actionLoadingMessage');
    const progressBar = document.getElementById('actionProgressBar');

    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;

    announce(message);
}

function hideActionLoading() {
    const modal = document.getElementById('actionLoadingModal');
    const progressBar = document.getElementById('actionProgressBar');

    if (modal) modal.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
}

function startActionProgress(message) {
    clearInterval(actionProgressTimer);

    let progress = 12;
    showActionLoading('Procesando accion', message, progress);

    actionProgressTimer = setInterval(() => {
        progress = Math.min(90, progress + Math.floor(Math.random() * 8) + 3);
        updateActionLoading(message, progress);
        if (progress >= 90) {
            clearInterval(actionProgressTimer);
            actionProgressTimer = null;
        }
    }, 260);
}

function finishActionProgress(message) {
    clearInterval(actionProgressTimer);
    actionProgressTimer = null;

    updateActionLoading(message, 100);

    return new Promise((resolve) => {
        setTimeout(() => {
            hideActionLoading();
            resolve();
        }, 260);
    });
}

function showAdminPasswordDialog() {
    return new Promise((resolve) => {
        const modal = document.getElementById('adminAuthModal');
        const input = document.getElementById('adminPasswordInput');
        const error = document.getElementById('adminPasswordError');
        const cancelBtn = document.getElementById('adminAuthCancelBtn');
        const confirmBtn = document.getElementById('adminAuthConfirmBtn');

        if (!modal || !input || !cancelBtn || !confirmBtn) {
            resolve(null);
            return;
        }

        const cleanup = () => {
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            input.removeEventListener('keydown', onKeyDown);
            modal.classList.add('hidden');
            input.value = '';
            error?.classList.add('hidden');
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const onConfirm = () => {
            const value = input.value.trim();
            if (!value) {
                error?.classList.remove('hidden');
                return;
            }
            cleanup();
            resolve(value);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                onConfirm();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
            }
        };

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        input.addEventListener('keydown', onKeyDown);

        error?.classList.add('hidden');
        modal.classList.remove('hidden');
        input.focus();
    });
}

function showConfirmDialog(title, message, acceptLabel = 'Aceptar') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmActionModal');
        const titleEl = document.getElementById('confirmActionTitle');
        const textEl = document.getElementById('confirmActionText');
        const cancelBtn = document.getElementById('confirmActionCancelBtn');
        const okBtn = document.getElementById('confirmActionOkBtn');

        if (!modal || !cancelBtn || !okBtn) {
            resolve(false);
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (textEl) textEl.textContent = message;
        okBtn.textContent = acceptLabel;

        const cleanup = () => {
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onConfirm);
            document.removeEventListener('keydown', onKeyDown);
            modal.classList.add('hidden');
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                onConfirm();
            }
        };

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onConfirm);
        document.addEventListener('keydown', onKeyDown);

        modal.classList.remove('hidden');
        okBtn.focus();
    });
}

function showNoticeDialog(title, message, tone = 'info') {
    return new Promise((resolve) => {
        const modal = document.getElementById('noticeModal');
        const header = document.getElementById('noticeHeader');
        const titleEl = document.getElementById('noticeTitle');
        const textEl = document.getElementById('noticeText');
        const okBtn = document.getElementById('noticeOkBtn');

        if (!modal || !okBtn) {
            resolve();
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (textEl) textEl.textContent = message;

        header?.classList.remove('custom-modal-header-info', 'custom-modal-header-warn', 'custom-modal-header-admin');
        if (tone === 'error') {
            header?.classList.add('custom-modal-header-warn');
        } else if (tone === 'admin') {
            header?.classList.add('custom-modal-header-admin');
        } else {
            header?.classList.add('custom-modal-header-info');
        }

        const close = () => {
            okBtn.removeEventListener('click', onOk);
            document.removeEventListener('keydown', onKeyDown);
            modal.classList.add('hidden');
            resolve();
        };

        const onOk = () => close();

        const onKeyDown = (event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        };

        okBtn.addEventListener('click', onOk);
        document.addEventListener('keydown', onKeyDown);
        modal.classList.remove('hidden');
        okBtn.focus();
    });
}

// Deprecated: Use showToast from toast-system.js instead
// This function is kept for backward compatibility
function showToastLegacy(message, tone = 'info') {
    const typeMap = {
        'error': 'error',
        'success': 'success',
        'warn': 'warning',
        'warning': 'warning',
        'info': 'info'
    };
    
    return showToast({
        type: typeMap[tone] || 'info',
        message: message,
        duration: tone === 'error' ? 5000 : 4000
    });
}

function animateDeletedStateTransition(codigo) {
    const uploadButtons = Array.from(document.querySelectorAll('#resultsBody button[data-action="upload-pdf"]'));
    const targetUploadBtn = uploadButtons.find((btn) => (btn.dataset.codigo || '') === codigo);
    if (!targetUploadBtn) return;

    const row = targetUploadBtn.closest('tr');
    if (!row) return;

    const pdfCell = row.children[8];
    const actionsCell = row.children[9];

    row.classList.add('row-delete-transition');
    if (pdfCell) pdfCell.classList.add('pdf-cell-transition');
    if (actionsCell) actionsCell.classList.add('actions-cell-transition');

    setTimeout(() => {
        row.classList.remove('row-delete-transition');
        if (pdfCell) pdfCell.classList.remove('pdf-cell-transition');
        if (actionsCell) actionsCell.classList.remove('actions-cell-transition');
    }, 900);
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = (reader.result || '').toString();
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function tryServerUploadPdf(codigo, file) {
    const base64 = await fileToBase64(file);
    const normalizedFileName = `${codigo}.PDF`;
    const payload = new URLSearchParams({
        action: 'subir_pdf',
        codigo,
        fileName: normalizedFileName,
        fileBase64: base64
    });

    const response = await fetch(GAS_URL, {
        method: 'POST',
        body: payload
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data && (data.result === 'success' || data.success === true)) {
        return data;
    }

    throw new Error(data && (data.error || data.message) ? (data.error || data.message) : 'Servidor no confirmo subida de PDF.');
}

function updatePdfStatusOnCurrentResults(codigo, value) {
    currentResults.forEach((record) => {
        if (getCodeFromRecord(record) === codigo) {
            setPdfStatusInRecord(record, value);
        }
    });
}

async function handlePdfUpload(codigo, file) {
    if (isActionBusy) return;

    if (!codigo || codigo === '-') {
        showErrorToast(
            'No se puede subir PDF sin código de atención.',
            'Validación',
            5000
        );
        announce('No se puede subir PDF sin codigo', 'assertive');
        return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        showErrorToast(
            'Seleccione un archivo PDF válido.',
            'Formato Inválido',
            5000
        );
        announce('Seleccione un archivo PDF valido', 'assertive');
        return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_PDF_SIZE_MB) {
        showErrorToast(
            `El PDF excede el límite de ${MAX_PDF_SIZE_MB} MB.`,
            'Archivo Muy Grande',
            5000
        );
        announce('El PDF supera el tamano permitido', 'assertive');
        return;
    }

    isActionBusy = true;
    lockInterface(true);

    startActionProgress(`Subiendo PDF para codigo ${codigo}...`);

    const localStatus = `FIRMADO (${codigo}.PDF)`;

    try {
        updateActionLoading('Preparando archivo para enviar...', 25);
        const result = await tryServerUploadPdf(codigo, file);
        const serverPdfValue = result.pdfUrl || result.fileUrl || result.url || localStatus;

        updateActionLoading('Guardando cambios en la tabla...', 90);
        updatePdfStatusOnCurrentResults(codigo, serverPdfValue);
        upsertPdfStatusLocal(codigo, serverPdfValue);
        renderCurrentPage();
        await finishActionProgress(`Subida completada para codigo ${codigo}`);
        showSuccessToast(
            `El PDF ha sido subido correctamente para el código ${codigo}.`,
            'Subida Exitosa',
            4000
        );
        announce(`PDF firmado subido para codigo ${codigo}`);
    } catch (error) {
        // Fallback local para no bloquear flujo si el endpoint aun no existe en GAS.
        updatePdfStatusOnCurrentResults(codigo, localStatus);
        upsertPdfStatusLocal(codigo, localStatus);
        renderCurrentPage();
        await finishActionProgress(`Subida finalizada localmente para codigo ${codigo}`);
        showWarningToast(
            `El servidor no está disponible. El PDF se marcó localmente como firmado para el código ${codigo}.`,
            'Servidor No Disponible',
            5000
        );
        announce(`PDF marcado localmente como firmado para codigo ${codigo}`, 'assertive');
        console.error('Fallo subida de PDF en servidor, aplicado fallback local:', error);
    } finally {
        lockInterface(false);
        isActionBusy = false;
        clearMessage();
    }
}
async function eliminarPdf(codigo) {
    if (isActionBusy) return;

    const adminKey = await showAdminPasswordDialog();
    if (adminKey === null) return;

    const trimmedAdminKey = adminKey.trim();
    if (!trimmedAdminKey) {
        showErrorToast(
            'Debe ingresar la clave de administrador para continuar.',
            'Clave Requerida',
            5000
        );
        announce('Clave de administrador requerida', 'assertive');
        return;
    }

    const confirmed = await showConfirmDialog(
        'Confirmar eliminacion',
        `Se eliminara el PDF del codigo ${codigo}. Esta accion no se puede deshacer.`,
        'Eliminar PDF'
    );
    if (!confirmed) return;

    isActionBusy = true;
    lockInterface(true);
    startActionProgress(`Eliminando PDF para codigo ${codigo}...`);

    try {

        const payload = new URLSearchParams({
            action: 'eliminar_pdf',
            codigo: codigo,
            password: trimmedAdminKey
        });

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: payload
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.result === "success") {
            updateActionLoading('Actualizando registro local...', 90);

            updatePdfStatusOnCurrentResults(codigo, "PENDIENTE");
            upsertPdfStatusLocal(codigo, 'PENDIENTE');
            renderCurrentPage();
            await finishActionProgress(`PDF eliminado para codigo ${codigo}`);
            animateDeletedStateTransition(codigo);

            showSuccessToast(
                `El PDF ha sido eliminado correctamente para el código ${codigo}.`,
                'Eliminación Exitosa',
                4000
            );
            announce(`PDF eliminado para codigo ${codigo}`);

        } else {

            throw new Error(data.error || data.message || "Error al eliminar PDF");

        }

    } catch (error) {

        console.error(error);
        await finishActionProgress(`No se pudo eliminar el PDF de ${codigo}`);

        const normalizedError = (error && error.message ? error.message : '').toString().trim();
        const isWrongPassword = /clave\s+incorrecta/i.test(normalizedError);
        const isMissingPassword = /clave\s+requerida|password\s+required|required\s+password/i.test(normalizedError);

        const toastMessage = isWrongPassword
            ? 'La clave de administrador es incorrecta. El PDF no fue eliminado.'
            : isMissingPassword
                ? 'Debe ingresar la clave de administrador para continuar.'
                : 'No se pudo eliminar el PDF. Por favor, intente nuevamente.';

        const toastTitle = isWrongPassword
            ? 'Clave Incorrecta'
            : isMissingPassword
                ? 'Clave Requerida'
                : 'Error en Eliminación';

        const announceMessage = isWrongPassword
            ? 'Clave de administrador incorrecta'
            : isMissingPassword
                ? 'Clave de administrador requerida'
                : 'Error eliminando PDF';

        showErrorToast(
            toastMessage,
            toastTitle,
            5000
        );
        announce(announceMessage, 'assertive');

    } finally {
        lockInterface(false);
        isActionBusy = false;
        clearMessage();
    }

}
function openPdfPickerForCode(codigo) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.onchange = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await handlePdfUpload(codigo, file);
    };
    input.click();
}


async function tryServerList() {

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {

        const url = `${GAS_URL}?action=listar`;

        const response = await fetch(url,{signal:controller.signal});

        if(!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // aceptar varios formatos posibles
        if(Array.isArray(data)) return data;

        if(data && Array.isArray(data.data)) return data.data;

        if(data && Array.isArray(data.registros)) return data.registros;

        console.log("Respuesta servidor:",data);

        throw new Error("Formato de respuesta no compatible para listar.");

    } finally {

        clearTimeout(timeout);

    }

}

async function cargarRegistrosIniciales() {

    setLoadingMessage('Cargando registros...');
    renderLoadingSkeleton(6);
    announce('Cargando registros');

    try {

        const serverRecords = await tryServerList();

        renderResults(serverRecords);
        setLocalRecords(serverRecords);

        showInfoToast(
            `Se cargaron ${serverRecords.length} registros desde el servidor.`,
            'Carga Completada',
            3500
        );

        announce(`Se cargaron ${serverRecords.length} registros`);

    } catch (error) {

        const local = getLocalRecords();
        renderResults(local);

        if (local.length) {

            showWarningToast(
                `El servidor no está disponible. Se muestran ${local.length} registro(s) almacenado(s) localmente.`,
                'Usando Datos Locales',
                4500
            );

            announce('Mostrando registros locales', 'assertive');

        } else {

            showErrorToast(
                'No se pudo conectar al servidor y no hay datos guardados localmente.',
                'Sin Datos Disponibles',
                5000
            );

            announce('No hay registros para mostrar', 'assertive');

        }

        console.error('No fue posible cargar listado inicial desde servidor:', error);

    } finally {

        clearMessage();

    }

}

async function runSearch(query) {

    const form = document.getElementById('searchForm');
    const button = document.getElementById('searchButton');
    const clearButton = document.getElementById('clearSearchButton');

    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    if (clearButton) clearButton.disabled = true;

    setLoadingMessage('Buscando registros...');
    renderLoadingSkeleton(4);

    try {

        const local = getLocalRecords();

        const resultados = local.filter(r => matchesQuery(r, query));

        renderResults(resultados);

        showInfoToast(
            `Se encontraron ${resultados.length} resultado(s).`,
            'Búsqueda Completada',
            3500
        );

    } catch (error) {

        console.error(error);

    } finally {

        form.setAttribute('aria-busy', 'false');
        button.disabled = false;
        if (clearButton) clearButton.disabled = false;
        clearMessage();

    }

}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('searchForm');
    const input = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearchButton');
    const resultsBody = document.getElementById('resultsBody');
    const paginationContainer = document.getElementById('paginationContainer');

    cargarRegistrosIniciales();

    const refreshBtn = document.getElementById('refreshTableBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarRegistrosIniciales();
        });
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) {
            input.focus();
            announce('Ingresa un termino para buscar', 'assertive');
            return;
        }
        runSearch(query);
    });

    clearButton.addEventListener('click', () => {
        input.value = '';
        const local = getLocalRecords();
        renderResults(local);
        input.focus();
    });

    resultsBody.addEventListener('click', (event) => {

    if (isActionBusy) return;

    const target = event.target.closest("button");

    if (!target) return;

    const action = target.dataset.action;
    const codigo = target.dataset.codigo || '';

    if (action === "upload-pdf") {
        openPdfPickerForCode(codigo);
    }

    if (action === "delete-pdf") {
        eliminarPdf(codigo);
    }

});

    paginationContainer?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const button = target.closest('[data-page]');
        if (!(button instanceof HTMLButtonElement)) return;
        if (button.disabled) return;

        const nextPage = Number(button.dataset.page || '1');
        if (!Number.isFinite(nextPage)) return;

        currentPage = nextPage;
        renderCurrentPage();
    });
});
