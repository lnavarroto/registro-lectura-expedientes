# 📋 Registro de Lectura de Expedientes Judiciales

Aplicación web para el registro y búsqueda de lecturas de expedientes judiciales. Permite capturar datos de acceso a expedientes, generar registros con firma digital, imprimirlos y almacenarlos en Google Sheets mediante Google Apps Script.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Google Apps Script](https://img.shields.io/badge/Backend-Google%20Apps%20Script-4285F4?logo=google)](https://developers.google.com/apps-script)

---

## ✨ Características

- **Registro de lectura** — Formulario completo para capturar datos del solicitante, expediente y firma antes de imprimir.
- **Búsqueda de registros** — Consulta, filtrado y gestión de registros ya almacenados.
- **Borrador automático** — Guarda el formulario en `localStorage` para no perder datos al cerrar la pestaña.
- **Caché de especialistas** — Lista de especialistas almacenada localmente con TTL de 24 h para reducir peticiones al servidor.
- **Cola offline** — Los registros pendientes se guardan localmente y se sincronizan cuando vuelve la conexión.
- **Sistema de toasts** — Notificaciones visuales no intrusivas para acciones y errores.
- **Accesibilidad** — Regiones ARIA live para lectores de pantalla.
- **Diseño responsivo** — Interfaz adaptada a escritorio y móvil con Tailwind CSS.

---

## 🛠️ Tecnologías

| Capa | Tecnología |
|------|-----------|
| Maquetación | HTML5 semántico |
| Estilos | [Tailwind CSS 3](https://tailwindcss.com) + CSS personalizado |
| Lógica cliente | JavaScript vanilla (ES6+) |
| Backend / Base de datos | [Google Apps Script](https://developers.google.com/apps-script) + Google Sheets |
| Build | [Terser](https://terser.org/) (minificación JS) |

---

## 📁 Estructura del proyecto

```
registro-lectura-expedientes/
├── index.html                  # Redirección al formulario principal
├── 404.html                    # Página de error 404
├── _headers                    # Cabeceras HTTP (Netlify / hosting estático)
├── _redirects                  # Reglas de redirección
├── tailwind.config.js          # Configuración de Tailwind CSS
├── package.json
│
├── html/
│   ├── REGISTRO_LECTURA.html   # Formulario de registro de lectura
│   └── BUSQUEDA_LECTURA.html   # Buscador y gestión de registros
│
├── css/
│   ├── tailwind-input.css      # Entrada de Tailwind (directivas @tailwind)
│   ├── tailwind.css            # CSS generado/minificado por Tailwind
│   ├── registro_lectura.css    # Estilos específicos del registro
│   ├── busqueda_lectura.css    # Estilos específicos de la búsqueda
│   ├── toast.css               # Estilos del sistema de notificaciones
│   └── index.css               # Estilos de la página de redirección
│
├── js/
│   ├── registro_lectura.js     # Lógica del formulario de registro
│   ├── busqueda_lectura.js     # Lógica de búsqueda y acciones CRUD
│   ├── toast-system.js         # Sistema de notificaciones toast
│   └── index.js                # Script de la página de redirección
│
└── img/
    └── icono-lectura.ico       # Icono de la aplicación
```

---

## 🚀 Instalación y uso local

### Prerrequisitos

- [Node.js](https://nodejs.org/) ≥ 18
- npm

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/lnavarroto/registro-lectura-expedientes.git
cd registro-lectura-expedientes

# 2. Instalar dependencias de desarrollo
npm install

# 3. Compilar los estilos de Tailwind
npm run build:css

# 4. Abrir index.html en el navegador
```

> **Nota:** La aplicación requiere una URL de Google Apps Script configurada en `js/registro_lectura.js` (`GAS_URL`) para el envío y consulta de datos.

---

## 📜 Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run watch:css` | Compila Tailwind en modo observación (desarrollo) |
| `npm run build:css` | Genera `css/tailwind.css` minificado |
| `npm run build:js` | Minifica todos los archivos JS con Terser |
| `npm run build` | Ejecuta `build:css` y `build:js` en secuencia |

---

## ⚙️ Configuración del backend

1. Crea un proyecto en [Google Apps Script](https://script.google.com/).
2. Vincula el script a una hoja de Google Sheets.
3. Despliega el script como **aplicación web** con acceso público.
4. Copia la URL del despliegue y reemplaza el valor de `GAS_URL` en `js/registro_lectura.js` y `js/busqueda_lectura.js`.

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor abre un _issue_ primero para discutir los cambios propuestos.

1. Haz fork del repositorio.
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Confirma tus cambios: `git commit -m 'feat: agrega nueva funcionalidad'`
4. Sube la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request.

---

## 📄 Licencia

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE).
