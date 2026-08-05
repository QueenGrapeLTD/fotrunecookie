const GEOCODING_ENDPOINT = "https://photon.komoot.io/api/";
const TIMEZONE_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

function normalizeLocationText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateText(candidate) {
  const properties = candidate?.properties || {};
  return normalizeLocationText([
    ...Object.values(properties),
  ].filter(Boolean).join(" "));
}

function scoreCandidate(candidate, country, city, region) {
  const haystack = candidateText(candidate);
  const normalizedCountry = normalizeLocationText(country);
  const normalizedCity = normalizeLocationText(city);
  const normalizedRegion = normalizeLocationText(region);
  let score = Number(candidate?.population || 0) > 0
    ? Math.min(Math.log10(Number(candidate.population) + 1), 7)
    : 0;

  if (normalizedCountry && haystack.includes(normalizedCountry)) score += 24;
  if (normalizedCity && haystack.includes(normalizedCity)) score += 18;
  if (normalizedRegion && haystack.includes(normalizedRegion)) score += 28;
  if (normalizedRegion && normalizeLocationText(candidate?.properties?.name) === normalizedRegion) score += 16;
  if (normalizedCity && normalizeLocationText(candidate?.properties?.name) === normalizedCity) score += 12;
  return score;
}

async function searchLocations(query, language, signal) {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
  });
  const response = await fetch(`${GEOCODING_ENDPOINT}?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Konum servisi HTTP ${response.status} yanıtı verdi.`);
  }
  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function resolveTimezone(latitude, longitude, signal) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    forecast_days: "1",
  });
  const response = await fetch(`${TIMEZONE_ENDPOINT}?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Saat dilimi servisi HTTP ${response.status} yanıtı verdi.`);
  }
  const data = await response.json();
  return typeof data?.timezone === "string" ? data.timezone : "";
}

export async function resolveBirthLocation({
  country,
  city,
  region = "",
  language = "tr",
}) {
  const cleanCountry = String(country || "").trim();
  const cleanCity = String(city || "").trim();
  const cleanRegion = String(region || "").trim();
  if (cleanCountry.length < 2 || cleanCity.length < 2) {
    throw new Error("Ülke ve şehir alanlarını doldurun.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const query = [cleanRegion, cleanCity, cleanCountry]
      .filter(Boolean)
      .join(", ");
    const candidates = await searchLocations(
      query,
      language,
      controller.signal,
    );
    if (!candidates.length) {
      throw new Error("Bu bilgilerle eşleşen bir doğum yeri bulunamadı.");
    }

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(
          candidate,
          cleanCountry,
          cleanCity,
          cleanRegion,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.candidate;
    if (
      !best ||
      !Array.isArray(best?.geometry?.coordinates) ||
      !Number.isFinite(Number(best.geometry.coordinates[0])) ||
      !Number.isFinite(Number(best.geometry.coordinates[1]))
    ) {
      throw new Error("Konumun koordinat bilgisi eksik.");
    }

    const longitude = Number(best.geometry.coordinates[0]);
    const latitude = Number(best.geometry.coordinates[1]);
    const timezoneId = await resolveTimezone(
      latitude,
      longitude,
      controller.signal,
    );
    if (!timezoneId) {
      throw new Error("Konumun saat dilimi belirlenemedi.");
    }
    const address = best.properties || {};
    const displayName = [cleanRegion, cleanCity, cleanCountry].filter(Boolean);
    return {
      latitude,
      longitude,
      timezoneId,
      displayName: displayName.join(", ") || query,
      country: address.country || cleanCountry,
      city:
        address.state ||
        address.city ||
        cleanCity,
      region:
        address.district ||
        address.name ||
        cleanRegion,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Konum sorgusu zaman aşımına uğradı.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function offsetAtInstant(timezoneId, instantMs) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instantMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (representedAsUtc - instantMs) / 3_600_000;
}

export function calculateUtcOffsetForLocalDate(
  timezoneId,
  dateString,
  timeString = "12:00",
) {
  if (!timezoneId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
    return null;
  }
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = String(timeString || "12:00").split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  try {
    const desiredLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let offset = offsetAtInstant(timezoneId, desiredLocalAsUtc);
    const estimatedInstant = desiredLocalAsUtc - offset * 3_600_000;
    offset = offsetAtInstant(timezoneId, estimatedInstant);
    return Math.round(offset * 4) / 4;
  } catch {
    return null;
  }
}
