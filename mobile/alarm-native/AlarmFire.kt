package com.alejandro.readtrack.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

private const val TAG = "ReadTrackAlarm"

/**
 * Disparo único del fin de sesión: crea el canal invasivo, publica la
 * notificación con full-screen intent y abre [AlarmActivity]. El flag
 * `fired` en [AlarmSessionState] garantiza que suene una sola vez aunque lo
 * disparen el servicio y la alarma exacta casi a la vez.
 */
object AlarmFire {

  fun fire(context: Context) {
    if (AlarmSessionState.isFired(context)) {
      Log.d(TAG, "fin de sesión ya disparado, se omite")
      return
    }
    AlarmSessionState.setFired(context, true)
    Log.d(TAG, "disparando fin de sesión")
    createTriggerChannel(context)
    postTriggerNotification(context)
    startAlarmActivity(context)
  }

  private fun startAlarmActivity(context: Context) {
    try {
      context.startActivity(
        Intent(context, AlarmActivity::class.java)
          .addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_CLEAR_TOP
          )
      )
    } catch (e: Exception) {
      Log.e(TAG, "startAlarmActivity fallo", e)
    }
  }

  private fun postTriggerNotification(context: Context) {
    try {
      val activityIntent = PendingIntent.getActivity(
        context,
        AlarmModule.REQUEST_CODE_SHOW,
        Intent(context, AlarmActivity::class.java).addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        ),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val notification = NotificationCompat.Builder(context, AlarmModule.TRIGGER_CHANNEL_ID)
        .setContentTitle("Tiempo cumplido")
        .setContentText("Tu sesión de lectura terminó")
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setFullScreenIntent(activityIntent, true)
        .setAutoCancel(false)
        .setOngoing(true)
        .build()
      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.notify(AlarmModule.NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {} catch (e: Exception) {
      Log.e(TAG, "postTriggerNotification fallo", e)
    }
  }

  private fun createTriggerChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      AlarmModule.TRIGGER_CHANNEL_ID,
      "Alarma invasiva",
      NotificationManager.IMPORTANCE_MAX
    )
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setShowBadge(false)
    channel.setBypassDnd(true)
    notificationManager.createNotificationChannel(channel)
  }
}