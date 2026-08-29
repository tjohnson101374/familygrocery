// Vercel serverless function — CommonJS. There's no package.json in this
// repo (no build step, per project convention), so plain .js here runs as
// CommonJS by Node's default rather than the ES modules the rest of the
// app uses in the browser.
//
// Current conditions come from the family's own Weather Underground
// personal weather station via IBM/The Weather Company's PWS API. Needs
// a free API key from the Wunderground account that owns the station
// (Member Settings > API Keys), set as the WUNDERGROUND_API_KEY env var
// in Vercel so it's never exposed to the browser.
//
// The PWS key doesn't include a forecast product, so the multi-day
// forecast comes from the National Weather Service's free public API
// instead, looked up by the station's own lat/lon (no key needed, but
// NWS requires an identifying User-Agent).

const NWS_HEADERS = {
  "User-Agent": "family-grocery-kiosk (personal home dashboard)",
  "Accept":     "application/geo+json",
};

async function getForecast(lat, lon) {
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: NWS_HEADERS });
  if (!pointsRes.ok) return [];

  const points      = await pointsRes.json();
  const forecastUrl = points.properties && points.properties.forecast;
  if (!forecastUrl) return [];

  const forecastRes = await fetch(forecastUrl, { headers: NWS_HEADERS });
  if (!forecastRes.ok) return [];

  const forecastData = await forecastRes.json();
  const periods = (forecastData.properties && forecastData.properties.periods) || [];

  return periods
    .filter(p => p.isDaytime)
    .slice(0, 5)
    .map(p => ({
      name:          p.name,
      tempF:         p.temperature,
      shortForecast: p.shortForecast,
      icon:          p.icon,
    }));
}

module.exports = async function handler(req, res) {
  const apiKey    = process.env.WUNDERGROUND_API_KEY;
  const stationId = process.env.WUNDERGROUND_STATION_ID || "KCALAKES167";

  if (!apiKey) {
    res.status(500).json({ error: "WUNDERGROUND_API_KEY is not configured" });
    return;
  }

  try {
    const url = `https://api.weather.com/v2/pws/observations/current?stationId=${encodeURIComponent(stationId)}&format=json&units=e&apiKey=${apiKey}`;
    const upstream = await fetch(url);

    if (!upstream.ok) {
      res.status(502).json({ error: `Station lookup failed (${upstream.status})` });
      return;
    }

    const data = await upstream.json();
    const obs  = data.observations && data.observations[0];

    if (!obs) {
      res.status(502).json({ error: "No observation returned for station" });
      return;
    }

    let forecast = [];
    if (obs.lat != null && obs.lon != null) {
      try { forecast = await getForecast(obs.lat, obs.lon); } catch { forecast = []; }
    }

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    res.status(200).json({
      stationId:    obs.stationID,
      obsTimeLocal: obs.obsTimeLocal,
      tempF:        obs.imperial.temp,
      feelsLikeF:   obs.imperial.heatIndex ?? obs.imperial.windChill ?? obs.imperial.temp,
      humidity:     obs.humidity,
      windMph:      obs.imperial.windSpeed,
      windGustMph:  obs.imperial.windGust,
      forecast,
    });
  } catch (err) {
    res.status(500).json({ error: "Weather lookup failed" });
  }
};
