import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import type { UploadFile } from "@/lib/api";

const MAX_RECORDING_MS = 60_000;

export function useRecorder(onAutoStop: (file: UploadFile | null) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [error, setError] = useState("");
  const stopping = useRef(false);
  const autoStopped = useRef(false);
  const callback = useRef(onAutoStop);

  useEffect(() => {
    callback.current = onAutoStop;
  }, [onAutoStop]);

  useEffect(() => {
    let active = true;
    void AudioModule.getRecordingPermissionsAsync()
      .then((permission) => {
        if (active) {
          setPermissionGranted(permission.granted);
          setPermissionChecked(true);
        }
      })
      .catch(() => {
        if (active) setPermissionChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    setPermissionGranted(permission.granted);
    setPermissionChecked(true);
    return permission.granted;
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    autoStopped.current = false;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError(
        "We couldn't start the recording. Please try again or type your question.",
      );
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<UploadFile | null> => {
    if (stopping.current) return null;
    stopping.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? state.url;
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: "duckOthers",
      });
      if (!uri) {
        setError(
          "We couldn't save that recording. Please try again or type your question.",
        );
        return null;
      }
      const web = Platform.OS === "web";
      return {
        uri,
        name: web ? "asksight-question.webm" : "asksight-question.m4a",
        type: web ? "audio/webm" : "audio/mp4",
      };
    } catch {
      setError(
        "We couldn't save that recording. Please try again or type your question.",
      );
      return null;
    } finally {
      stopping.current = false;
    }
  }, [recorder, state.url]);

  const cancelRecording = useCallback(async () => {
    if (state.isRecording) await recorder.stop().catch(() => {});
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "duckOthers",
    }).catch(() => {});
    setError("");
  }, [recorder, state.isRecording]);

  useEffect(() => {
    if (
      state.isRecording &&
      state.durationMillis >= MAX_RECORDING_MS &&
      !autoStopped.current
    ) {
      autoStopped.current = true;
      void stopRecording().then((file) => callback.current(file));
    }
  }, [state.durationMillis, state.isRecording, stopRecording]);

  useEffect(
    () => () => {
      if (recorder.getStatus().isRecording)
        void recorder.stop().catch(() => {});
      void setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: "duckOthers",
      }).catch(() => {});
    },
    [recorder],
  );

  return {
    permissionGranted,
    permissionChecked,
    requestPermission,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
    error,
  };
}
