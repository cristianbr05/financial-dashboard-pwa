# 📊 Analizador de Datos Financieros (PWA)

[![Despliegue PWA](https://github.com/cristianbr05/financial-dashboard-pwa/actions/workflows/deploy.yml/badge.svg)](https://github.com/cristianbr05/financial-dashboard-pwa/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

> **Aplicación Web Progresiva (PWA) de arquitectura *serverless* orientada a la auditoría, visualización y análisis de extractos financieros.** 

Todo el procesamiento, clasificación y persistencia de datos se ejecuta estrictamente en local (*Client-side*), garantizando la privacidad absoluta de la información sin dependencias de bases de datos externas ni envíos a servidores de terceros.

### 🟢 [Probar Demo en Vivo](https://cristianbr05.github.io/financial-dashboard-pwa)
*(Nota: Puedes utilizar el botón "Cargar datos de prueba" dentro de la aplicación para explorar las funciones sin necesidad de subir archivos reales).*

---

## 📸 Interfaz y Funcionamiento

*(Arrastra aquí tus capturas de pantalla. Ejemplo de estructura:)*
| Vista General (Modo Claro) | Análisis Detallado (Modo Oscuro) |
| :---: | :---: |
| ![Dashboard Vista Claro](docs/screenshot-light.png) | ![Drilldown Modal](docs/screenshot-dark.png) |

---

## 🛠 Especificaciones Técnicas y Arquitectura

| ⚙️ Arquitectura | 💾 Base de Datos | 📈 Motor Gráfico | 🧠 Lógica |
| :--- | :--- | :--- | :--- |
| PWA (Service Workers) | IndexedDB API | Chart.js / Canvas API | Vanilla JS (Modular) |

### Procesamiento y Persistencia
* **Gestión Multi-archivo:** *Drag & Drop* y lectura nativa de formatos `.csv`, `.xlsx` y `.xls` mediante `PapaParse` y `SheetJS`.
* **Fusión de Datasets:** Algoritmo de validación que unifica múltiples archivos, descartando transacciones duplicadas basándose en hashes combinados (fecha, importe y concepto).
* **Almacenamiento Local (Privacy-First):** Uso de la API `IndexedDB` para guardar un histórico de archivos en el navegador, permitiendo recuperar sesiones anteriores al instante sin comprometer la privacidad.

### Visualización y Análisis (Dashboard)
* **Motor de Categorización Dinámico:** Diccionario de reglas (palabras clave, colores, emojis) editable con recálculo en tiempo real.
* **Módulo *Drilldown*:** Ventana modal generada dinámicamente que desglosa categorías individuales mostrando tendencias temporales y el *Top Comercios*.
* **Cálculo de KPIs y Presupuestos:** Computación en tiempo real del gasto, promedios diarios, comparativas de periodos y seguimiento visual del techo de gasto mensual.

### Filtrado y UI/UX
* **Accesibilidad y Rendimiento:** Interfaz responsive diseñada con TailwindCSS extraído, con etiquetas ARIA nativas para lectores de pantalla.
* **Calendario Customizado:** Selector de rangos dinámico creado desde cero en JS puro.
* **Modo Incógnito:** Filtros CSS de desenfoque (`blur`) para ocultar cifras en entornos públicos.
* **Instalable (PWA):** Soporte nativo para instalación en escritorio y móvil mediante `manifest.json` y Service Workers.

---

## 🚀 Despliegue Local

Al ser una aplicación 100% *Client-side*, no requiere Node.js ni bases de datos.

1. Clona el repositorio:
   ```bash
   git clone [https://github.com/cristianbr05/financial-dashboard-pwa.git](https://github.com/cristianbr05/financial-dashboard-pwa.git)

2. Inicia un servidor local estático en la raíz del proyecto. Por ejemplo, usando Python:
   ```bash
   python -m http.server 8000

3. Abre http://localhost:8000 en tu navegador.

---

### 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo LICENSE para más detalles. Puedes utilizar, modificar y distribuir este código libremente.
