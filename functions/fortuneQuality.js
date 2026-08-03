"use strict";

const STOP_WORDS = new Set([
  "ama", "ancak", "bir", "bile", "bu", "çok", "da", "de", "en", "gibi",
  "için", "ile", "kadar", "kendi", "o", "olan", "sana", "seni", "senin",
  "ve", "veya", "yakında", "zaman", "the", "a", "an", "and", "but", "for",
  "in", "into", "of", "on", "or", "that", "to", "will", "with", "your",
]);

const MOTIF_PATTERNS = {
  depths: /(?:^|\s)(derin\p{L}*|dip\p{L}*|su(?:lar)?\p{L}*|kuyu\p{L}*|depth\p{L}*|deep|water\p{L}*)(?=\s|$)/iu,
  darkness: /(?:^|\s)(karanl\p{L}*|golge\p{L}*|gizem\p{L}*|dark\p{L}*|shadow\p{L}*|myster\p{L}*)(?=\s|$)/iu,
  silence: /(?:^|\s)(sessiz\p{L}*|fısılt\p{L}*|suskun\p{L}*|silence|silent|whisper\p{L}*)(?=\s|$)/iu,
  patience: /(?:^|\s)(sabır\p{L}*|vakti\p{L}*|bekle\p{L}*|patien\p{L}*|waiting|waits)(?=\s|$)/iu,
  mountain: /(?:^|\s)(dag\p{L}*|kaya\p{L}*|zirve\p{L}*|patika\p{L}*|mountain\p{L}*|rock\p{L}*|peak\p{L}*|path\p{L}*)(?=\s|$)/iu,
  light: /(?:^|\s)(ısı(?:k|g)\p{L}*|aydın\p{L}*|safak\p{L}*|parla\p{L}*|light\p{L}*|dawn\p{L}*|bright\p{L}*|shine\p{L}*)(?=\s|$)/iu,
  storm: /(?:^|\s)(fırtına\p{L}*|sars\p{L}*|storm\p{L}*|shake\p{L}*)(?=\s|$)/iu,
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(value) {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(contentWords(left));
  const rightSet = new Set(contentWords(right));
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((word) => rightSet.has(word)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return intersection / union;
}

function smallerSetCoverage(left, right) {
  const leftSet = new Set(contentWords(left));
  const rightSet = new Set(contentWords(right));
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((word) => rightSet.has(word)).length;
  return intersection / Math.min(leftSet.size, rightSet.size);
}

function motifSignature(value) {
  const text = normalizeText(value);
  return Object.entries(MOTIF_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function sharedMotifCount(left, right) {
  const rightMotifs = new Set(motifSignature(right));
  return motifSignature(left).filter((motif) => rightMotifs.has(motif)).length;
}

function isTooSimilar(candidate, recentFortunes = []) {
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate) return true;

  return recentFortunes.some((entry) => {
    const previous = typeof entry === "string" ? entry : entry?.text;
    if (!previous) return false;
    const normalizedPrevious = normalizeText(previous);
    if (normalizedCandidate === normalizedPrevious) return true;
    if (jaccardSimilarity(candidate, previous) >= 0.34) return true;
    if (smallerSetCoverage(candidate, previous) >= 0.46) return true;
    return sharedMotifCount(candidate, previous) >= 3;
  });
}

module.exports = {
  contentWords,
  isTooSimilar,
  jaccardSimilarity,
  motifSignature,
  normalizeText,
  sharedMotifCount,
  smallerSetCoverage,
};
