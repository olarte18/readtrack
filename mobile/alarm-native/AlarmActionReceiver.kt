package com.alejandro.readtrack.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Botones de la notificación de sesión (visible en la pantalla de bloqueo).
 * Pausar congela la cuenta (temporizador y cronómetro) y cancela la alarma
 * exacta; Reanudar la retoma y reprograma la alarma. El servicio lee este
 * estado en cada tick, así que basta con actualizar prefs + notificación.
 */
class AlarmActionReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION_PAUSE = "com.alejandro.readtrack.SESSION_PAUSE"
    const val ACTION_RESUME = "com.alejandro.readtrack.SESSION_RESUME"
    private const val TAG = "ReadTrackAlarm"
  }

  override fun onReceive(context: Context, intent: Intent?) {
    if (!AlarmSessionState.isActive(context)) {
      Log.d(TAG, "acción ignorada: no hay sesión activa")
      return
    }
    when (intent?.action) {
      ACTION_PAUSE -> {
        AlarmSessionState.pause(context)
        AlarmSessionService.cancelExactAlarm(context)
        Log.d(TAG, "sesión pausada desde notificación")
      }
      ACTION_RESUME -> {
        AlarmSessionState.resume(context)
        AlarmSessionService.scheduleExactAlarm(context)
        Log.d(TAG, "sesión reanudada desde notificación")
      }
      else -> return
    }
    AlarmSessionService.refreshNotification(context)
  }
}