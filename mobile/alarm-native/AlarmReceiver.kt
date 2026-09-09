package com.alejandro.readtrack.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "ReadTrackAlarm"

class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmModule.ACTION_ALARM_FIRE) {
      Log.d(TAG, "intent con action distinta: ${intent.action}")
      return
    }
    if (AlarmForegroundTracker.isForeground) {
      Log.d(TAG, "alarma disparada en primer plano, se omite")
      return
    }
    // Si la sesión ya se marcó como cumplida (servicio o receiver previo),
    // no volver a sonar. La alarma exacta es la red de seguridad del servicio.
    if (AlarmSessionState.isFired(context)) {
      Log.d(TAG, "sesión ya disparada, se omite")
      return
    }
    Log.d(TAG, "alarma disparada en segundo plano")
    AlarmFire.fire(context)
  }
}