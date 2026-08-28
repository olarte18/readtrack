package com.alejandro.readtrack.alarm

import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext

object AlarmForegroundTracker : LifecycleEventListener {

  @Volatile
  var isForeground = false
    private set

  fun attach(context: ReactContext) {
    context.addLifecycleEventListener(this)
  }

  override fun onHostResume() {
    isForeground = true
  }

  override fun onHostPause() {
    isForeground = false
  }

  override fun onHostDestroy() {
    isForeground = false
  }
}