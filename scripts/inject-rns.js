#!/usr/bin/env node
/**
 * Inyecta (o re-inyecta) el módulo del Informe Semanal RNS Combustible dentro de index.html
 * antes de que Netlify publique el sitio.
 *
 * Por qué existe este script:
 * El index.html "base" lo regenera un script externo (generar_dashboard_operadores.py) cada vez
 * que hay datos nuevos (escaneos ECM, tickets de diésel, etc.). Ese script reescribe el archivo
 * completo y no tiene ninguna noción del botón/función "Informe Semanal RNS Combustible" que se
 * agregó manualmente — así que cada regeneración lo borraba.
 *
 * Este script corre como build command de Netlify (ver netlify.toml) y vuelve a insertar el
 * módulo RNS de forma automática en CADA build, sin importar cómo haya quedado el index.html que
 * subió el generador de Python. Es idempotente: si el archivo ya trae el módulo (por ejemplo
 * porque alguien lo reinyectó a mano), primero lo quita y lo vuelve a poner limpio, para nunca
 * duplicar código.
 *
 * Para actualizar el propio informe RNS en el futuro: edita los archivos dentro de
 * scripts/rns-assets/ (no edites index.html directamente para esto), y vuelve a hacer commit —
 * el próximo build de Netlify lo aplicará solo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const ASSETS_DIR = path.join(__dirname, 'rns-assets');

const MARK_LIB_START = '<!-- RNS-AUTO:LIB-START (no editar a mano, ver scripts/inject-rns.js) -->';
const MARK_LIB_END = '<!-- RNS-AUTO:LIB-END -->';
const MARK_BTN_START = '<!-- RNS-AUTO:BTN-START -->';
const MARK_BTN_END = '<!-- RNS-AUTO:BTN-END -->';
const MARK_JS_START = '// RNS-AUTO:JS-START (no editar a mano, ver scripts/inject-rns.js)';
const MARK_JS_END = '// RNS-AUTO:JS-END';
const MARK_DEPS_START = '// RNS-AUTO:DEPS-START (no editar a mano, ver scripts/inject-rns.js)';
const MARK_DEPS_END = '// RNS-AUTO:DEPS-END';

function stripBetween(html, startMark, endMark) {
  const startIdx = html.indexOf(startMark);
  if (startIdx === -1) return html;
  const endIdx = html.indexOf(endMark, startIdx);
  if (endIdx === -1) return html;
  let tailIdx = endIdx + endMark.length;
  // Consume también los saltos de línea sobrantes que dejó la inyección anterior,
  // para que el script sea perfectamente idempotente (no acumule líneas en blanco).
  while (html[tailIdx] === '\n' || html[tailIdx] === '\r') tailIdx++;
  return html.slice(0, startIdx) + html.slice(tailIdx);
}

function main() {
  let html = fs.readFileSync(INDEX_PATH, 'utf-8');

  // 1) Quitar cualquier inyección previa (idempotencia).
  html = stripBetween(html, MARK_LIB_START, MARK_LIB_END);
  html = stripBetween(html, MARK_BTN_START, MARK_BTN_END);
  html = stripBetween(html, MARK_JS_START, MARK_JS_END);
  html = stripBetween(html, MARK_DEPS_START, MARK_DEPS_END);

  // 2) Insertar la librería PptxGenJS (embebida, sin depender de un CDN) justo
  //    después del script de chartjs-plugin-datalabels.
  const pptxgenBundle = fs.readFileSync(path.join(ASSETS_DIR, 'pptxgen-bundle.js'), 'utf-8');
  const libAnchor = '<script src="https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-datalabels/2.2.0/chartjs-plugin-datalabels.min.js"></script>';
  if (!html.includes(libAnchor)) {
    throw new Error('inject-rns.js: no se encontró el ancla de chartjs-plugin-datalabels en index.html — revisa si el generador cambió el <head>.');
  }
  const libBlock = `${MARK_LIB_START}\n<script>\n${pptxgenBundle}\n</script>\n${MARK_LIB_END}`;
  // OJO: se usa una función como reemplazo (no un string) porque String.replace trata
  // secuencias "$1", "$&", etc. como patrones especiales — y un bundle minificado de 460KB
  // casi seguro contiene alguna, lo que corrompería el contenido si se pasara como string.
  html = html.replace(libAnchor, () => `${libAnchor}\n${libBlock}`);

  // 3) Insertar el botón "Informe Semanal RNS Combustible" justo después del
  //    botón de imprimir/descargar PDF.
  const btnFragment = fs.readFileSync(path.join(ASSETS_DIR, 'rns-button.html'), 'utf-8').trimEnd();
  const btnAnchorRegex = /(<button[^>]*onclick="window\.print\(\)"[^>]*>[^<]*<\/button>)/;
  if (!btnAnchorRegex.test(html)) {
    throw new Error('inject-rns.js: no se encontró el botón de imprimir (onclick="window.print()") en index.html — revisa si el generador cambió los controles.');
  }
  const btnBlock = `${MARK_BTN_START}\n${btnFragment}\n${MARK_BTN_END}`;
  html = html.replace(btnAnchorRegex, (m) => `${m}\n${btnBlock}`);

  // 4) Insertar el logo + todas las funciones del informe RNS justo antes de
  //    function render(){ dentro del script principal.
  //
  //    El informe RNS también depende de DIESEL_PRICE/TIPO_META/objetivoUnidad
  //    (la funcionalidad "Rendimiento vs Objetivo"), que en algún momento se perdió del
  //    generador junto con el RNS. Si el dashboard base ya las trae (porque se reincorporaron
  //    ahí), NO se duplican; si no las trae, se agrega aquí un "shim" para que el informe RNS
  //    siga funcionando de forma independiente.
  const renderAnchor = 'function render(){';
  if (!html.includes(renderAnchor)) {
    throw new Error('inject-rns.js: no se encontró "function render(){" en index.html — revisa si el generador renombró esa función.');
  }

  let depsBlock = '';
  if (!html.includes('const DIESEL_PRICE')) {
    const depsShim = fs.readFileSync(path.join(ASSETS_DIR, 'rns-deps-shim.js'), 'utf-8');
    depsBlock = `${MARK_DEPS_START}\n${depsShim}\n${MARK_DEPS_END}\n\n`;
  }

  const rnsScript = fs.readFileSync(path.join(ASSETS_DIR, 'rns-script.js'), 'utf-8');
  const jsBlock = `${MARK_JS_START}\n${rnsScript}\n${MARK_JS_END}\n\n`;
  // Solo la PRIMERA aparición (la del script principal), por si "function render(){" apareciera citado en otro lado.
  html = html.replace(renderAnchor, () => `${depsBlock}${jsBlock}${renderAnchor}`);

  fs.writeFileSync(INDEX_PATH, html, 'utf-8');
  console.log('inject-rns.js: módulo RNS inyectado correctamente en index.html.');
}

main();
