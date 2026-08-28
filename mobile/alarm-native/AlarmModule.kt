package com.alejandro.readtrack.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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
      promise.resolve(true)
    } catch (e: Exception) {
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
    } catch (_: Exception) {}
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

  companion object {
    const val ACTION_ALARM_FIRE = "com.alejandro.readtrack.ALARM_FIRE"
    const val REQUEST_CODE_ALARM = 8100
    const val REQUEST_CODE_SHOW = 8101
    const val NOTIFICATION_ID = 8001
    const val TRIGGER_CHANNEL_ID = "alarm_invasiva"
  }
}