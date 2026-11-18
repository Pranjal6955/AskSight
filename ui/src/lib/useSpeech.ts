import { useCallback } from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

export function useSpeech() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const play = useCallback(
    async (uri: string, rate: number) => {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "duckOthers",
      });
      player.replace(uri);
      player.setPlaybackRate(rate);
      player.play();
    },
    [player],
  );

  const stop = useCallback(async () => {
    player.pause();
    await player.seekTo(0).catch(() => {});
  }, [player]);

  return {
    play,
    stop,
    isPlaying: status.playing,
    didJustFinish: status.didJustFinish,
  };
}
