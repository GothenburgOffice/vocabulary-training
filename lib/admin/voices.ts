// Voice suggestions per speech model, from each provider's docs (as in hkarn/requesty-tester).
// Requesty's model list has no voices. The first matching entry wins; any typed voice works.
const OPENAI_TTS1 = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
const VOICES: { match: RegExp; voices: string[]; note: string }[] = [
  {
    match: /^openai\/tts-1/,
    voices: OPENAI_TTS1,
    note: "tts-1 needs a voice. It takes no instructions.",
  },
  {
    match: /^openai\//,
    voices: ["marin", "cedar", ...OPENAI_TTS1, "ballad", "verse"],
    note: "Needs a voice; marin or cedar sound best. Instructions set tone and accent.",
  },
  {
    match: /kokoro/i,
    voices: [
      "af_heart",
      "af_bella",
      "af_nicole",
      "af_sarah",
      "am_adam",
      "am_michael",
      "bf_emma",
      "bf_isabella",
      "bm_george",
      "bm_lewis",
      "jf_alpha",
      "jm_kumo",
      "zf_xiaoxiao",
      "zm_yunxi",
      "ef_dora",
      "em_alex",
      "ff_siwis",
      "hf_alpha",
      "if_sara",
      "im_nicola",
      "pf_dora",
      "pm_alex",
    ],
    note: "The first letter is the language (a/b English, j Japanese, z Chinese, e Spanish, f French, h Hindi, i Italian, p Portuguese); f or m for female or male.",
  },
  {
    match: /orpheus/i,
    voices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"],
    note: "English voices, most natural first.",
  },
  {
    match: /mimo.*tts/i,
    voices: ["Mia", "Chloe", "Milo", "Dean", "mimo_default"],
    note: "mimo_default is Mia outside China.",
  },
  {
    match: /voicedesign/i,
    voices: [],
    note: "No preset voices: describe the voice in the instructions.",
  },
];

export function voicesFor(model: string) {
  return VOICES.find((entry) => entry.match.test(model)) ?? { voices: [], note: "" };
}
