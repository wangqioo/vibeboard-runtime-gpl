import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { request as httpRequest } from "node:http";
import { createWeatherBridgeServer, mapOpenMeteoCurrent, parseArgs } from "./server.mjs";

function requestJson(server, path) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path,
      method: "GET",
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, json: JSON.parse(text), text });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function withServer(options, run) {
  const server = createWeatherBridgeServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("weather bridge args", () => {
  it("defaults to Shanghai and a LAN-listening port", () => {
    assert.deepEqual(parseArgs([]), {
      host: "0.0.0.0",
      port: 8792,
      latitude: 31.2304,
      longitude: 121.4737,
      locationName: "Shanghai",
    });
  });
});

describe("weather bridge mapping", () => {
  it("maps Open-Meteo current data to QWeather-compatible now data", () => {
    assert.deepEqual(mapOpenMeteoCurrent({
      current: {
        time: "2026-06-29T23:45",
        temperature_2m: 28.6,
        relative_humidity_2m: 72,
        precipitation: 0.2,
        weather_code: 3,
        wind_speed_10m: 6.4,
      },
    }), {
      code: "200",
      now: {
        temp: "28.6",
        humidity: "72",
        windSpeed: "6.4",
        precip: "0.2",
        text: "Cloudy",
        icon: "104",
        obsTime: "2026-06-29T23:45",
      },
    });
  });

  it("serves Shanghai real-weather-shaped data on the HoloCubic weather path", async () => {
    const calls = [];
    await withServer({
      fetchImpl: async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            current: {
              time: "2026-06-29T23:45",
              temperature_2m: 29.1,
              relative_humidity_2m: 80,
              precipitation: 0,
              weather_code: 1,
              wind_speed_10m: 5.2,
            },
          }),
        };
      },
    }, async (server) => {
      const response = await requestJson(server, "/v1/weather/now?location=101020100&unit=m");

      assert.equal(response.status, 200);
      assert.equal(response.json.code, "200");
      assert.equal(response.json.now.temp, "29.1");
      assert.equal(response.json.now.text, "Mostly Clear");
      assert.match(calls[0], /latitude=31\.2304/);
      assert.match(calls[0], /longitude=121\.4737/);
      assert.match(calls[0], /timezone=Asia%2FShanghai/);
    });
  });

  it("serves cached data immediately while refreshing stale data in the background", async () => {
    let fetchCalls = 0;
    await withServer({
      cacheTtlMs: 1,
      fetchImpl: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              current: {
                time: "2026-06-29T23:45",
                temperature_2m: 24.6,
                relative_humidity_2m: 95,
                precipitation: 0.3,
                weather_code: 95,
                wind_speed_10m: 5.8,
              },
            }),
          };
        }

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              text: async () => JSON.stringify({
                current: {
                  time: "2026-06-29T23:46",
                  temperature_2m: 25,
                  relative_humidity_2m: 90,
                  precipitation: 0,
                  weather_code: 3,
                  wind_speed_10m: 4,
                },
              }),
            });
          }, 50);
        });
      },
    }, async (server) => {
      const first = await requestJson(server, "/v1/weather/now?location=101020100&unit=m");
      assert.equal(first.status, 200);
      assert.equal(first.json.now.temp, "24.6");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const started = Date.now();
      const second = await requestJson(server, "/v1/weather/now?location=101020100&unit=m");

      assert.equal(second.status, 200);
      assert.equal(second.json.now.temp, "24.6");
      assert.ok(Date.now() - started < 40, "cached weather response should not wait for refresh");
      assert.equal(fetchCalls, 2);
    });
  });
});
