const FORTUNE_LOCALES = Object.freeze({
  tr: { language: "Turkish", locale: "tr-TR", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary Turkey Turkish that sounds originally written in Turkish. Warm, concise, graceful and lightly playful; favor concrete daily-life wording and natural Turkish word order. Avoid ornate mysticism, old-fashioned wording, translated idioms, motivational slogans, fate, cosmic energy and miracles." },
  en: { language: "English", locale: "en-US", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary North American English. Warm, concise and emotionally natural. Avoid ornate mysticism, translated idioms and exaggerated promises." },
  de: { language: "German", locale: "de-DE", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary standard German. Clear, calm and sincere, with natural sentence rhythm. Avoid inflated promises, mystical jargon and translated idioms." },
  fr: { language: "French", locale: "fr-FR", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary French used in France. Elegant but direct, warm and restrained. Avoid grandiloquence, literal translations and mystical clichés." },
  es: { language: "Spanish", locale: "es-ES", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary Spanish used in Spain. Natural, warm and encouraging without excessive familiarity. Avoid literal translations and dramatic promises." },
  it: { language: "Italian", locale: "it-IT", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary Italian. Fluid, warm and sincere, but concise. Avoid melodrama, ornate prophecy, stereotypes and translated idioms." },
  el: { language: "Greek", locale: "el-GR", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Contemporary standard Greek. Natural, calm and encouraging. Avoid archaic phrasing, mythology clichés, fatalism and exaggerated promises." },
  zh: { language: "Simplified Chinese", locale: "zh-CN", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Natural contemporary Simplified Chinese. Concise, calm and encouraging. Avoid chengyu unless fully natural, classical imitation, stereotypes and fatalism." },
  ja: { language: "Japanese", locale: "ja-JP", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Natural contemporary Japanese. Calm, concise and gently encouraging without being forceful. Avoid archaic language, proverbs, cultural stereotypes and excessive formality." },
  ko: { language: "Korean", locale: "ko-KR", generationTargetCharacters: 160, deliveryMaxCharacters: 200, culturalProfile: "Natural contemporary Korean. Warm, concise and politely encouraging. Avoid archaic expressions, hierarchy assumptions, stereotypes and fatalistic claims." },
});

function getFortuneLocale(language) {
  return FORTUNE_LOCALES[language] || FORTUNE_LOCALES.en;
}

module.exports = { FORTUNE_LOCALES, getFortuneLocale };
