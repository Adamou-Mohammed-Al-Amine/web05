import { Location } from "./prayerCalc";

export interface CitySearchResult {
  name: string;
  country: string;
  admin1?: string; // state/province/region, when available
  latitude: number;
  longitude: number;
  timeZoneId: string;
  population?: number;
}

interface OpenMeteoGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  population?: number;
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[];
}

const SEARCH_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Searches for cities by name using Open-Meteo's free, keyless geocoding
 * API — the one piece of this app that requires internet. Everything else
 * (prayer calculation) works fully offline once a location is chosen, since
 * the result already carries lat/lng and an IANA time zone.
 *
 * Note: this network call cannot be exercised inside the Linux dev sandbox
 * this project was authored in (only a small domain allowlist is reachable
 * there) — it is written directly against Open-Meteo's documented, stable
 * response shape, but has not been run against the live endpoint. Verify on
 * first real run; the try/catch below at least fails soft rather than
 * crashing the settings UI if the shape ever changes or the network is down.
 */
export async function searchCities(query: string, count = 8): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = `${SEARCH_ENDPOINT}?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data: OpenMeteoGeocodingResponse = await response.json();
    if (!data.results) return [];

    return data.results
      .filter((r) => typeof r.timezone === "string" && r.timezone.length > 0)
      .map((r) => ({
        name: r.name,
        country: r.country ?? r.country_code ?? "",
        admin1: r.admin1,
        latitude: r.latitude,
        longitude: r.longitude,
        timeZoneId: r.timezone,
        population: r.population,
      }));
  } catch {
    // Offline, DNS failure, or the API is unreachable — the settings UI
    // should show "couldn't search — check your connection", not crash.
    return [];
  }
}

export function cityResultToLocation(result: CitySearchResult): Location {
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    timeZoneId: result.timeZoneId,
  };
}

export function formatCityLabel(result: CitySearchResult): string {
  const parts = [result.name];
  if (result.admin1 && result.admin1 !== result.name) parts.push(result.admin1);
  if (result.country) parts.push(result.country);
  return parts.join(", ");
}

export interface DetectedLocation {
  latitude: number;
  longitude: number;
  timeZoneId: string | null; // null if the service didn't return one — caller should let the user confirm/edit it
  city?: string;
  country?: string;
}

const IP_GEOLOCATION_ENDPOINT = "https://get.geojs.io/v1/ip/geo.json";
const IP_GEOLOCATION_FALLBACK_ENDPOINT = "https://ipapi.co/json/";

/**
 * Detects the user's approximate location from their IP address, for a
 * one-click "use my current location" option alongside manual city search.
 * Tries GeoJS first (documented full CORS support), then falls back to
 * ipapi.co if that fails for any reason — one free IP-geolocation service
 * being temporarily down/rate-limited/blocked shouldn't be a dead end.
 *
 * IP-based geolocation is approximate (city/region level, sometimes off by
 * tens of km) — accurate enough for prayer-time calculation, but the
 * Settings UI should let the user verify/adjust the fields afterward.
 */
export async function detectCurrentLocation(): Promise<DetectedLocation | null> {
  const primary = await tryDetectFrom(IP_GEOLOCATION_ENDPOINT, "geojs");
  if (primary) return primary;
  return await tryDetectFrom(IP_GEOLOCATION_FALLBACK_ENDPOINT, "ipapi");
}

async function tryDetectFrom(endpoint: string, provider: "geojs" | "ipapi"): Promise<DetectedLocation | null> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      console.warn(`[location] ${provider} responded with status ${response.status}`);
      return null;
    }
    const data = await response.json();

    const latitude = parseFloat(provider === "ipapi" ? data.latitude : data.latitude);
    const longitude = parseFloat(provider === "ipapi" ? data.longitude : data.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      console.warn(`[location] ${provider} response missing usable lat/lon:`, data);
      return null;
    }

    const timeZoneId = typeof data.timezone === "string" && data.timezone.length > 0 ? data.timezone : null;

    return {
      latitude,
      longitude,
      timeZoneId,
      city: typeof data.city === "string" ? data.city : undefined,
      country: typeof (data.country ?? data.country_name) === "string" ? (data.country ?? data.country_name) : undefined,
    };
  } catch (e) {
    console.warn(`[location] ${provider} request failed:`, e);
    return null;
  }
}
