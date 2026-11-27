import { useEffect, useState } from "react";
import locations from "./weather-locations.json";
import "./weather.css";

type Reading = { time: string; interval: number; temperature: number | null; humidity: number | null; rain: number | null; wind: number | null };
const cache = new Map<string, { saved: number; reading: Reading }>();
const TTL = 10 * 60 * 1000;
const cities = ["New Delhi", "Mumbai", "Bengaluru", "Kolkata"];
const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function LiveWeather({ location, compact = false }: { location?: string; compact?: boolean }) {
  const [city, setCity] = useState("New Delhi");
  const selected = location || city;
  const point = (locations as Record<string, (string | number)[]>)[selected];
  const key = point ? String(point[1]) + "," + String(point[2]) : "";
  const [state, setState] = useState<{ key: string; reading?: Reading; loading: boolean; error?: string }>({ key: "", loading: true });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!key) { setState({ key, loading: false, error: "No weather location configured." }); return; }
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const stored = cache.get(key);
    if (stored && Date.now() - stored.saved < TTL && refresh === 0) {
      setState({ key, reading: stored.reading, loading: false });
      return;
    }
    setState({ key, loading: true });
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    const [latitude, longitude] = key.split(",");
    const params = new URLSearchParams({ latitude, longitude, current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m", timezone: "Asia/Kolkata", timeformat: "iso8601", temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm" });
    fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 429 ? "Weather request limit reached. Please retry later." : "Weather service unavailable. Please retry.");
        const json = await response.json();
        const current = json.current;
        if (!current || typeof current.time !== "string" || !Number.isFinite(current.interval)) throw new Error("Weather service returned an incomplete response.");
        const reading: Reading = { time: current.time, interval: current.interval, temperature: numberOrNull(current.temperature_2m), humidity: numberOrNull(current.relative_humidity_2m), rain: numberOrNull(current.precipitation), wind: numberOrNull(current.wind_speed_10m) };
        if (!active) return;
        cache.set(key, { saved: Date.now(), reading });
        setState({ key, reading, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ key, loading: false, error: timedOut ? "Weather request timed out. Please retry." : error instanceof TypeError ? "Could not connect. Check your internet connection and retry." : error instanceof Error ? error.message : "Weather unavailable." });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [key, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), TTL);
    return () => window.clearInterval(timer);
  }, []);
  const current = state.key === key ? state.reading : undefined;
  const loading = state.key !== key || state.loading;
  const show = (value: number | null | undefined, unit: string) => value == null ? "Unavailable" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }) + unit;
  return <section className={"live-weather " + (compact ? "weather-compact" : "card")} aria-label="Current weather">
    <header><div><strong>Current weather · {point?.[0] ?? selected}</strong><p>Representative city reading; not a state or national average.</p></div>
      {!location && <select aria-label="Weather city" value={city} onChange={event => setCity(event.target.value)}>{cities.map(name => <option key={name}>{name}</option>)}</select>}
      <button type="button" className="ghost-button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Loading…" : "Refresh"}</button>
    </header>
    <div role="status" aria-live="polite">{loading && <p>Fetching current weather…</p>}{!loading && state.error && <p className="weather-error">{state.error}</p>}</div>
    {current && <><div className="weather-values">
      <div><span>Temperature</span><strong>{show(current.temperature, "°C")}</strong></div>
      <div><span>Relative humidity</span><strong>{show(current.humidity, "%")}</strong></div>
      <div><span>Precipitation · previous {current.interval / 60} min</span><strong>{show(current.rain, " mm")}</strong></div>
      <div><span>Wind at 10 m</span><strong>{show(current.wind, " km/h")}</strong></div>
    </div><p className="weather-note">Valid at {current.time.replace("T", " ")} IST · refreshes every 10 minutes</p></>}
    <p className="weather-note">Source: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · current model estimates, not station observations.</p>
  </section>;
}
