package com.alejandro.readtrack.alarm

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class AlarmActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
    )
    setContentView(buildContentView())
  }

  override fun onStart() {
    super.onStart()
    AlarmRing.start(this)
  }

  override fun onStop() {
    super.onStop()
    AlarmRing.stop()
    if (!isFinishing) {
      finish()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    AlarmRing.stop()
    try {
      val notificationManager =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.cancel(AlarmModule.NOTIFICATION_ID)
    } catch (_: Exception) {}
  }

  private fun buildContentView(): View {
    val container = LinearLayout(this)
    container.orientation = LinearLayout.VERTICAL
    container.gravity = Gravity.CENTER
    container.setPadding(48, 48, 48, 48)
    container.setBackgroundColor(Color.parseColor("#1F1B2E"))

    val title = TextView(this)
    title.text = "¡Tiempo cumplido!"
    title.textSize = 40f
    title.setTextColor(Color.WHITE)
    title.typeface = Typeface.DEFAULT_BOLD
    title.gravity = Gravity.CENTER

    val subtitle = TextView(this)
    subtitle.text = "Tu sesión de lectura terminó"
    subtitle.textSize = 20f
    subtitle.setTextColor(Color.parseColor("#CECBF6"))
    subtitle.gravity = Gravity.CENTER

    val stopButton = Button(this)
    stopButton.text = "Detener"
    stopButton.textSize = 22f
    stopButton.setOnClickListener {
      AlarmRing.stop()
      finish()
    }

    container.addView(
      title,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    )
    val margin = 24
    val subtitleParams =
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    subtitleParams.topMargin = margin
    subtitleParams.bottomMargin = margin
    container.addView(subtitle, subtitleParams)
    container.addView(
      stopButton,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    )
    return container
  }
}

object AlarmRing {
  private var player: MediaPlayer? = null

  fun start(context: Context) {
    stop()
    try {
      val resId = context.resources.getIdentifier("alarm", "raw", context.packageName)
      val uri: Uri = if (resId != 0) {
        Uri.parse("android.resource://${context.packageName}/$resId")
      } else {
        Settings.System.DEFAULT_ALARM_ALERT_URI
      }
      val mediaPlayer = MediaPlayer()
      mediaPlayer.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
          .build()
      )
      mediaPlayer.setDataSource(context, uri)
      mediaPlayer.isLooping = true
      mediaPlayer.prepare()
      mediaPlayer.start()
      player = mediaPlayer
    } catch (_: Exception) {}
  }

  fun stop() {
    try {
      player?.let { current ->
        current.stop()
        current.release()
      }
    } catch (_: Exception) {}
    player = null
  }
}