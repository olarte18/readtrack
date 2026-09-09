package com.alejandro.readtrack.alarm

import android.content.Context
import android.os.SystemClock

object AlarmSessionState {

  private const val PREFS = "readtrack_session"

  private const val KEY_ACTIVE = "active"
  private const val KEY_PAUSED = "paused"
  private const val KEY_FIRED = "fired"
  private const val KEY_MODE = "mode"
  private const val KEY_BOOK_ID = "bookId"
  private const val KEY_BOOK_TITLE = "bookTitle"
  private const val KEY_START_PAGE = "startPage"
  private const val KEY_DURATION_MS = "durationMs"
  private const val KEY_ACC_MS = "accMs"
  private const val KEY_RESUME_BASE_MS = "resumeBaseMs"

  const val MODE_TIMER = "timer"
  const val MODE_STOPWATCH = "stopwatch"

  @Volatile
  private var firedInMemory = false

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isActive(context: Context) = prefs(context).getBoolean(KEY_ACTIVE, false)
  fun isPaused(context: Context) = prefs(context).getBoolean(KEY_PAUSED, false)
  fun isTimer(context: Context) = mode(context) == MODE_TIMER
  fun mode(context: Context) = prefs(context).getString(KEY_MODE, MODE_TIMER) ?: MODE_TIMER
  fun durationMs(context: Context) = prefs(context).getLong(KEY_DURATION_MS, 0L)
  fun bookId(context: Context) = prefs(context).getString(KEY_BOOK_ID, null)
  fun bookTitle(context: Context) = prefs(context).getString(KEY_BOOK_TITLE, null)
  fun startPage(context: Context) = prefs(context).getInt(KEY_START_PAGE, 0)

  fun begin(
    context: Context,
    mode: String,
    durationMs: Long,
    bookId: String,
    bookTitle: String,
    startPage: Int
  ) {
    prefs(context).edit()
      .putBoolean(KEY_ACTIVE, true)
      .putBoolean(KEY_PAUSED, false)
      .putBoolean(KEY_FIRED, false)
      .putString(KEY_MODE, mode)
      .putString(KEY_BOOK_ID, bookId)
      .putString(KEY_BOOK_TITLE, bookTitle)
      .putInt(KEY_START_PAGE, startPage)
      .putLong(KEY_DURATION_MS, durationMs)
      .putLong(KEY_ACC_MS, 0L)
      .putLong(KEY_RESUME_BASE_MS, SystemClock.elapsedRealtime())
      .apply()
    firedInMemory = false
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
    firedInMemory = false
  }

  fun isFired(context: Context): Boolean = synchronized(this) {
    firedInMemory || prefs(context).getBoolean(KEY_FIRED, false)
  }

  fun setFired(context: Context, fired: Boolean) = synchronized(this) {
    firedInMemory = fired
    prefs(context).edit().putBoolean(KEY_FIRED, fired).apply()
  }

  /** Congela el tiempo actual en `accMs` y marca la sesión como pausada. */
  fun pause(context: Context) {
    val now = SystemClock.elapsedRealtime()
    val prefs = prefs(context)
    val accumulated = prefs.getLong(KEY_ACC_MS, 0L) +
      (now - prefs.getLong(KEY_RESUME_BASE_MS, now))
    val acc = if (isTimer(context)) {
      minOf(durationMs(context), maxOf(0L, accumulated))
    } else {
      maxOf(0L, accumulated)
    }
    prefs.edit()
      .putBoolean(KEY_PAUSED, true)
      .putLong(KEY_ACC_MS, acc)
      .apply()
  }

  fun resume(context: Context) {
    prefs(context).edit()
      .putBoolean(KEY_PAUSED, false)
      .putLong(KEY_RESUME_BASE_MS, SystemClock.elapsedRealtime())
      .apply()
  }

  /** Temporizador: milisegundos restantes. Cronómetro: milisegundos transcurridos. */
  fun currentMillis(context: Context): Long {
    val prefs = prefs(context)
    if (!prefs.getBoolean(KEY_ACTIVE, false)) return 0L
    val running = !prefs.getBoolean(KEY_PAUSED, true)
    val now = SystemClock.elapsedRealtime()
    return if (isTimer(context)) {
      val remaining = durationMs(context) -
        prefs.getLong(KEY_ACC_MS, 0L) -
        (if (running) now - prefs.getLong(KEY_RESUME_BASE_MS, now) else 0L)
      maxOf(0L, remaining)
    } else {
      prefs.getLong(KEY_ACC_MS, 0L) +
        (if (running) now - prefs.getLong(KEY_RESUME_BASE_MS, now) else 0L)
    }
  }

  fun currentSeconds(context: Context): Long = currentMillis(context) / 1000L
}