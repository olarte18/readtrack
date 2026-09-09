package com.alejandro.readtrack.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class AlarmModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    AlarmForegroundTracker.attach(reactContext)
  }

  override fun getName(): String = "ReadTrackAlarm"

  @ReactMethod
  fun schedule(timestampMillis: Double, promise: Promise) {
    try {
      val triggerAtMillis = timestampMillis.toLong()
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val showIntent = PendingIntent.getActivity(
        reactContext,
        REQUEST_CODE_SHOW,
        Intent(reactContext, AlarmActivity::class.java).addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        ),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val operation = PendingIntent.getBroadcast(
        reactContext,
        REQUEST_CODE_ALARM,
        Intent(reactContext, AlarmReceiver::class.java).setAction(ACTION_ALARM_FIRE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      alarmManager.setAlarmClock(
        AlarmManager.AlarmClockInfo(triggerAtMillis, showIntent),
        operation
      )
      Log.d(TAG, "alarma programada para $triggerAtMillis")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e(TAG, "schedule fallo", e)
      promise.reject("ALARM_SCHEDULE_FAILED", e)
    }
  }

  @ReactMethod
  fun cancel() {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val operation = PendingIntent.getBroadcast(
        reactContext,
        REQUEST_CODE_ALARM,
        Intent(reactContext, AlarmReceiver::class.java).setAction(ACTION_ALARM_FIRE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      alarmManager.cancel(operation)
      operation.cancel()
      Log.d(TAG, "alarma cancelada")
    } catch (e: Exception) {
      Log.e(TAG, "cancel fallo", e)
    }
  }

  @ReactMethod
  fun setKeepAwake(enabled: Boolean) {
    try {
      val activity = reactContext.currentActivity ?: return
      activity.runOnUiThread {
        if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    } catch (_: Exception) {}
  }

  /**
   * Arranca el servicio en primer plano de la sesión (temporizador o
   * cronómetro) y deja la alarma exacta programada para el fin del
   * temporizador. Los datos de la sesión quedan en prefs para la notificación
   * de bloqueo, la alarma y el deep-link de vuelta a la app.
   */
  @ReactMethod
  fun startAlarmSession(options: ReadableMap, promise: Promise) {
    try {
      val mode = options.getString("mode") ?: AlarmSessionState.MODE_TIMER
      val durationMs = if (options.hasKey("durationMs")) options.getDouble("durationMs").toLong() else 0L
      val bookId = options.getString("bookId") ?: ""
      val bookTitle = options.getString("bookTitle") ?: ""
      val startPage = if (options.hasKey("startPage")) options.getDouble("startPage").toInt() else 0
      AlarmSessionState.begin(reactContext, mode, durationMs, bookId, bookTitle, startPage)
      val intent = Intent(reactContext, AlarmSessionService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      Log.d(TAG, "sesión iniciada ($mode, ${durationMs}ms)")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e(TAG, "startAlarmSession fallo", e)
      promise.reject("SESSION_START_FAILED", e)
    }
  }

  @ReactMethod
  fun setSessionPaused(paused: Boolean) {
    try {
      if (paused) {
        AlarmSessionState.pause(reactContext)
        AlarmSessionService.cancelExactAlarm(reactContext)
      } else {
        AlarmSessionState.resume(reactContext)
        AlarmSessionService.scheduleExactAlarm(reactContext)
      }
      AlarmSessionService.refreshNotification(reactContext)
    } catch (e: Exception) {
      Log.e(TAG, "setSessionPaused fallo", e)
    }
  }

  @ReactMethod
  fun stopAlarmSession() {
    try {
      AlarmSessionService.cancelExactAlarm(reactContext)
      AlarmSessionState.clear(reactContext)
      try {
        val notificationManager =
          reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(AlarmSessionService.SESSION_NOTIFICATION_ID)
      } catch (_: Exception) {}
      reactContext.stopService(Intent(reactContext, AlarmSessionService::class.java))
    } catch (e: Exception) {
      Log.e(TAG, "stopAlarmSession fallo", e)
    }
  }

  @ReactMethod
  fun getSessionState(promise: Promise) {
    try {
      val map = Arguments.createMap()
      map.putBoolean("active", AlarmSessionState.isActive(reactContext))
      map.putBoolean("paused", AlarmSessionState.isPaused(reactContext))
      map.putBoolean("fired", AlarmSessionState.isFired(reactContext))
      map.putString("mode", AlarmSessionState.mode(reactContext))
      map.putDouble("seconds", AlarmSessionState.currentSeconds(reactContext).toDouble())
      map.putDouble("durationMs", AlarmSessionState.durationMs(reactContext).toDouble())
      map.putString("bookId", AlarmSessionState.bookId(reactContext))
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("GET_SESSION_STATE_FAILED", e)
    }
  }

  companion object {
    const val ACTION_ALARM_FIRE = "com.alejandro.readtrack.ALARM_FIRE"
    const val REQUEST_CODE_ALARM = 8100
    const val REQUEST_CODE_SHOW = 8101
    const val NOTIFICATION_ID = 8001
    const val TRIGGER_CHANNEL_ID = "alarm_invasiva"
    private const val TAG = "ReadTrackAlarm"
  }
}