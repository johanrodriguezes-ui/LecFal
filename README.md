# LecFal - Tu Biblioteca Local de Mangas y Cómics

**LecFal** es una aplicación de escritorio moderna y ligera para organizar y explorar tu colección de mangas y cómics locales, inspirada en la interfaz y experiencia de usuario de **Tachiyomi** (sin extensiones web externas, 100% privado y local).

---

## ✨ Características Principales

- 📁 **Detección y Escaneo Automático**: Soporte nativo para archivos comprimidos **CBZ** y documentos **PDF**.
- 📌 **Carpeta por Defecto Persistente**: Seleccionas tu carpeta de lectura una vez y queda recordada automáticamente para próximas aperturas de la app.
- 🖼️ **Extracción Automática de Portadas**:
  - Extrae y almacena en caché la primera página de cada archivo `.cbz` y `.pdf`.
  - Portadas procedurales estilizadas si un archivo no tiene imagen incrustada.
- 🎛️ **Cuadrícula Dinámica con Tamaño Regulable**:
  - Selector rápido de tamaño de tarjetas: **Pequeño (S)**, **Mediano (M)** y **Grande (L)** (estilo explorador de carpetas).
  - Control deslizante continuo para regular los píxeles de la cuadrícula a tu gusto en tiempo real.
- 🔍 **Búsqueda en Tiempo Real**: Filtrado instantáneo por nombre y título con soporte para `Ctrl+F`.
- 🏷️ **Filtros por Formato y Favoritos**: Visualiza rápidamente cómics en CBZ, PDF o marcados con corazón.
- ↕️ **Ordenación Flexible**: Por título (A-Z, Z-A), fecha de escaneo o tamaño de archivo.
- 📖 **Acceso Inmediato**: Doble clic para abrir directamente con tu visor predeterminado del sistema.
- 🐧 🪟 **Multiplataforma**: Compatible de forma nativa con **Linux** y **Windows**.

---

## 🚀 Cómo Iniciar la Aplicación

### Requisitos
- [Node.js](https://nodejs.org/) (versión 18 o superior)
- `npm`

### Pasos de Ejecución

1. Abrir una terminal en el directorio del proyecto:
   ```bash
   cd LecFal
   ```

2. Instalar dependencias (solo la primera vez):
   ```bash
   npm install
   ```

3. Iniciar la aplicación:
   ```bash
   npm start
   ```

---

## 🛠️ Tecnologías Utilizadas

- **Electron**: Entorno de escritorio multiplataforma (Linux y Windows).
- **SQLite (sql.js / WebAssembly)**: Base de datos embebida de alto rendimiento y cero configuración nativa.
- **Adm-Zip**: Extracción rápida de portadas y conteo de páginas en archivos `.cbz`.
- **Mozilla PDF.js**: Renderizado y rasterizado de portadas para archivos `.pdf`.
- **CSS3 / Vanilla JS**: Interfaz moderna con temas oscuros, aceleración por hardware y microanimaciones fluidas.
