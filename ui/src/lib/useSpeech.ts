import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

export function useSpeech() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  async function play(uri: string) {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
    });
    player.replace(uri);
    player.play();
  }

  async function stop() {
    player.pause();
    await player.seekTo(0);
  }

  return { play, stop, isPlaying: status.playing };
}
