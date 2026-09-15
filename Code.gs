/*
  ECOSWITCH — Apps Script: puente entre la PWA y Google Sheets
  I.E.S. Nuestra Señora de las Mercedes — Club "Líderes de la Ciencia Mercedaria"

  Esquema definitivo (reconciliado con la app real, sept. 2026). Encabezados
  esperados en la pestaña "Datos", EN ESTE ORDEN EXACTO:
  measurement_id | Fecha | Hora | Latitud | Longitud | Precision_GPS_m |
  Punto_Numero | Punto_Nombre | Muestra_Num | pH | TDS_ppm | Temperatura_C |
  Operador | Tipo_Registro

  Cambios frente a la versión anterior:
  - Ya no existe "Replica": la app ahora usa un contador de muestra por punto,
    sin tope fijo (Muestra_Num).
  - "Punto_Muestreo" (texto único) se separó en Punto_Numero (entero, estable
    aunque cambie el nombre) y Punto_Nombre (texto, editable desde la app).
  - measurement_id es nuevo: lo genera la app al crear la medición, no al
    sincronizar, para que un reintento de red nunca duplique una fila (ver
    la comprobación más abajo).
  - "Operador" es el usuario escrito en el login de la app — no requiere un
    campo nuevo en el formulario.
*/

const API_KEY = 'ECOSWITCH2026';   // Cámbienla por una propia antes de compartir la URL ampliamente
const SHEET_NAME = 'Datos';

const COLUMNAS = [
  'measurement_id','Fecha','Hora','Latitud','Longitud','Precision_GPS_m',
  'Punto_Numero','Punto_Nombre','Muestra_Num','pH','TDS_ppm','Temperatura_C',
  'Operador','Tipo_Registro'
];

function doGet(e) {
  try {
    if (!e || !e.parameter) {
      return jsonResponse({ ok: false, error: 'Sin parametros' });
    }
    if (e.parameter.key !== API_KEY) {
      return jsonResponse({ ok: false, error: 'Clave invalida' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      return jsonResponse({
        ok: false,
        error: 'No existe la pestaña "Datos". Créala e importa la plantilla primero.'
      });
    }

    const id = String(e.parameter.id || '');
    if (id === '') {
      return jsonResponse({ ok: false, error: 'Falta measurement_id' });
    }

    // --- Accion BORRAR: elimina la fila con ese measurement_id ---
    // La usa la opcion "Eliminar ultimo registro" de la app. Es necesaria para
    // que el numero de ese registro quede libre: si solo se borrara en el
    // celular, al volver a enviarlo el control de duplicados lo rechazaria.
    if (String(e.parameter.accion || '') === 'borrar') {
      const ultima = sh.getLastRow();
      if (ultima < 2) return jsonResponse({ ok: true, borrado: false, motivo: 'hoja vacia' });
      const columnaIds = sh.getRange(2, 1, ultima - 1, 1).getValues();
      for (var i = columnaIds.length - 1; i >= 0; i--) {
        if (String(columnaIds[i][0]) === id) {
          sh.deleteRow(i + 2);
          return jsonResponse({ ok: true, borrado: true, id: id });
        }
      }
      return jsonResponse({ ok: true, borrado: false, motivo: 'no encontrado', id: id });
    }

    // --- Idempotencia: si este id ya fue registrado, no se duplica ---
    // Se revisan solo las últimas 500 filas por eficiencia; para un proyecto
    // escolar de este tamaño es más que suficiente margen.
    const idsExistentes = obtenerUltimosIds_(sh, 500);
    if (idsExistentes.indexOf(id) !== -1) {
      return jsonResponse({ ok: true, duplicado: true, id: id });
    }

    const fecha  = String(e.parameter.fecha || '');
    const hora   = String(e.parameter.hora || '');
    const lat    = toNumber(e.parameter.lat);
    const lon    = toNumber(e.parameter.lon);
    const gpsAcc = toNumber(e.parameter.gps_acc);
    const puntoNum    = toNumber(e.parameter.punto_num);
    const puntoNombre = String(e.parameter.punto_nombre || '');
    const muestra = toNumber(e.parameter.muestra);
    const ph      = toNumber(e.parameter.ph);
    const tds     = toNumber(e.parameter.tds);
    const temp    = toNumber(e.parameter.temp);
    const operador = String(e.parameter.operador || '—');
    const tipo    = String(e.parameter.tipo || 'REAL');

    if (fecha === '' || hora === '') {
      return jsonResponse({ ok: false, error: 'Faltan fecha u hora' });
    }
    if (ph !== '' && (ph < 0 || ph > 16)) {
      return jsonResponse({ ok: false, error: 'pH fuera de rango 0-16' });
    }
    if (tds !== '' && (tds < 0 || tds > 9990)) {
      return jsonResponse({ ok: false, error: 'TDS fuera de rango 0-9990' });
    }
    if (temp !== '' && (temp < -50 || temp > 300)) {
      return jsonResponse({ ok: false, error: 'Temperatura fuera de rango -50 a 300' });
    }

    sh.appendRow([
      id, fecha, hora, lat, lon, gpsAcc,
      puntoNum, puntoNombre, muestra,
      ph, tds, temp, operador, tipo
    ]);

    return jsonResponse({ ok: true, duplicado: false, id: id });

  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// Lee la columna measurement_id (A) de las últimas `limite` filas con datos.
function obtenerUltimosIds_(sh, limite) {
  const ultimaFila = sh.getLastRow();
  if (ultimaFila < 2) return [];
  const desde = Math.max(2, ultimaFila - limite + 1);
  const cantidad = ultimaFila - desde + 1;
  const valores = sh.getRange(desde, 1, cantidad, 1).getValues();
  return valores.map(function (fila) { return String(fila[0]); });
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
  AUTOPRUEBA — correr manualmente desde este editor (menú de funciones arriba,
  elegir "pruebaManual", clic en ▶ Ejecutar). No requiere desplegar como
  aplicación web todavía. Corrido dos veces seguidas con el mismo id, la
  segunda debe devolver duplicado:true y NO crear una segunda fila — así se
  verifica la protección contra duplicados antes de confiar en ella en campo.
*/
function pruebaManual() {
  const fake = {
    parameter: {
      key: API_KEY, id: 'M-PRUEBA-0001', fecha: '2026-09-13', hora: '09:00',
      lat: '-13.6339', lon: '-72.8814', gps_acc: '8.5',
      punto_num: '1', punto_nombre: 'PRUEBA_MANUAL', muestra: '1',
      ph: '7.50', tds: '190', temp: '14.0', operador: 'asesor', tipo: 'PRUEBA'
    }
  };
  Logger.log('Primer intento: ' + doGet(fake).getContent());
  Logger.log('Segundo intento (debe salir duplicado:true): ' + doGet(fake).getContent());
}
