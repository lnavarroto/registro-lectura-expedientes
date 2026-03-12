/**
 * Sistema mejorado de notificaciones Toast
 * Tipos: 'success', 'error', 'warning', 'info', 'loading'
 */

const TOAST_CONFIG = {
    success: {
        icon: 'checkCircle',
        defaultTitle: 'Éxito',
        duration: 4000,
        color: '#10b981'
    },
    error: {
        icon: 'alertCircle',
        defaultTitle: 'Error',
        duration: 5000,
        color: '#ef4444'
    },
    warning: {
        icon: 'alertTriangle',
        defaultTitle: 'Advertencia',
        duration: 4500,
        color: '#f59e0b'
    },
    info: {
        icon: 'infoCircle',
        defaultTitle: 'Información',
        duration: 3500,
        color: '#3b82f6'
    },
    loading: {
        icon: 'loader',
        defaultTitle: 'Procesando',
        duration: 0,
        color: '#6366f1'
    }
};

/**
 * Crea un icono SVG basado en el tipo
 * @param {string} iconType - Tipo de icono a crear
 * @return {SVGSVGElement} Elemento SVG del icono
 */
function createToastIcon(iconType) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');

    let pathData = '';

    switch (iconType) {
        case 'checkCircle':
            // Circulo con checkmark
            svg.innerHTML = `
                <circle cx="12" cy="12" r="10"/>
                <path d="M7 12l3 3 7-7"/>
            `;
            break;
        case 'alertCircle':
            // Circulo con exclamación
            svg.innerHTML = `
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
            `;
            break;
        case 'alertTriangle':
            // Triángulo con exclamación
            svg.innerHTML = `
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
            `;
            break;
        case 'infoCircle':
            // Circulo con "i"
            svg.innerHTML = `
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
            `;
            break;
        case 'loader':
            // Spinner
            svg.innerHTML = `
                <circle cx="12" cy="12" r="10" fill="none"/>
            `;
            svg.classList.add('toast-spinner');
            break;
        case 'close':
            // Icono X
            svg.innerHTML = `
                <path d="M18 6l-12 12M6 6l12 12"/>
            `;
            break;
    }

    return svg;
}

/**
 * Muestra una notificación toast
 * @param {Object} options - Opciones del toast
 * @param {string} options.type - Tipo: 'success', 'error', 'warning', 'info', 'loading'
 * @param {string} options.title - Título (opcional)
 * @param {string} options.message - Mensaje del toast
 * @param {number} options.duration - Duración en ms (0 = sin auto-cierre)
 * @param {Function} options.onClose - Callback cuando se cierra (opcional)
 * @return {HTMLElement} Elemento del toast (útil para manipulación posterior)
 */
function showToast(options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('Toast container not found in DOM');
        return null;
    }

    const {
        type = 'info',
        title = null,
        message = '',
        duration = null,
        onClose = null
    } = options;

    const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;
    const displayTitle = title || config.defaultTitle;
    const displayDuration = duration !== null ? duration : config.duration;

    // Crear elemento del toast
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');

    // Icono
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'toast-icon';
    iconWrapper.appendChild(createToastIcon(config.icon));
    iconWrapper.setAttribute('aria-hidden', 'true');

    // Contenido
    const content = document.createElement('div');
    content.className = 'toast-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = displayTitle;

    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;

    content.appendChild(titleEl);
    content.appendChild(messageEl);

    // Botón de cierre
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar notificación');
    closeBtn.appendChild(createToastIcon('close'));

    // Barra de progreso
    const progressBar = document.createElement('div');
    progressBar.className = 'toast-progress';

    // Armar el toast
    toast.appendChild(iconWrapper);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    if (displayDuration > 0) toast.appendChild(progressBar);

    // Agregar al contenedor
    container.appendChild(toast);

    // Función para cerrar el toast
    const removeToast = () => {
        if (!toast.parentElement) return;

        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentElement) {
                container.removeChild(toast);
            }
            if (typeof onClose === 'function') {
                onClose();
            }
        }, 300);
    };

    // Event listeners
    closeBtn.addEventListener('click', removeToast);

    // Auto-cierre solo si duration > 0
    if (displayDuration > 0) {
        setTimeout(removeToast, displayDuration);
    }

    return toast;
}

/**
 * Alias para toast de éxito
 */
function showSuccessToast(message, title = 'Éxito', duration = null) {
    return showToast({
        type: 'success',
        title,
        message,
        duration
    });
}

/**
 * Alias para toast de error
 */
function showErrorToast(message, title = 'Error', duration = null) {
    return showToast({
        type: 'error',
        title,
        message,
        duration
    });
}

/**
 * Alias para toast de advertencia
 */
function showWarningToast(message, title = 'Advertencia', duration = null) {
    return showToast({
        type: 'warning',
        title,
        message,
        duration
    });
}

/**
 * Alias para toast de información
 */
function showInfoToast(message, title = 'Información', duration = null) {
    return showToast({
        type: 'info',
        title,
        message,
        duration
    });
}

/**
 * Toast de carga (sin auto-cierre)
 */
function showLoadingToast(message, title = 'Procesando') {
    return showToast({
        type: 'loading',
        title,
        message,
        duration: 0
    });
}

/**
 * Cierra todos los toasts de un tipo específico
 */
function closeAllToasts(type = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toasts = container.querySelectorAll('.toast-item');
    toasts.forEach(toast => {
        if (!type || toast.classList.contains(`toast-${type}`)) {
            const btn = toast.querySelector('.toast-close');
            if (btn) btn.click();
        }
    });
}
