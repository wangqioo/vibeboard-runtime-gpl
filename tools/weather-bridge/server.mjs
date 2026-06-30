import { createServer } from "node:http";

const DEFAULTS = {
  host: "0.0.0.0",
  port: 8792,
  latitude: 31.2304,
  longitude: 121.4737,
  locationName: "Shanghai",
};

const LOCATION_COORDS = new Map([
  ["101020100", { latitude: 31.2304, longitude: 121.4737, locationName: "Shanghai" }],
  ["101210401", { latitude: 29.8683, longitude: 121.544, locationName: "Ningbo" }],
]);

function readValue(args, index, prefix) {
  const arg = args[index];
  if (arg.startsWith(`${prefix}=`)) {
    return { value: arg.slice(prefix.length + 1), consumed: 1 };
  }
  return { value: args[index + 1], consumed: 2 };
}

function numberValue(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a number`);
  }
  return number;
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < args.length;) {
    const arg = args[i];
    if (arg === "--host" || arg.startsWith("--host=")) {
      const parsed = readValue(args, i, "--host");
      options.host = parsed.value;
      i += parsed.consumed;
      continue;
    }
    if (arg === "--port" || arg.startsWith("--port=")) {
      const parsed = readValue(args, i, "--port");
      options.port = numberValue("--port", parsed.value);
      i += parsed.consumed;
      continue;
    }
    if (arg === "--latitude" || arg.startsWith("--latitude=")) {
      const parsed = readValue(args, i, "--latitude");
      options.latitude = numberValue("--latitude", parsed.value);
      i += parsed.consumed;
      continue;
    }
    if (arg === "--longitude" || arg.startsWith("--longitude=")) {
      const parsed = readValue(args, i, "--longitude");
      options.longitude = numberValue("--longitude", parsed.value);
      i += parsed.consumed;
      continue;
    }
    if (arg === "--location-name" || arg.startsWith("--location-name=")) {
      const parsed = readValue(args, i, "--location-name");
      options.locationName = parsed.value;
      i += parsed.consumed;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function oneDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return String(Math.round(number * 10) / 10);
}

function integerString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return String(Math.round(number));
}

function weatherCodeToQWeather(code) {
  const number = Number(code);
  if (number === 0) {
    return { text: "Sunny", icon: "100" };
  }
  if (number === 1) {
    return { text: "Mostly Clear", icon: "101" };
  }
  if (number === 2) {
    return { text: "Partly Cloudy", icon: "103" };
  }
  if (number === 3) {
    return { text: "Cloudy", icon: "104" };
  }
  if (number === 45 || number === 48) {
    return { text: "Fog", icon: "501" };
  }
  if ((number >= 51 && number <= 67) || (number >= 80 && number <= 82)) {
    return { text: "Rain", icon: "305" };
  }
  if ((number >= 71 && number <= 77) || number === 85 || number === 86) {
    return { text: "Snow", icon: "400" };
  }
  if (number >= 95 && number <= 99) {
    return { text: "Thunderstorm", icon: "302" };
  }
  return { text: "Cloudy", icon: "104" };
}

export function mapOpenMeteoCurrent(doc) {
  const current = doc?.current;
  if (!current || typeof current !== "object") {
    throw new Error("Open-Meteo response missing current weather");
  }

  const mapped = weatherCodeToQWeather(current.weather_code);
  return {
    code: "200",
    now: {
      temp: oneDecimal(current.temperature_2m),
      humidity: integerString(current.relative_humidity_2m),
      windSpeed: oneDecimal(current.wind_speed_10m),
      precip: oneDecimal(current.precipitation),
      text: mapped.text,
      icon: mapped.icon,
      obsTime: String(current.time || ""),
    },
  };
}

function jsonResponse(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}: ${text.slice(0, 120)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function buildOpenMeteoUrl({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    timezone: "Asia/Shanghai",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function resolveLocation(searchParams, defaults) {
  const location = searchParams.get("location");
  if (location && LOCATION_COORDS.has(location)) {
    return LOCATION_COORDS.get(location);
  }
  return defaults;
}

export function createWeatherBridgeServer({
  host = DEFAULTS.host,
  port = DEFAULTS.port,
  latitude = DEFAULTS.latitude,
  longitude = DEFAULTS.longitude,
  locationName = DEFAULTS.locationName,
  fetchImpl = fetch,
  timeoutMs = 5000,
  cacheTtlMs = 5 * 60 * 1000,
} = {}) {
  const defaults = { host, port, latitude, longitude, locationName };
  const cache = new Map();

  async function refreshLocation(location, key) {
    const apiUrl = buildOpenMeteoUrl(location);
    const doc = await fetchJson(apiUrl, fetchImpl, timeoutMs);
    const body = mapOpenMeteoCurrent(doc);
    cache.set(key, {
      body,
      updatedAt: Date.now(),
      refreshPromise: null,
    });
    return body;
  }

  function startBackgroundRefresh(location, key, entry) {
    if (entry?.refreshPromise) {
      return entry.refreshPromise;
    }
    const refreshPromise = refreshLocation(location, key).catch((error) => {
      console.error("weather bridge refresh error", error);
      if (entry) {
        cache.set(key, { ...entry, refreshPromise: null });
      }
      return null;
    });
    if (entry) {
      cache.set(key, { ...entry, refreshPromise });
    }
    return refreshPromise;
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method !== "GET") {
      jsonResponse(response, 405, { ok: false, error: "method not allowed" });
      return;
    }

    if (url.pathname === "/health") {
      jsonResponse(response, 200, { ok: true, location: defaults.locationName });
      return;
    }

    if (url.pathname !== "/v1/weather/now") {
      jsonResponse(response, 404, { ok: false, error: "not found" });
      return;
    }

    try {
      const location = resolveLocation(url.searchParams, defaults);
      const key = `${location.latitude},${location.longitude}`;
      const entry = cache.get(key);
      let body = entry?.body;
      if (body && Date.now() - entry.updatedAt > cacheTtlMs) {
        startBackgroundRefresh(location, key, entry);
      }
      if (!body) {
        body = await refreshLocation(location, key);
      }
      console.log(new Date().toISOString(), url.pathname + url.search, body);
      jsonResponse(response, 200, body);
    } catch (error) {
      console.error("weather bridge error", error);
      jsonResponse(response, 502, {
        code: "500",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs();
    const server = createWeatherBridgeServer(options);
    server.listen(options.port, options.host, () => {
      console.log(`weather bridge listening on http://${options.host}:${options.port}`);
      console.log(`default location: ${options.locationName} (${options.latitude}, ${options.longitude})`);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
