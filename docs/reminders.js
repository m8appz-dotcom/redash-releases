/* ReDash — motor de mantenimiento del vehiculo.
 *
 * Los autos no vencen por fecha O por kilometros, sino por LO QUE LLEGUE PRIMERO, y este
 * modulo es solo esa cuenta: funciones puras, sin DOM ni almacenamiento, para poder probarlas.
 *
 * Los kilometros salen de los viajes que la app grabo, no de un odometro: por eso SUBESTIMAN
 * (si no grabaste, no se contaron). El factor de calibracion corrige ese sesgo cuando el
 * usuario reporta su odometro real.
 *
 * Corre igual como <script> en el navegador (expone window.RD_REM) que via require() en node.
 */
(function (raiz) {
  'use strict';

  var DIA = 86400000;

  /** Kilometros vistos desde `sinceMs`, ya corregidos por el factor de calibracion. */
  function kmSince(trips, sinceMs, factor) {
    if (!trips || !trips.length) return 0;
    var f = factor > 0 ? factor : 1;
    var total = 0;
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i];
      if (t && t.at >= sinceMs) total += (t.km || 0);
    }
    return Math.round(total * f * 100) / 100;
  }

  /**
   * Estado de un recordatorio.
   * Devuelve { pct, by: 'km'|'date'|'none', overdue, remainingKm, remainingDays }.
   * `pct` puede pasar de 1: cuanto se paso importa tanto como que se paso.
   */
  function dueState(rem, now, km) {
    var porKm = rem.km > 0 ? (km / rem.km) : -1;
    var dias = (now - rem.lastAt) / DIA;
    var porFecha = rem.days > 0 ? (dias / rem.days) : -1;

    if (porKm < 0 && porFecha < 0) {
      return { pct: 0, by: 'none', overdue: false, remainingKm: 0, remainingDays: 0 };
    }
    // Lo que llegue primero = el que vaya mas adelantado.
    var by = porKm >= porFecha ? 'km' : 'date';
    var pct = Math.max(porKm, porFecha);
    return {
      pct: Math.round(pct * 1000) / 1000,
      by: by,
      overdue: pct >= 1,
      remainingKm: rem.km > 0 ? Math.max(0, Math.round(rem.km - km)) : 0,
      remainingDays: rem.days > 0 ? Math.max(0, Math.ceil(rem.days - dias)) : 0,
    };
  }

  /**
   * Factor = km reales / km vistos. Se acota porque un tipeo en el odometro no puede
   * arruinar el contador, y no se calibra con muy poca distancia: seria ruido, no senal.
   */
  function calibrate(seenKm, realKm) {
    if (!(seenKm > 10) || !(realKm > 0)) return 1;
    var f = realKm / seenKm;
    return Math.min(10, Math.max(0.5, Math.round(f * 1000) / 1000));
  }

  /**
   * Que aviso corresponde ahora: 'soon' (90%), 'overdue' (100%) o null.
   * `rem.notified` recuerda el ultimo escalon avisado en ESTE ciclo (0 / 90 / 100) y se
   * reinicia al marcar el servicio como hecho. Sin esa memoria, la app avisaria lo mismo
   * en cada arranque hasta que el usuario silenciara las notificaciones para siempre.
   */
  function nextNotice(rem, state) {
    var hecho = rem.notified || 0;
    if (state.overdue) return hecho >= 100 ? null : 'overdue';
    if (state.pct >= 0.9) return hecho >= 90 ? null : 'soon';
    return null;
  }

  /* Valores de arranque. El usuario los edita: son un punto de partida razonable,
     no una recomendacion del fabricante de su auto. */
  var PRESETS = [
    { type: 'oil',       km: 5000,  days: 180 },
    { type: 'tires',     km: 10000, days: 0   },
    { type: 'brakes',    km: 20000, days: 0   },
    { type: 'filter',    km: 15000, days: 365 },
    { type: 'plate',     km: 0,     days: 365 },
    { type: 'insurance', km: 0,     days: 365 },
    { type: 'license',   km: 0,     days: 1825 },
  ];

  var api = { kmSince: kmSince, dueState: dueState, calibrate: calibrate,
              nextNotice: nextNotice, PRESETS: PRESETS, DIA: DIA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RD_REM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
