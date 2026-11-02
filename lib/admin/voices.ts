// Voice suggestions per speech model, from each provider's docs (as in hkarn/requesty-tester).
// Requesty's model list has no voices. The first matching entry wins; any typed voice works.
const OPENAI_TTS1 = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
// `groups` sorts some of the voices under a label (by language) in the dropdown.
type VoiceGroup = { label: string; voices: string[] };
// Voices by group label, plus any listed before the groups; `voices` has them all.
function grouped(groups: Record<string, string[]>, first: string[] = []) {
  return {
    voices: [...first, ...Object.values(groups).flat()],
    groups: Object.entries(groups).map(([label, voices]) => ({ label, voices })),
  };
}
const VOICES: { match: RegExp; voices: string[]; groups?: VoiceGroup[]; note: string }[] = [
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
    ...grouped({
      "American English": [
        "af_heart",
        "af_alloy",
        "af_aoede",
        "af_bella",
        "af_jessica",
        "af_kore",
        "af_nicole",
        "af_nova",
        "af_river",
        "af_sarah",
        "af_sky",
        "am_adam",
        "am_echo",
        "am_eric",
        "am_fenrir",
        "am_liam",
        "am_michael",
        "am_onyx",
        "am_puck",
        "am_santa",
      ],
      "British English": [
        "bf_alice",
        "bf_emma",
        "bf_isabella",
        "bf_lily",
        "bm_daniel",
        "bm_fable",
        "bm_george",
        "bm_lewis",
      ],
      Japanese: ["jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo"],
      "Mandarin Chinese": [
        "zf_xiaobei",
        "zf_xiaoni",
        "zf_xiaoxiao",
        "zf_xiaoyi",
        "zm_yunjian",
        "zm_yunxi",
        "zm_yunxia",
        "zm_yunyang",
      ],
      Spanish: ["ef_dora", "em_alex", "em_santa"],
      French: ["ff_siwis"],
      Hindi: ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"],
      Italian: ["if_sara", "im_nicola"],
      "Brazilian Portuguese": ["pf_dora", "pm_alex", "pm_santa"],
    }),
    note: "The second letter is f for female, m for male. Pick a voice that matches the language.",
  },
  {
    match: /orpheus/i,
    voices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"],
    note: "English voices, most natural first.",
  },
  {
    match: /mimo.*tts/i,
    ...grouped(
      { English: ["Mia", "Chloe", "Milo", "Dean"], Chinese: ["冰糖", "茉莉", "苏打", "白桦"] },
      ["mimo_default"],
    ),
    note: "mimo_default is Mia outside China.",
  },
  {
    match: /voicedesign/i,
    voices: [],
    note: "No preset voices: describe the voice in the instructions.",
  },
  {
    match: /chatterbox/i,
    voices: [],
    note: "No preset voices: takes the ID of a voice cloned on DeepInfra, or blank for the default.",
  },
  {
    match: /csm-1b/i,
    voices: [],
    note: "No documented preset voices: leave it blank for the default.",
  },
];

export function voicesFor(model: string): {
  voices: string[];
  groups?: VoiceGroup[];
  note: string;
} {
  return VOICES.find((entry) => entry.match.test(model)) ?? { voices: [], note: "" };
}
