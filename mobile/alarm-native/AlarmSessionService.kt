package com.alejandro.readtrack.alarm

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Servicio en primer plano que mantiene viva la sesión de lectura (temporizador
 * y cronómetro), publica una notificación persistente con los botones
 * Pausar/Reanudar visible en la pantalla de bloqueo y cuenta con
 * SystemClock.elapsedRealtime() para seguir siendo preciso en Doze y con la
 * app en segundo plano.
 */
class AlarmSessionService : Service() {

  companion object {
    const val SESSION_CHANNEL_ID = "sesion_lectura"
    const val SESSION_NOTIFICATION_ID = 8002
    const val REQUEST_PAUSE = 8200
    const val REQUEST_RESUME = 8201
    private const val TAG = "ReadTrackAlarm"

    fun scheduleExactAlarm(context: Context) {
      try {
        val remainingMs = AlarmSessionState.currentMillis(context)
        if (remainingMs <= 0 || !AlarmSessionState.isTimer(context)) return
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val showIntent = PendingIntent.getActivity(
          context,
          AlarmModule.REQUEST_CODE_SHOW,
          Intent(context, AlarmActivity::class.java).addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
          ),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val operation = PendingIntent.getBroadcast(
          context,
          AlarmModule.REQUEST_CODE_ALARM,
          Intent(context, AlarmReceiver::class.java).setAction(AlarmModule.ACTION_ALARM_FIRE),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.setAlarmClock(
          AlarmManager.AlarmClockInfo(System.currentTimeMillis() + remainingMs, showIntent),
          operation
        )
      } catch (e: Exception) {
        Log.e(TAG, "scheduleExactAlarm fallo", e)
      }
    }

    fun cancelExactAlarm(context: Context) {
      try {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val operation = PendingIntent.getBroadcast(
          context,
          AlarmModule.REQUEST_CODE_ALARM,
          Intent(context, AlarmReceiver::class.java).setAction(AlarmModule.ACTION_ALARM_FIRE),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(operation)
      } catch (_: Exception) {}
    }

    fun refreshNotification(context: Context) {
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(SESSION_NOTIFICATION_ID, buildSessionNotification(context))
      } catch (_: Exception) {}
    }

    fun buildSessionNotification(context: Context): Notification {
      val paused = AlarmSessionState.isPaused(context)
      val timer = AlarmSessionState.isTimer(context)
      val sec = AlarmSessionState.currentSeconds(context).toInt()
      val text = if (timer) {
        if (sec <= 0) "¡Tiempo cumplido!" else "Quedan " + formatTime(sec)
      } else {
        "Leíste " + formatTime(sec)
      }
      val title = if (paused) "Sesión en pausa" else "Sesión de lectura"

      val pauseIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_PAUSE,
        Intent(context, AlarmActionReceiver::class.java).setAction(AlarmActionReceiver.ACTION_PAUSE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val resumeIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_RESUME,
        Intent(context, AlarmActionReceiver::class.java).setAction(AlarmActionReceiver.ACTION_RESUME),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val builder = NotificationCompat.Builder(context, SESSION_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(title)
        .setContentText(text)
        .setSubText(AlarmSessionState.bookTitle(context) ?: "")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_LOW)
      if (paused) {
        builder.addAction(android.R.drawable.ic_media_play, "Reanudar", resumeIntent)
      } else {
        builder.addAction(android.R.drawable.ic_media_pause, "Pausar", pauseIntent)
      }
      return builder.build()
    }

    private fun formatTime(sec: Int): String {
      val h = sec / 3600
      val m = (sec % 3600) / 60
      val s = sec % 60
      return if (h > 0) String.format("%d:%02d:%02d", h, m, s)
      else String.format("%02d:%02d", m, s)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var started = false

  private val tick = object : Runnable {
    override fun run() {
      if (!AlarmSessionState.isActive(this@AlarmSessionService)) {
        stopSelf()
        return
      }
      if (AlarmSessionState.isTimer(this@AlarmSessionService)) {
        val remaining = AlarmSessionState.currentMillis(this@AlarmSessionService)
        if (!AlarmSessionState.isPaused(this@AlarmSessionService) && remaining <= 0L) {
          onTimerComplete()
          return
        }
      }
      refreshNotification(this@AlarmSessionService)
      handler.postDelayed(this, 1000L)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (started) return START_STICKY
    started = true
    ensureSessionChannel()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        SESSION_NOTIFICATION_ID,
        buildSessionNotification(this),
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(SESSION_NOTIFICATION_ID, buildSessionNotification(this))
    }
    if (AlarmSessionState.isTimer(this) && !AlarmSessionState.isPaused(this)) {
      scheduleExactAlarm(this)
    }
    refreshNotification(this)
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, 1000L)
    return START_STICKY
  }

  private fun ensureSessionChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        SESSION_CHANNEL_ID,
        "Sesión de lectura",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      nm.createNotificationChannel(channel)
    } catch (_: Exception) {}
  }

  private fun onTimerComplete() {
    Log.d(TAG, "temporizador llegó a 0 en el servicio")
    if (AlarmForegroundTracker.isForeground) {
      // App en primer plano: el flujo JS ya disparó su aviso; solo refresca.
      refreshNotification(this)
      handler.postDelayed(tick, 1000L)
      return
    }
    AlarmFire.fire(this)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }
}