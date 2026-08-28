package com.alejandro.readtrack.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.app.KeyguardManager
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmModule.ACTION_ALARM_FIRE) return
    if (AlarmForegroundTracker.isForeground) return

    createTriggerChannel(context)
    postTriggerNotification(context)

    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    val screenOn = powerManager.isInteractive
    val locked = keyguardManager.isKeyguardLocked
    if (screenOn && !locked) {
      startAlarmActivity(context)
    }
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
    } catch (_: Exception) {}
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
      val icon = context.applicationInfo.icon.takeIf { it != 0 }
        ?: android.R.drawable.ic_popup_reminder
      val notification = NotificationCompat.Builder(context, AlarmModule.TRIGGER_CHANNEL_ID)
        .setContentTitle("Tiempo cumplido")
        .setContentText("Tu sesión de lectura terminó")
        .setSmallIcon(icon)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setFullScreenIntent(activityIntent, true)
        .setAutoCancel(false)
        .setOngoing(true)
        .build()
      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.notify(AlarmModule.NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {} catch (_: Exception) {}
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