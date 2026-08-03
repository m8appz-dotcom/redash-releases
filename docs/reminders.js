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
   * Mes que la ANT asigna segun el ultimo digito de la placa (Ecuador):
   * febrero(1) ... octubre(9) y noviembre(0). Diciembre es solo para rezagados.
   * Acepta el digito suelto o la placa completa. Devuelve 0 si no hay digito.
   */
  function plateMonth(placa) {
    var s = String(placa == null ? "" : placa);
    var digitos = s.replace(/[^0-9]/g, "");
    if (!digitos) return 0;
    var d = Number(digitos.charAt(digitos.length - 1));
    return d === 0 ? 11 : d + 1;   // el 0 rompe la formula: va a noviembre
  }

  /** Fin del ultimo dia del mes `m` (1-12) del ano `y`: hasta ahi hay plazo. */
  function finDeMes(y, m) {
    return new Date(y, m, 0, 23, 59, 59, 999).getTime();
  }

  /**
   * Estado de un recordatorio.
   * Devuelve { pct, by: 'km'|'date'|'month'|'none', overdue, remainingKm, remainingDays }.
   * `pct` puede pasar de 1: cuanto se paso importa tanto como que se paso.
   */
  function dueState(rem, now, km) {
    // Modo mes fijo (matricula): no vence "cada N dias" sino al terminar SU mes. Tras hacer
    // el tramite el plazo salta al ano siguiente, en vez de quedar vencido para siempre.
    if (rem.month > 0) {
      var y = new Date(rem.lastAt).getFullYear();
      // Si el tramite se hizo YA DENTRO de su mes (o despues), ese ano quedo cumplido y el
      // proximo plazo es el del ano siguiente. Sin esto, matricularse el 20 de febrero
      // dejaria el recordatorio "vencido" el 1 de marzo, que es exactamente al reves.
      var inicioMes = new Date(y, rem.month - 1, 1).getTime();
      var limite = finDeMes(rem.lastAt >= inicioMes ? y + 1 : y, rem.month);
      var total = limite - rem.lastAt;
      var pasado = now - rem.lastAt;
      var p = total > 0 ? pasado / total : 1;
      return {
        pct: Math.round(p * 1000) / 1000,
        by: 'month',
        overdue: now > limite,
        remainingKm: 0,
        remainingDays: Math.max(0, Math.ceil((limite - now) / DIA)),
      };
    }
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

  /**
   * Nueva lectura del odometro. El usuario escribe LO QUE MARCA SU TABLERO — eso es lo que
   * quiere "guardar" — y de paso, si entre dos lecturas la app vio suficientes km, se deriva
   * el factor de correccion solo (lo real entre lo visto), sin pedirle cuentas a nadie.
   * Devuelve { odoKm, factor } o null si la lectura es menor que la anterior (un tipeo).
   */
  function updateOdometer(prev, newOdo, seenSincePrev, factor) {
    if (!(newOdo > 0)) return null;
    if (prev && prev.odoKm > 0) {
      if (newOdo < prev.odoKm) return null;
      var real = newOdo - prev.odoKm;
      if (seenSincePrev > 10 && real > 0) {
        return { odoKm: newOdo, factor: calibrate(seenSincePrev, real) };
      }
    }
    return { odoKm: newOdo, factor: factor > 0 ? factor : 1 };
  }

  /* Valores de arranque. El usuario los edita: son un punto de partida razonable,
     no una recomendacion del fabricante de su auto. */
  var PRESETS = [
    { type: 'oil',       km: 5000,  days: 180 },
    { type: 'tires',     km: 10000, days: 0   },
    { type: 'brakes',    km: 20000, days: 0   },
    { type: 'filter',    km: 15000, days: 365 },
    // La matricula NO vence 'cada 365 dias': la ANT asigna un mes segun el ultimo digito
    // de la placa. El mes se completa al darla de alta, preguntando la placa.
    { type: 'plate',     km: 0,     days: 0,   month: 0 },
    { type: 'insurance', km: 0,     days: 365 },
    { type: 'license',   km: 0,     days: 1825 },
  ];

  var api = { kmSince: kmSince, dueState: dueState, calibrate: calibrate, plateMonth: plateMonth,
              updateOdometer: updateOdometer,
              nextNotice: nextNotice, PRESETS: PRESETS, DIA: DIA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RD_REM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
