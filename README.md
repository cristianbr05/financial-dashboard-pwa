# 📊 Analizador de Datos Financieros (PWA)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)
![Status](https://img.shields.io/badge/Status-Complete-green?style=flat-square)

> **Aplicación Web Progresiva (PWA) de arquitectura *serverless* orientada a la auditoría, visualización y análisis de extractos financieros.** 
> Todo el procesamiento, clasificación y persistencia de datos se ejecuta estrictamente en local (Client-side), garantizando la privacidad absoluta de la información sin dependencias de bases de datos externas.

| ⚙️ Arquitectura | 💾 Base de Datos | 📈 Motor Gráfico | 🧠 Lógica |
| :--- | :--- | :--- | :--- |
| PWA (Service Workers) | IndexedDB API | Chart.js / Canvas API | Diccionario de Reglas |

---

## 🛠️️ Especificaciones Técnicas y Funcionalidades

### Procesamiento de Datos y Almacenamiento
* **Gestión Multi-archivo:** Soporte para *Drag & Drop* y lectura nativa de formatos `.csv`, `.xlsx` y `.xls` mediante `PapaParse` y `SheetJS`.
* **Fusión de Datasets:** Algoritmo de validación que unifica múltiples archivos subidos simultáneamente, detectando y descartando transacciones duplicadas basándose en hashes combinados (fecha, importe y concepto).
* **Almacenamiento Persistente:** Uso de la API `IndexedDB` para guardar un histórico de archivos en el navegador ("Almacén Local"), permitiendo recuperar sesiones anteriores de forma instantánea.

### Lógica de Clasificación
* **Motor de Categorización:** Diccionario dinámico de reglas (palabras clave, colores y emojis) que clasifica automáticamente cada registro entrante.
* **Editor de Reglas (CRUD):** Interfaz integrada para que el usuario añada, modifique, reordene o elimine reglas de clasificación, con capacidad para recalcular todo el conjunto de datos en tiempo real.
* **Módulo *Drilldown* (Análisis Profundo):** Ventana modal de desglose generada dinámicamente al hacer clic en una categoría, mostrando: importe total, porcentaje sobre el periodo, métricas mensuales, tendencia temporal aislada y top 3 de comercios específicos de esa categoría.

### Visualización y Cuadros de Mando (Dashboard)
* **Cálculo de KPIs:** Computación en tiempo real del gasto total, volumen de transacciones, promedio diario y comparativas porcentuales respecto a periodos anteriores.
* **Gestor de Presupuestos:** Módulo para establecer un techo de gasto mensual, renderizando una barra de progreso condicional (verde/rojo) según la tasa de consumo.
* **Gráficos Dinámicos:** Integración con `Chart.js` para visualización de evolución temporal (barras/áreas) y distribución del gasto (anillo modular con agrupación de datos menores en "Otros").
* **Top Comercios:** Extracción y recuento de los establecimientos más frecuentados basándose en normalización de strings.

### Filtrado y UI/UX
* **Selector de Fechas Customizado:** Calendario interactivo desarrollado desde cero en JS, con selección de rangos, vistas mensuales/semanales y selectores rápidos por año fiscal.
* **Tabla Reactiva:** Listado de transacciones con barra de búsqueda rápida (filtrado in-memory) y soporte para atajos de teclado (`Ctrl+F`).
* **Privacidad Activa:** Implementación de un "Modo Incógnito" que aplica filtros CSS de desenfoque (`blur`) sobre cifras y gráficos sensibles para entornos compartidos.
* **Soporte PWA y Tematización:** Instalable localmente mediante `manifest.json` y `Service Workers`, incluyendo alternancia manual entre esquemas *Light/Dark Mode* vinculados a variables de Tailwind.

### Módulo de Exportación
* **Extracción a CSV:** Generación de archivos tabulares estructurados basándose en los filtros activos actuales.
* **Renderizado de Infografías:** Generación de un reporte visual en `.png` dibujando los datos y métricas directamente sobre la etiqueta `<canvas>`, sin requerir librerías de servidor.

---

## 🚀 Instrucciones de Despliegue y Uso

1. Desplegar el archivo `index.html` en un servidor web estático (o GitHub Pages) para habilitar las características PWA, o abrir localmente en un navegador moderno.
2. Cargar los extractos financieros a través de la zona de subida (archivos individuales o en lote).
3. Utilizar el botón superior de **Categorías** para ajustar el diccionario analítico según la nomenclatura de los comercios locales.
4. Navegar por los datos utilizando el botón de **Rango de Fechas** o los desplegables de filtros base (Año/Categoría).
5. Hacer clic sobre cualquier segmento del gráfico de anillo circular para abrir el **Análisis Profundo (Drilldown)** de esa categoría.
6. Emplear el icono del ojo (Modo Incógnito) para ocultar las cifras si se requiere visualización en público.

---
*Desarrollado con ayuda de herramientas de IA.*