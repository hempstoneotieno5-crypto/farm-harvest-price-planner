export async function getWeatherSummary(county, config) {
  if (!county || !config.openMeteoBaseUrl) {
    return null;
  }

  const url = new URL(config.openMeteoBaseUrl);
  url.searchParams.set("latitude", String(county.lat));
  url.searchParams.set("longitude", String(county.lon));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const daily = payload.daily ?? {};
    const precipitation = daily.precipitation_sum ?? [];
    const maxTemps = daily.temperature_2m_max ?? [];
    const minTemps = daily.temperature_2m_min ?? [];
    const precipitationSum = precipitation.reduce((sum, value) => sum + Number(value || 0), 0);
    const maxTemp = maxTemps.length ? Math.max(...maxTemps) : null;
    const minTemp = minTemps.length ? Math.min(...minTemps) : null;

    return { precipitationSum, maxTemp, minTemp };
  } catch {
    return null;
  }
}
