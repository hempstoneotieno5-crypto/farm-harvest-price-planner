import fs from "node:fs";
import path from "node:path";

const DAY = 24 * 60 * 60 * 1000;
const dataDir = path.join(process.cwd(), "data");
const counties = JSON.parse(fs.readFileSync(path.join(dataDir, "counties.json"), "utf8"));
const crops = JSON.parse(fs.readFileSync(path.join(dataDir, "crops.json"), "utf8"));
const marketPrices = JSON.parse(fs.readFileSync(path.join(dataDir, "market-prices.json"), "utf8"));

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sameBand(left, right) {
  return left === right ? 1 : 0;
}

export function getDatasets() {
  return { counties, crops };
}

export function getCounty(countyId) {
  return counties.find((item) => item.id === countyId);
}

export function getCrop(cropId) {
  return crops.find((item) => item.id === cropId);
}

function getMarketSeries(countyId, cropId) {
  const local = marketPrices.find((item) => item.countyId === countyId && item.cropId === cropId);
  if (local) {
    return local.prices;
  }

  const fallback = marketPrices.find((item) => item.cropId === cropId);
  return fallback ? fallback.prices : [];
}

function buildPriceForecast(prices, marketAccessScore, storageRisk) {
  if (prices.length === 0) {
    return [];
  }

  const latest = prices[prices.length - 1].averagePrice;
  const previous = prices[prices.length - 2]?.averagePrice ?? latest * 0.96;
  const trend = latest - previous;
  const marketBoost = 1 + (marketAccessScore - 0.7) * 0.12;
  const storagePenalty = storageRisk === "high" ? 0.96 : storageRisk === "medium" ? 0.985 : 1.01;

  return [-1, 0, 1, 2, 3, 4].map((weekOffset, index) => {
    const projected = Math.round(
      (latest + trend * (index * 0.55)) * marketBoost * Math.pow(storagePenalty, Math.max(0, weekOffset))
    );
    return {
      weekOffset,
      label: `W${weekOffset >= 0 ? "+" : ""}${weekOffset}`,
      price: projected
    };
  });
}

function buildWeatherFactor(county, crop, weatherSummary) {
  const rainfallMatch = sameBand(crop.rainfallNeed, county.rainfallBand);
  const temperatureMatch = crop.temperaturePreference === county.temperatureBand ? 1 : 0;
  const baseline = 0.98 + rainfallMatch * 0.03 + temperatureMatch * 0.02;

  if (!weatherSummary) {
    return {
      maturityFactor: baseline,
      readinessScore: 63,
      riskLabel: "Moderate",
      narrative: `Live weather is unavailable, so the system is using county climate patterns for ${county.name}.`
    };
  }

  const rainfall = weatherSummary.precipitationSum ?? 0;
  const maxTemp = weatherSummary.maxTemp ?? 26;
  const minTemp = weatherSummary.minTemp ?? 15;
  const rainAdjustment = rainfall >= 30 ? 1.03 : rainfall <= 10 ? 0.96 : 1;
  const tempAdjustment = maxTemp > 30 ? 0.97 : minTemp < 10 ? 0.96 : 1.02;
  const readinessScore = clamp(Math.round(58 + rainfall * 0.5 + (28 - Math.abs(27 - maxTemp)) * 1.8), 42, 92);
  const riskLabel = readinessScore >= 76 ? "Low" : readinessScore >= 60 ? "Moderate" : "High";

  return {
    maturityFactor: baseline * rainAdjustment * tempAdjustment,
    readinessScore,
    riskLabel,
    narrative: `Weather for ${county.name} shows ${rainfall.toFixed(1)}mm expected rainfall over 7 days, temperatures between ${Math.round(minTemp)}°C and ${Math.round(maxTemp)}°C, and a ${riskLabel.toLowerCase()} field risk outlook.`
  };
}

export function buildForecast({ planting, weatherSummary }) {
  const county = getCounty(planting.countyId);
  const crop = getCrop(planting.cropId);

  if (!county || !crop) {
    throw new Error("Invalid crop or county selection.");
  }

  const plantedOn = new Date(planting.plantingDate);
  const weatherFactor = buildWeatherFactor(county, crop, weatherSummary);
  const maturityDays = Math.round(crop.maturityDays / weatherFactor.maturityFactor);
  const harvestStart = addDays(plantedOn, maturityDays - Math.ceil(crop.harvestWindowDays / 2));
  const harvestEnd = addDays(plantedOn, maturityDays + Math.floor(crop.harvestWindowDays / 2));
  const priceSeries = buildPriceForecast(
    getMarketSeries(county.id, crop.id),
    county.marketAccessScore,
    crop.storageLossRisk
  );
  const bestPoint = priceSeries.reduce((best, point) => (point.price > best.price ? point : best), priceSeries[0]);
  const estimatedYield = Math.round(crop.yieldPerAcre * Number(planting.farmSizeAcres || 1) * weatherFactor.maturityFactor);
  const expectedRevenue = bestPoint ? estimatedYield * bestPoint.price : 0;
  const bestSellWeek = bestPoint?.weekOffset ?? 0;
  const recommendation =
    bestSellWeek > 1
      ? `Store part of the harvest for about ${bestSellWeek} weeks after harvest if storage is safe. Prices are expected to improve after the first selling week.`
      : "Sell in the harvest week or shortly after harvest because later holding is not likely to add much value.";

  return {
    county,
    crop,
    harvestWindow: {
      start: harvestStart.toISOString(),
      end: harvestEnd.toISOString()
    },
    maturityDays,
    readinessScore: weatherFactor.readinessScore,
    riskLabel: weatherFactor.riskLabel,
    weatherNarrative: weatherFactor.narrative,
    priceSeries,
    bestSellWeek,
    estimatedYield,
    unit: crop.unit,
    expectedRevenue,
    recommendation,
    marketHistory: getMarketSeries(county.id, crop.id)
  };
}
