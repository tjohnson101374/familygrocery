// Vercel serverless function — CommonJS. There's no package.json in this
// repo (no build step, per project convention), so plain .js here runs as
// CommonJS by Node's default rather than the ES modules the rest of the
// app uses in the browser.
//
// Reads current conditions from the family's own Weather Underground
// personal weather station via IBM/The Weather Company's PWS API. Needs
// a free API key from the Wunderground account that owns the station
// (Member Settings > API Keys), set as the WUNDERGROUND_API_KEY env var
// in Vercel so it's never exposed to the browser.

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

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({
      stationId:    obs.stationID,
      obsTimeLocal: obs.obsTimeLocal,
      tempF:        obs.imperial.temp,
      feelsLikeF:   obs.imperial.heatIndex ?? obs.imperial.windChill ?? obs.imperial.temp,
      humidity:     obs.humidity,
      windMph:      obs.imperial.windSpeed,
      windGustMph:  obs.imperial.windGust,
    });
  } catch (err) {
    res.status(500).json({ error: "Weather lookup failed" });
  }
};
