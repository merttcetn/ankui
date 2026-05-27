export const REMEMBER_MESSAGES: ReadonlyArray<string> = [
  "Remembering...",
  "Anghkooey.",
  "The village remembers every agent you've configured.",
  "Searching for what you left behind...",
  "Some skills haven't slept in a long time.",
  "Counting the things in your filesystem that don't want to be forgotten.",
  "Whispering 'anghkooey' to your home directory...",
  "Reading the symbols carved into .claude/...",
  "We never really leave a project. The configs stay.",
  "Marking every door you've opened to an AI.",
  "Listening for what your filesystem won't say out loud.",
  "Some MCPs come out only at night. We're awake.",
  "What you saved, what you forgot, what's still watching.",
  "Following the children's chant.",
  "Your past sessions are humming a tune somewhere.",
  "The lighthouse is on. We're still here.",
  "Some doors should stay closed. We're just counting them.",
  "Boyd would want a perimeter check.",
  "Tabitha drew this once. We're tracing it again.",
  "anghkooey · anghkooey · anghkooey"
];

export const SCAN_COMPLETE = "Remembered.";

export const EMPTY_STATE_WHISPERS = {
  noFindings: "the talismans are holding.",
  noMcps: "no servers configured. you haven't asked for help yet.",
  noWarnings: "quiet tonight.",
  noProjectSkills: "nothing left here to remember.",
  noActions: "nothing staged. nothing to disturb."
} as const;

export type EmptyStateWhisperKey = keyof typeof EMPTY_STATE_WHISPERS;

export const IDLE_WHISPERS: ReadonlyArray<string> = [
  "every scan is another lap.",
  "anghkooey.",
  "the village remembers.",
  "remember, remember.",
  "what you saved is still watching.",
  "the lighthouse is on.",
  "we never really leave a project."
];

/**
 * Returns a new array: first `keepLeading` items in their original positions,
 * remaining items shuffled (Fisher-Yates). `random` defaults to Math.random and
 * can be injected for deterministic tests.
 */
export function shuffleRemainder<T>(
  items: ReadonlyArray<T>,
  keepLeading: number,
  random: () => number = Math.random
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > keepLeading; i--) {
    const j = keepLeading + Math.floor(random() * (i - keepLeading + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Picks a uniformly random idle whisper. `random` injectable for tests. */
export function pickRandomWhisper(random: () => number = Math.random): string {
  const idx = Math.floor(random() * IDLE_WHISPERS.length);
  return IDLE_WHISPERS[Math.min(idx, IDLE_WHISPERS.length - 1)];
}
