// ---- Rendimiento y costo por km vs objetivo (dependencia del Informe RNS) ----
// Objetivo definido por tipo de unidad (no se usa rend_meta capturado, ya que
// esos valores están desactualizados). Full = doble/sencillo pesado, Sencillo = sencillo estándar.
// NOTA: si el dashboard base ya trae su propia definición de estas constantes/función
// (porque en algún momento se reincorporó la funcionalidad "Rendimiento vs Objetivo" al
// generador de Python), esto quedaría duplicado — pero como hoy el generador no las incluye,
// se agregan aquí para que el Informe RNS no dependa de esa otra funcionalidad.
const DIESEL_PRICE = 26; // $/lt, mismo precio ya usado en la metodología de impacto
const TIPO_META = { 'Full': 1.8, 'Sencillo': 2.1 }; // km/L objetivo

function buildTipoPorUnidad(){
  const map = {};
  const mejorIdx = {};
  (DATA.evaluadora||[]).forEach(r=>{
    const u = r.unidad; if (!u) return;
    let t = r.tipo;
    if (typeof t === 'string') t = t.trim();
    if (t!=='Full' && t!=='Sencillo') return; // ignora vacíos/valores inválidos (ej. "1.92")
    const mesLimpio = (r.mes||'').trim();
    const idx = MES_ORDER.findIndex(m=>m.toLowerCase()===mesLimpio.toLowerCase());
    // se queda con el tipo del mes más reciente disponible para esa unidad
    if (mejorIdx[u]===undefined || idx > mejorIdx[u]){
      mejorIdx[u] = idx;
      map[u] = t;
    }
  });
  return map;
}

function objetivoUnidad(unidad){
  const tipo = TIPO_POR_UNIDAD[unidad];
  if (!tipo) return null; // sin tipo definido: no se fuerza un default
  const rendObjetivo = TIPO_META[tipo];
  return { tipo, rendObjetivo, costoObjetivo: DIESEL_PRICE / rendObjetivo };
}

const TIPO_POR_UNIDAD = buildTipoPorUnidad();

