// URL de tu Google Apps Script
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyBWRh9RciPTjqUxv-A8AzkwwWd_Jv3FJ9Zn9BDoCN_-5Lh64T1iYmAVg87Yjmtkrre/exec';
const PRINT_REGISTER_TEXT = '🖨️ Imprimir y Registrar Datos';
const ESPECIALISTAS_CACHE_KEY = 'especialistas_cache';
const ESPECIALISTAS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
const BORRADOR_REGISTRO_KEY = 'registro_lectura_borrador_v1';
const REGISTROS_LOCAL_KEY = 'registros_lectura_local_v1';
const REGISTROS_LOCAL_MAX = 300;

let ultimoRegistroImpreso = null;
let ultimaFirmaRegistrada = '';
let isSubmitting = false;

// ===== FUNCIONES DE UTILIDAD PARA SPINNER =====

/**
 * Muestra el spinner modal con mensaje y progreso
 * @param {string} title - Título del modal
 * @param {string} message - Mensaje de progreso
 * @param {number} progress - Porcentaje de progreso (0-100)
 */
function showLoading(title = 'Procesando...', message = 'Por favor espera', progress = 0) {
    const modal = document.getElementById('loadingModal');
    const titleEl = document.getElementById('loadingTitle');
    const messageEl = document.getElementById('loadingMessage');
    const progressBar = document.getElementById('progressBar');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = progress + '%';
    announceLiveMessage(message);
    
    modal.classList.remove('hidden');
}

/**
 * Actualiza el progreso del spinner
 */
function updateLoading(message, progress) {
    const messageEl = document.getElementById('loadingMessage');
    const progressBar = document.getElementById('progressBar');

    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = progress + '%';
    announceLiveMessage(message);
}

/**
 * Oculta el spinner modal
 */
function hideLoading() {
    const modal = document.getElementById('loadingModal');
    modal.classList.add('hidden');
}

function announceLiveMessage(message, mode = 'polite') {
    const regionId = mode === 'assertive' ? 'alertLiveRegion' : 'statusLiveRegion';
    const region = document.getElementById(regionId);
    if (!region) return;

    // Reinicio breve para forzar lectura por lector de pantalla aunque se repita texto.
    region.textContent = '';
    window.setTimeout(() => {
        region.textContent = message;
    }, 20);
}

function setFormBusyState(isBusy) {
    const form = document.getElementById('registroForm');
    if (form) {
        form.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
}

function enfocarPrimerCampoInvalido(form) {
    if (!form) return;
    const invalidField = form.querySelector(':invalid');
    if (!invalidField) return;

    if (typeof invalidField.focus === 'function') {
        invalidField.focus();
    }
    if (typeof invalidField.scrollIntoView === 'function') {
        invalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function obtenerMarcasDeTiempo(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return {
        dateTimeLocalString: `${year}-${month}-${day}T${hours}:${minutes}`,
        fechaImpresion: now.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/'),
        horaImpresion: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        fechaRegistro: now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
        horaRegistro: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
}

// ===== METODOS DE IMPRESION Y RESUMEN =====

// Muestra el texto de registro en pantalla web y en la version de impresion.
function actualizarResumenRegistro(registroTexto) {
    const registroFechaHora = document.getElementById('registro-fecha-hora');
    const registroFechaHoraPrint = document.getElementById('registro-fecha-hora-print');

    registroFechaHora.innerHTML = registroTexto;
    registroFechaHora.style.display = 'block';
    registroFechaHoraPrint.innerHTML = registroTexto;
}

// Arma el objeto final que se usara para poblar el bloque de impresion.
function construirDatosImpresion({ codigo, expControlValue, responsableEditable, marcasTiempo, registroTexto }) {
    const getSelectText = (id) => document.getElementById(id).options[document.getElementById(id).selectedIndex].text;
    const otroRolValue = document.getElementById('otroRol').value;
    const rolProcesalBase = getSelectText('parteProcesal');
    const mostrarOtroRol = document.getElementById('parteProcesal').value === 'Otro' && !!otroRolValue;

    return {
        codigo,
        nombre: document.getElementById('nombre').value,
        dni: document.getElementById('dni').value,
        expediente: expControlValue,
        juzgado: getSelectText('juzgado'),
        especialista: getSelectText('especialista'),
        rolProcesal: rolProcesalBase,
        mostrarOtroRol,
        otroRol: otroRolValue,
        responsable: responsableEditable,
        fechaControlImpresion: `${marcasTiempo.fechaImpresion} ${marcasTiempo.horaImpresion}`,
        registroTexto
    };
}

// Lanza la impresion con un pequeno delay para que la UI termine de actualizarse.
function iniciarImpresionDiferida(delayMs = 500) {
    setTimeout(() => {
        hideLoading();
        window.print();
    }, delayMs);
}

// ===== GUARDADO OFFLINE TEMPORAL (BORRADOR) =====

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function guardarBorradorTemporal() {
    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };

    const responsable = document.getElementById('responsable-1')
        ? document.getElementById('responsable-1').textContent.trim()
        : '';

    const borrador = {
        apellidos: getValue('apellidos'),
        nombres: getValue('nombres'),
        dni: getValue('dni'),
        expediente: getValue('expediente'),
        juzgado: getValue('juzgado'),
        especialista: getValue('especialista'),
        parteProcesal: getValue('parteProcesal'),
        otroRol: getValue('otroRol'),
        expControl1: getValue('exp-control-1'),
        expControl2: getValue('exp-control-2'),
        fechaControl1: getValue('fecha-control-1'),
        responsable,
        timestamp: Date.now()
    };

    localStorage.setItem(BORRADOR_REGISTRO_KEY, JSON.stringify(borrador));
}

function obtenerBorradorTemporal() {
    const raw = localStorage.getItem(BORRADOR_REGISTRO_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        localStorage.removeItem(BORRADOR_REGISTRO_KEY);
        return null;
    }
}

function limpiarBorradorTemporal() {
    localStorage.removeItem(BORRADOR_REGISTRO_KEY);
}

function aplicarValorSiExiste(id, value) {
    const element = document.getElementById(id);
    if (!element || value === undefined || value === null) return;
    element.value = value;
}

function aplicarBorradorTemporalAlFormulario(borrador) {
    if (!borrador) return;

    aplicarValorSiExiste('apellidos', borrador.apellidos);
    aplicarValorSiExiste('nombres', borrador.nombres);
    aplicarValorSiExiste('dni', borrador.dni);
    aplicarValorSiExiste('expediente', borrador.expediente);
    aplicarValorSiExiste('juzgado', borrador.juzgado);
    aplicarValorSiExiste('parteProcesal', borrador.parteProcesal);
    aplicarValorSiExiste('otroRol', borrador.otroRol);
    aplicarValorSiExiste('exp-control-1', borrador.expControl1);
    aplicarValorSiExiste('exp-control-2', borrador.expControl2);
    aplicarValorSiExiste('fecha-control-1', borrador.fechaControl1);

    const responsable = document.getElementById('responsable-1');
    if (responsable && borrador.responsable) {
        responsable.textContent = borrador.responsable;
    }

    // Especialista puede cargarse después desde servidor/cache, por eso se intenta en cada repoblado del select.
    const especialistaSelect = document.getElementById('especialista');
    if (especialistaSelect && borrador.especialista) {
        const existe = Array.from(especialistaSelect.options).some((opt) => opt.value === borrador.especialista);
        if (existe) {
            especialistaSelect.value = borrador.especialista;
        }
    }

    syncNombreCompleto();
    syncExpediente();
    manejarOtroRol();
    mostrarEjemploExpediente();
}

function guardarRegistroEnHistorialLocal(registro) {
    if (!registro || !registro.codigo || registro.codigo === 'ERROR') return;

    let historial = [];
    try {
        const raw = localStorage.getItem(REGISTROS_LOCAL_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        historial = Array.isArray(parsed) ? parsed : [];
    } catch {
        historial = [];
    }

    // Evita duplicados por codigo, conservando el mas reciente.
    historial = historial.filter((item) => item.codigo !== registro.codigo);
    historial.unshift(registro);

    if (historial.length > REGISTROS_LOCAL_MAX) {
        historial = historial.slice(0, REGISTROS_LOCAL_MAX);
    }

    localStorage.setItem(REGISTROS_LOCAL_KEY, JSON.stringify(historial));
}

// ===== FUNCIONES DE UTILIDAD PARA CACHEO =====

/**
 * Guarda especialistas en localStorage
 */
function guardarEspecialistasEnCache(especialistas) {
    const cacheData = {
        especialistas: especialistas,
        timestamp: Date.now()
    };
    localStorage.setItem(ESPECIALISTAS_CACHE_KEY, JSON.stringify(cacheData));
}

/**
 * Obtiene especialistas del cache si son válidos
 */
function obtenerEspecialistasDelCache() {
    const cached = localStorage.getItem(ESPECIALISTAS_CACHE_KEY);
    if (!cached) return null;

    try {
        const cacheData = JSON.parse(cached);
        const ahora = Date.now();
        
        // Si el cache es más viejo que TTL, descartarlo
        if (ahora - cacheData.timestamp > ESPECIALISTAS_CACHE_TTL) {
            localStorage.removeItem(ESPECIALISTAS_CACHE_KEY);
            return null;
        }
        
        return cacheData.especialistas;
    } catch (err) {
        localStorage.removeItem(ESPECIALISTAS_CACHE_KEY);
        return null;
    }
}

// ===== FUNCIONES ORIGINALES (SIN CAMBIOS) =====

function getActionControls() {
    return {
        clearButton: document.getElementById('clearButton'),
        registerButton: document.getElementById('registerPrintButton'),
        reprintButton: document.getElementById('reprintButton'),
        editButton: document.getElementById('editButton'),
        searchLink: document.getElementById('searchLink')
    };
}

function setRegisteringState(isBusy, registerText) {
    const controls = getActionControls();
    setFormBusyState(isBusy);

    if (controls.registerButton) {
        controls.registerButton.disabled = isBusy;
        controls.registerButton.style.opacity = isBusy ? '0.7' : '';
        controls.registerButton.style.cursor = isBusy ? 'not-allowed' : '';
        controls.registerButton.innerHTML = isBusy
            ? '⌛ Registrando datos y generando codigo...'
            : (registerText || PRINT_REGISTER_TEXT);
        controls.registerButton.style.backgroundColor = isBusy ? '#ffc107' : '';
    }

    if (controls.clearButton) {
        controls.clearButton.disabled = isBusy;
        controls.clearButton.style.opacity = isBusy ? '0.7' : '';
        controls.clearButton.style.cursor = isBusy ? 'not-allowed' : '';
    }

    if (controls.reprintButton) {
        controls.reprintButton.disabled = isBusy;
        controls.reprintButton.style.opacity = isBusy ? '0.7' : '';
        controls.reprintButton.style.cursor = isBusy ? 'not-allowed' : '';
    }

    if (controls.editButton) {
        controls.editButton.disabled = isBusy;
        controls.editButton.style.opacity = isBusy ? '0.7' : '';
        controls.editButton.style.cursor = isBusy ? 'not-allowed' : '';
    }

    if (controls.searchLink) {
        controls.searchLink.style.pointerEvents = isBusy ? 'none' : '';
        controls.searchLink.style.opacity = isBusy ? '0.7' : '';
        controls.searchLink.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
    }
}

function actualizarEstadoReimpresion(disponible) {
    const reprintButton = document.getElementById('reprintButton');
    const registerButton = document.getElementById('registerPrintButton');
    if (!reprintButton || !registerButton) return;

    if (disponible) {
        registerButton.classList.add('hidden');
        reprintButton.classList.remove('hidden');
        reprintButton.classList.add('inline-flex');
    } else {
        registerButton.classList.remove('hidden');
        reprintButton.classList.add('hidden');
        reprintButton.classList.remove('inline-flex');
    }
}

function filtrarSoloNumeros(input, maxLength) {
    let limpio = input.value.replace(/\D/g, '');
    if (typeof maxLength === 'number') {
        limpio = limpio.slice(0, maxLength);
    }
    input.value = limpio;
}

function filtrarSoloLetras(input) {
    const enMayusculas = input.value.toUpperCase();
    input.value = enMayusculas.replace(/[^A-ZÁÉÍÓÚÜÑ\s]/g, '');
}

// Normaliza expediente para que se vea igual en formulario, tabla y salida impresa.
function normalizarNumeroExpediente(valor) {
    return (valor || '')
        .toString()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function obtenerFirmaFormularioActual() {
    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value.trim().toUpperCase() : '';
    };

    const responsable = document.getElementById('responsable-1')
        ? document.getElementById('responsable-1').textContent.trim().toUpperCase()
        : '';

    return [
        getValue('nombre'),
        getValue('dni'),
        getValue('expediente'),
        getValue('juzgado'),
        getValue('especialista'),
        getValue('parteProcesal'),
        getValue('otroRol'),
        getValue('exp-control-1'),
        getValue('exp-control-2'),
        responsable
    ].join('|');
}

function invalidarRegistroSiHuboCambios() {
    if (!ultimaFirmaRegistrada) return;

    const firmaActual = obtenerFirmaFormularioActual();
    if (firmaActual !== ultimaFirmaRegistrada) {
        ultimoRegistroImpreso = null;
        ultimaFirmaRegistrada = '';

        document.getElementById('codigo_lectura').value = '';
        document.getElementById('print-codigo').textContent = '';
        document.getElementById('registro-fecha-hora').style.display = 'none';
        document.getElementById('registro-fecha-hora-print').innerHTML = '';

        actualizarEstadoReimpresion(false);
    }
}

function reimprimirCargo() {
    if (isSubmitting) return;

    const firmaActual = obtenerFirmaFormularioActual();
    if (!ultimoRegistroImpreso || !document.getElementById('codigo_lectura').value.trim()) {
        showWarningToast(
            'Debe registrar un cargo primero antes de reimprimir.',
            'Reimpresión No Disponible',
            4500
        );
        return;
    }

    if (firmaActual !== ultimaFirmaRegistrada) {
        showErrorToast(
            'Se detectaron cambios en el formulario. Debe registrar nuevamente para generar un nuevo cargo.',
            'Formulario Modificado',
            5000
        );
        return;
    }

    poblarVistaImpresion(ultimoRegistroImpreso);
    window.print();
}

function poblarVistaImpresion(data) {
    document.getElementById('print-codigo').textContent = data.codigo;
    document.getElementById('print-nombre').textContent = data.nombre;
    document.getElementById('print-dni').textContent = data.dni;
    document.getElementById('print-expediente').textContent = data.expediente;
    document.getElementById('print-juzgado').textContent = data.juzgado;
    document.getElementById('print-especialista').textContent = data.especialista;
    document.getElementById('print-rol').textContent = data.rolProcesal;

    if (data.mostrarOtroRol) {
        document.getElementById('print-otro-rol-group').style.display = 'flex';
        document.getElementById('print-otro-rol').textContent = data.otroRol;
    } else {
        document.getElementById('print-otro-rol-group').style.display = 'none';
        document.getElementById('print-otro-rol').textContent = '';
    }

    document.getElementById('registro-fecha-hora').innerHTML = data.registroTexto;
    document.getElementById('registro-fecha-hora').style.display = 'block';
    document.getElementById('registro-fecha-hora-print').innerHTML = data.registroTexto;

    document.getElementById('print-exp-1').textContent = data.expediente;
    document.getElementById('print-resp-1').textContent = data.responsable;
    document.getElementById('print-fecha-1').textContent = data.fechaControlImpresion;
    document.getElementById('print-exp-2').textContent = data.expediente;
}

// Sincroniza automaticamente el expediente principal con la tabla de control.
function syncExpediente() {
    const expedienteInput = document.getElementById('expediente');
    const expValue = normalizarNumeroExpediente(expedienteInput ? expedienteInput.value : '');

    if (expedienteInput) {
        expedienteInput.value = expValue;
    }

    const expControl1 = document.getElementById('exp-control-1');
    if (expControl1) {
        expControl1.value = expValue;
    }

    const expControl2 = document.getElementById('exp-control-2');
    if (expControl2) {
        expControl2.value = expValue;
    }
}

function syncNombreCompleto() {
    const apellidos = document.getElementById('apellidos')
        ? document.getElementById('apellidos').value.trim().toUpperCase()
        : '';
    const nombres = document.getElementById('nombres')
        ? document.getElementById('nombres').value.trim().toUpperCase()
        : '';
    const nombreCompleto = [apellidos, nombres].filter(Boolean).join(' ');

    const nombreHidden = document.getElementById('nombre');
    if (nombreHidden) {
        nombreHidden.value = nombreCompleto;
    }
}

function mostrarEjemploExpediente() {
    const inputField = document.getElementById('expediente');
    const exampleGuide = document.getElementById('expediente-guia');
    const placeholderText = 'Ej: 00659-2025-0-3101-JR-CI-01';

    if (inputField.value.length > 0) {
        inputField.placeholder = '';
        exampleGuide.classList.remove('hidden');
    } else {
        inputField.placeholder = placeholderText;
        exampleGuide.classList.add('hidden');
    }
}

function validarFormularioConFoco(form) {
    if (form.checkValidity()) return true;

    announceLiveMessage('Hay campos obligatorios pendientes. Se enfocara el primer campo con error.', 'assertive');
    form.reportValidity();
    enfocarPrimerCampoInvalido(form);
    return false;
}

function manejarOtroRol() {
    const parteProcesal = document.getElementById('parteProcesal').value;
    const otroRolGroup = document.getElementById('otroRolGroup');
    const otroRolInput = document.getElementById('otroRol');

    if (parteProcesal === 'Otro') {
        otroRolGroup.style.display = 'flex';
        otroRolInput.setAttribute('required', 'required');
    } else {
        otroRolGroup.style.display = 'none';
        otroRolInput.removeAttribute('required');
        otroRolInput.value = '';
    }
}

function toggleEditResponsable() {
    if (isSubmitting) return;

    const tdElement = document.getElementById('responsable-1');
    const editButton = document.getElementById('editButton');

    if (tdElement.querySelector('input')) {
        const inputElement = tdElement.querySelector('input');
        const newName = inputElement.value.trim().toUpperCase() || 'RESPONSABLE NO DEFINIDO';

        tdElement.textContent = newName;

        editButton.textContent = 'Editar Responsable';
        editButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        editButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
    } else {
        const currentName = tdElement.textContent.trim();

        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentName;
        inputElement.placeholder = 'Nombre del Responsable';
        inputElement.oninput = function() {
            this.value = this.value.toUpperCase();
        };

        inputElement.style.width = '100%';
        inputElement.style.padding = '0.25rem 0.5rem';
        inputElement.style.textAlign = 'center';

        tdElement.innerHTML = '';
        tdElement.appendChild(inputElement);

        inputElement.focus();

        editButton.textContent = 'Guardar Responsable';
        editButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        editButton.classList.add('bg-green-600', 'hover:bg-green-700');
    }
}

function limpiarCampos() {
    if (isSubmitting) return;

    document.getElementById('registroForm').reset();
    document.getElementById('registro-fecha-hora').style.display = 'none';
    document.getElementById('registro-fecha-hora-print').innerHTML = '';

    ultimoRegistroImpreso = null;
    ultimaFirmaRegistrada = '';
    actualizarEstadoReimpresion(false);

    document.getElementById('otroRolGroup').style.display = 'none';
    document.getElementById('print-otro-rol-group').style.display = 'none';

    document.getElementById('codigo_lectura').value = '';
    document.getElementById('print-codigo').textContent = '';

    document.getElementById('especialista').selectedIndex = 0;

    const tdResponsable = document.getElementById('responsable-1');
    if (tdResponsable) {
        tdResponsable.textContent = 'LUIS SANCHEZ SEGURA';
        const editButton = document.getElementById('editButton');
        editButton.textContent = 'Editar Responsable';
        editButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        editButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
    }

    const fechaControl1 = document.getElementById('fecha-control-1');
    if (fechaControl1) fechaControl1.value = '';
    const expControl1 = document.getElementById('exp-control-1');
    if (expControl1) expControl1.value = '';
    const expControl2 = document.getElementById('exp-control-2');
    if (expControl2) expControl2.value = '';

    syncNombreCompleto();
    manejarOtroRol();
    mostrarEjemploExpediente();
    limpiarBorradorTemporal();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoPrint').src = '../logo.png';

    const borradorInicial = obtenerBorradorTemporal();
    if (borradorInicial) {
        aplicarBorradorTemporalAlFormulario(borradorInicial);
        console.log('📝 Borrador offline restaurado desde localStorage.');
    }

const selectEspecialista = document.getElementById('especialista');

// 1️⃣ Intentar cargar desde CACHE primero
const especialistasEnCache = obtenerEspecialistasDelCache();

function llenarSelectEspecialistas(lista) {
    selectEspecialista.innerHTML = '<option value="">-- Seleccione Especialista --</option>';

    for (const especialista of lista) {
        const option = document.createElement('option');
        option.value = especialista;
        option.textContent = especialista;
        selectEspecialista.appendChild(option);
    }
}

function normalizarRespuestaEspecialistas(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.especialistas)) return data.especialistas;
    return [];
}

if (especialistasEnCache && especialistasEnCache.length > 0) {

    // 🔹 Usar CACHE inmediatamente
    llenarSelectEspecialistas(especialistasEnCache);
    console.log("⚡ Especialistas cargados desde CACHE");

    // 🔹 Actualizar en background
    fetch(GAS_URL + '?action=especialistas')
    .then(r => r.json())
    .then(data => {

        const listaServidor = normalizarRespuestaEspecialistas(data);

        if (
            listaServidor.length > 0 &&
            JSON.stringify(listaServidor) !== JSON.stringify(especialistasEnCache)
        ) {
            guardarEspecialistasEnCache(listaServidor);
            console.log("🔄 Cache actualizado desde servidor");
        }

    })
    .catch(err => {
        console.warn("⚠️ No se pudo actualizar especialistas:", err);
    });

} else {

    // 🔹 No hay cache → cargar desde servidor
    selectEspecialista.innerHTML = '<option value="">-- Cargando Especialistas --</option>';

    fetch(GAS_URL + '?action=especialistas')
    .then(response => {

        if (!response.ok) {
            throw new Error("Error HTTP " + response.status);
        }

        return response.json();
    })
    .then(data => {

        const lista = normalizarRespuestaEspecialistas(data);

        if (lista.length === 0) {
            throw new Error("Lista vacía");
        }

        guardarEspecialistasEnCache(lista);
        llenarSelectEspecialistas(lista);

        console.log("✅ Especialistas cargados desde servidor");

    })
    .catch(error => {

        console.error("❌ Error cargando especialistas:", error);

        selectEspecialista.innerHTML =
        '<option value="">-- No se pudieron cargar especialistas --</option>';

        showErrorToast(
            "No se pudo cargar la lista de especialistas. Verifique conexión.",
            "Error de Conexión",
            5000
        );

    });

}
    // ===== EVENT LISTENERS PARA CAMPOS DE ENTRADA =====
    
    // Apellidos: filtrar solo letras y sincronizar nombre completo
    const apellidosInput = document.getElementById('apellidos');
    if (apellidosInput) {
        apellidosInput.addEventListener('input', (e) => {
            filtrarSoloLetras(e.target);
            syncNombreCompleto();
        });
    }

    // Nombres: filtrar solo letras y sincronizar nombre completo
    const nombresInput = document.getElementById('nombres');
    if (nombresInput) {
        nombresInput.addEventListener('input', (e) => {
            filtrarSoloLetras(e.target);
            syncNombreCompleto();
        });
    }

    // DNI: filtrar solo números (máximo 8)
    const dniInput = document.getElementById('dni');
    if (dniInput) {
        dniInput.addEventListener('input', (e) => {
            filtrarSoloNumeros(e.target, 8);
        });
    }

    // Expediente: convertir a mayúsculas, sincronizar controles y mostrar guía
    const expedienteInput = document.getElementById('expediente');
    if (expedienteInput) {
        expedienteInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            syncExpediente();
            mostrarEjemploExpediente();
        });
    }

    // Otro Rol: convertir a mayúsculas
    const otroRolInput = document.getElementById('otroRol');
    if (otroRolInput) {
        otroRolInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Rol Procesal: manejar "Otro" rol
    const parteProcesal = document.getElementById('parteProcesal');
    if (parteProcesal) {
        parteProcesal.addEventListener('change', () => {
            manejarOtroRol();
        });
    }

    // ===== EVENT LISTENERS PARA BOTONES =====
    
    // Botón Editar Responsable
    const editButton = document.getElementById('editButton');
    if (editButton) {
        editButton.addEventListener('click', toggleEditResponsable);
    }

    // Botón Limpiar Datos
    const clearButton = document.getElementById('clearButton');
    if (clearButton) {
        clearButton.addEventListener('click', limpiarCampos);
    }

    // Botón Reimprimir
    const reprintButton = document.getElementById('reprintButton');
    if (reprintButton) {
        reprintButton.addEventListener('click', reimprimirCargo);
    }

    manejarOtroRol();

    syncNombreCompleto();
    mostrarEjemploExpediente();
    actualizarEstadoReimpresion(false);

    const form = document.getElementById('registroForm');
    const guardarBorradorConDebounce = debounce(guardarBorradorTemporal, 400);
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        enviarEImprimir();
    });
    form.addEventListener('input', invalidarRegistroSiHuboCambios);
    form.addEventListener('change', invalidarRegistroSiHuboCambios);
    form.addEventListener('input', guardarBorradorConDebounce);
    form.addEventListener('change', guardarBorradorTemporal);

  }); 


async function enviarEImprimir() {
    // Metodo principal: valida, registra en GAS, prepara impresion y lanza print.
    if (isSubmitting) return;

    syncNombreCompleto();
    const form = document.getElementById('registroForm');
    if (!validarFormularioConFoco(form)) {
        console.error('Por favor, rellena todos los campos obligatorios antes de imprimir y registrar.');
        return;
    }

    const firmaActual = obtenerFirmaFormularioActual();
    const codigoGuardado = document.getElementById('codigo_lectura').value.trim();

    if (codigoGuardado && ultimoRegistroImpreso && firmaActual === ultimaFirmaRegistrada) {
        announceLiveMessage('Este registro ya fue guardado. Use Reimprimir Cargo.', 'assertive');
        showInfoToast(
            'Este código ya fue registrado. Use el botón "Reimprimir Cargo" para imprimir nuevamente.',
            'Registro ya Existe',
            4500
        );
        return;
    }

    const printButton = document.querySelector('.print-button');
    const originalText = printButton.innerHTML;
    isSubmitting = true;
    setRegisteringState(true, originalText);

    // Mostrar spinner
    showLoading('⏳ Registrando', 'Conectando con el servidor...', 10);

    const now = new Date();
    const marcasTiempo = obtenerMarcasDeTiempo(now);

    const fechaControl1 = document.getElementById('fecha-control-1');
    if (fechaControl1) {
        fechaControl1.value = marcasTiempo.dateTimeLocalString;
    }

    const expedienteInput = document.getElementById('expediente');
    const expControlValue = normalizarNumeroExpediente(expedienteInput ? expedienteInput.value : '');
    if (expedienteInput) {
        expedienteInput.value = expControlValue;
    }
    syncExpediente();

    const formData = new FormData(form);

    const responsableEditable = document.getElementById('responsable-1').textContent.trim();

    formData.append('Responsable_Control', responsableEditable);
    formData.append('Fecha_Control_1', fechaControl1 ? fechaControl1.value : '');

    try {
        updateLoading('📤 Enviando datos...', 30);

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: new URLSearchParams(formData)
        });

        if (!response.ok) throw new Error(`Error en la respuesta del servidor: ${response.status}`);

        updateLoading('⚙️ Procesando registro...', 60);

        const result = await response.json();

        if (result.error || result.result === 'error') {
            console.error('Error al registrar en Google Sheets:', result.error || result.message);
            hideLoading();
            announceLiveMessage('Ocurrio un error al registrar en Google Sheets.', 'assertive');
            showErrorToast(
                `Error al registrar: ${result.error || result.message}. Consulte la consola del navegador para más detalles.`,
                'Error en Registro',
                5000
            );
            throw new Error(result.error || result.message);
        }

        updateLoading('✅ Registro completado...', 90);

        const codigo = result.codigo_lectura || 'ERROR';
        document.getElementById('codigo_lectura').value = codigo;
        document.getElementById('print-codigo').textContent = codigo;

        const registroTexto = `Registrado el: <strong>${marcasTiempo.fechaRegistro}</strong> a las <strong>${marcasTiempo.horaRegistro}</strong> hrs.`;
        actualizarResumenRegistro(registroTexto);

        ultimoRegistroImpreso = construirDatosImpresion({
            codigo,
            expControlValue,
            responsableEditable,
            marcasTiempo,
            registroTexto
        });

        poblarVistaImpresion(ultimoRegistroImpreso);
        ultimaFirmaRegistrada = firmaActual;
        actualizarEstadoReimpresion(true);
        limpiarBorradorTemporal();
        guardarRegistroEnHistorialLocal({
            codigo: ultimoRegistroImpreso.codigo,
            nombre: ultimoRegistroImpreso.nombre,
            dni: ultimoRegistroImpreso.dni,
            expediente: ultimoRegistroImpreso.expediente,
            juzgado: ultimoRegistroImpreso.juzgado,
            especialista: ultimoRegistroImpreso.especialista,
            rolProcesal: ultimoRegistroImpreso.rolProcesal,
            fechaRegistro: `${marcasTiempo.fechaRegistro} ${marcasTiempo.horaRegistro}`,
            pdfFirmado: 'PENDIENTE'
        });
        announceLiveMessage(`Registro completado. Codigo generado: ${codigo}.`);
        showSuccessToast(
            `Registro completado exitosamente. Código generado: ${codigo}`,
            'Registro Exitoso',
            4000
        );

        updateLoading('🖨️ Preparando impresión...', 100);

        iniciarImpresionDiferida(500);

    } catch (error) {
        hideLoading();
        announceLiveMessage('Ocurrio un error grave al registrar los datos.', 'assertive');
        showErrorToast(
            'Ocurrió un error grave al registrar los datos. Por favor, revise la consola del navegador para más detalles.',
            'Error Crítico',
            5000
        );
        console.error('Error en la funcion enviarEImprimir:', error);
     } finally {
        isSubmitting = false;
        setRegisteringState(false, originalText);

        if (fechaControl1) fechaControl1.value = '';
    }

} // ← cierra enviarEImprimir

