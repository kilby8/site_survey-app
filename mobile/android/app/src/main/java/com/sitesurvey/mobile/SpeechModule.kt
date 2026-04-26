package com.sitesurvey.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class SpeechModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var recognizer: SpeechRecognizer? = null

    override fun getName() = "SpeechModule"

    private fun emit(event: String, data: String) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, data)
    }

    @ReactMethod
    fun start(promise: Promise) {
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION", "RECORD_AUDIO permission not granted")
            return
        }
        reactContext.runOnUiQueueThread {
            recognizer?.destroy()
            recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
            recognizer!!.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(p: Bundle?) { emit("speech_start", "") }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(v: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() { emit("speech_end", "") }
                override fun onError(code: Int) { emit("speech_error", code.toString()) }
                override fun onResults(b: Bundle?) {
                    val results = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    emit("speech_results", results?.firstOrNull() ?: "")
                }
                override fun onPartialResults(b: Bundle?) {
                    val partial = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    emit("speech_partial", partial?.firstOrNull() ?: "")
                }
                override fun onEvent(t: Int, p: Bundle?) {}
            })
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            recognizer!!.startListening(intent)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        reactContext.runOnUiQueueThread {
            recognizer?.stopListening()
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun destroy(promise: Promise) {
        reactContext.runOnUiQueueThread {
            recognizer?.destroy()
            recognizer = null
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        recognizer?.destroy()
        recognizer = null
    }
}