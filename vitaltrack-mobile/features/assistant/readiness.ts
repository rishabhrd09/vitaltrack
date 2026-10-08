/** Explain every microphone prerequisite instead of rendering a silently disabled button. */
export function microphoneReadiness(state: {
  loaded: boolean; supported: boolean; modelChecked: boolean; modelReady: boolean;
  enabled: boolean; microphone: boolean; cloudListening?: boolean;
}): string | null {
  if (!state.loaded || !state.cloudListening && !state.modelChecked) return 'Checking voice setup…';
  if (!state.supported) return 'Voice recording needs the Android preview app. You can still type a question.';
  if (!state.cloudListening && !state.modelReady) return 'Download the English speech pack in Voice setup before using the microphone.';
  if (!state.enabled) return 'Turn on the assistant in Voice setup to get started.';
  if (!state.microphone) return 'Enable tap-to-talk in Voice setup to use the microphone.';
  return null;
}

export const ANSWER_VISIBLE_MS = 10_000;
export function canDismissAnswer(state: { hasAnswer: boolean; hasChoices: boolean; keptOpen: boolean; busy: boolean; recording: boolean; screenReader: boolean }) {
  return state.hasAnswer && !state.hasChoices && !state.keptOpen && !state.busy && !state.recording && !state.screenReader;
}
