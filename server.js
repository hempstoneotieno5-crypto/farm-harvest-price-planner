import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildForecast, getCounty, getCrop, getDatasets } from "./src/forecast-service.js";
import { readCollection, writeCollection } from "./src/storage.js";
import { getWeatherSummary } from "./src/weather-service.js";
import { sendSmsAlert } from "./src/sms-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

const config = {
  sessionSecret: process.env.SESSION_SECRET || "dev-secret",
  openMeteoBaseUrl: process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
  africasTalkingUsername: process.env.AFRICASTALKING_USERNAME || "",
  africasTalkingApiKey: process.env.AFRICASTALKING_API_KEY || "",
  africasTalkingSenderId: process.env.AFRICASTALKING_SENDER_ID || ""
};

app.use(express.json());
app.use(express.static(__dirname));

function sanitizeFarmer(farmer) {
  const { passwordHash, passwordSalt, ...safeFarmer } = farmer;
  return safeFarmer;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function createSession(farmerId) {
  const sessions = readCollection("sessions.json");
  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    token,
    farmerId,
    createdAt: new Date().toISOString()
  };
  sessions.push(session);
  writeCollection("sessions.json", sessions);
  return token;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const sessions = readCollection("sessions.json");
  const session = sessions.find((item) => item.token === token);
  if (!session) {
    return res.status(401).json({ error: "Invalid session." });
  }

  const farmers = readCollection("farmers.json");
  const farmer = farmers.find((item) => item.id === session.farmerId);
  if (!farmer) {
    return res.status(401).json({ error: "Farmer account not found." });
  }

  req.farmer = farmer;
  req.token = token;
  next();
}

function buildSmsMessage(farmer, planting, forecast) {
  const start = new Date(forecast.harvestWindow.start).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
  const end = new Date(forecast.harvestWindow.end).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
  return `${farmer.name}, ${forecast.crop.name} harvest window is ${start}-${end}. Best sell week: W+${Math.max(forecast.bestSellWeek, 0)}. Risk: ${forecast.riskLabel}.`;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "farm-harvest-price-planner-api" });
});

app.get("/api/datasets", (_req, res) => {
  res.json(getDatasets());
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, phoneNumber, countyId } = req.body;
  if (!name || !email || !password || !countyId) {
    return res.status(400).json({ error: "Name, email, password, and county are required." });
  }

  const farmers = readCollection("farmers.json");
  const existing = farmers.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const { hash, salt } = hashPassword(password);
  const farmer = {
    id: crypto.randomUUID(),
    name,
    email: String(email).toLowerCase(),
    phoneNumber: phoneNumber || "",
    countyId,
    createdAt: new Date().toISOString(),
    passwordHash: hash,
    passwordSalt: salt
  };
  farmers.push(farmer);
  writeCollection("farmers.json", farmers);

  const token = createSession(farmer.id);
  res.status(201).json({ token, farmer: sanitizeFarmer(farmer) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const farmers = readCollection("farmers.json");
  const farmer = farmers.find((item) => item.email === String(email).toLowerCase());

  if (!farmer) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const { hash } = hashPassword(password, farmer.passwordSalt);
  if (hash !== farmer.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = createSession(farmer.id);
  res.json({ token, farmer: sanitizeFarmer(farmer) });
});

app.get("/api/me/profile", authRequired, (req, res) => {
  res.json({ farmer: sanitizeFarmer(req.farmer) });
});

app.put("/api/me/profile", authRequired, (req, res) => {
  const farmers = readCollection("farmers.json");
  const index = farmers.findIndex((item) => item.id === req.farmer.id);
  if (index === -1) {
    return res.status(404).json({ error: "Farmer account not found." });
  }

  const updated = {
    ...farmers[index],
    name: req.body.name || farmers[index].name,
    phoneNumber: req.body.phoneNumber ?? farmers[index].phoneNumber,
    countyId: req.body.countyId || farmers[index].countyId
  };
  farmers[index] = updated;
  writeCollection("farmers.json", farmers);
  res.json({ farmer: sanitizeFarmer(updated) });
});

app.get("/api/me/plantings", authRequired, (req, res) => {
  const plantings = readCollection("plantings.json")
    .filter((item) => item.farmerId === req.farmer.id)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  res.json({ plantings });
});

app.post("/api/me/plantings", authRequired, async (req, res) => {
  const { cropId, countyId, plantingDate, farmSizeAcres, notes } = req.body;
  if (!cropId || !countyId || !plantingDate || !farmSizeAcres) {
    return res.status(400).json({ error: "Crop, county, planting date, and farm size are required." });
  }

  const planting = {
    id: crypto.randomUUID(),
    farmerId: req.farmer.id,
    cropId,
    countyId,
    plantingDate,
    farmSizeAcres: Number(farmSizeAcres),
    notes: notes || "",
    createdAt: new Date().toISOString()
  };

  const plantings = readCollection("plantings.json");
  plantings.push(planting);
  writeCollection("plantings.json", plantings);

  const weatherSummary = await getWeatherSummary(getCounty(countyId), config);
  const forecast = buildForecast({ planting, weatherSummary });
  res.status(201).json({ planting, forecast });
});

app.get("/api/me/dashboard", authRequired, async (req, res) => {
  const plantings = readCollection("plantings.json")
    .filter((item) => item.farmerId === req.farmer.id)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  const latestPlanting = plantings[0] || null;
  let forecast = null;
  if (latestPlanting) {
    const weatherSummary = await getWeatherSummary(getCounty(latestPlanting.countyId), config);
    forecast = buildForecast({ planting: latestPlanting, weatherSummary });
  }

  res.json({
    farmer: sanitizeFarmer(req.farmer),
    latestPlanting,
    forecast
  });
});

app.post("/api/forecast", authRequired, async (req, res) => {
  const planting = {
    id: crypto.randomUUID(),
    farmerId: req.farmer.id,
    cropId: req.body.cropId,
    countyId: req.body.countyId,
    plantingDate: req.body.plantingDate,
    farmSizeAcres: Number(req.body.farmSizeAcres),
    notes: req.body.notes || "",
    createdAt: new Date().toISOString()
  };
  const county = getCounty(planting.countyId);
  const crop = getCrop(planting.cropId);
  if (!county || !crop || !planting.plantingDate || !planting.farmSizeAcres) {
    return res.status(400).json({ error: "Valid crop, county, planting date, and farm size are required." });
  }

  const weatherSummary = await getWeatherSummary(county, config);
  const forecast = buildForecast({ planting, weatherSummary });
  res.json({ planting, forecast });
});

app.post("/api/alerts/sms", authRequired, async (req, res) => {
  const plantings = readCollection("plantings.json");
  const planting = plantings.find((item) => item.id === req.body.plantingId && item.farmerId === req.farmer.id);

  if (!planting) {
    return res.status(404).json({ error: "Planting record not found." });
  }

  const weatherSummary = await getWeatherSummary(getCounty(planting.countyId), config);
  const forecast = buildForecast({ planting, weatherSummary });
  const result = await sendSmsAlert({
    message: buildSmsMessage(req.farmer, planting, forecast),
    phoneNumber: req.farmer.phoneNumber,
    config
  });

  res.json({ result });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Farm Harvest & Price Planner running on port ${port}`);
});
