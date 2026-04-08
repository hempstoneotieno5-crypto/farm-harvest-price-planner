const tokenKey = "farmPlannerToken";

const api = {
  token: localStorage.getItem(tokenKey) || "",
  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }
    return payload;
  }
};

const state = { counties: [], crops: [], farmer: null, plantings: [], forecast: null };

const el = {
  authStatus: document.querySelector("#authStatus"),
  authMessage: document.querySelector("#authMessage"),
  registerForm: document.querySelector("#registerForm"),
  loginForm: document.querySelector("#loginForm"),
  logoutButton: document.querySelector("#logoutButton"),
  profileForm: document.querySelector("#profileForm"),
  plantingForm: document.querySelector("#plantingForm"),
  smsButton: document.querySelector("#sendSmsButton"),
  cropSelects: document.querySelectorAll("[data-crops]"),
  countySelects: document.querySelectorAll("[data-counties]"),
  plantingRows: document.querySelector("#plantingTableBody"),
  latestRecord: document.querySelector("#latestRecord"),
  farmerName: document.querySelector("#farmerName"),
  farmerEmail: document.querySelector("#farmerEmail"),
  farmerPhone: document.querySelector("#farmerPhone"),
  farmerCounty: document.querySelector("#farmerCounty"),
  harvestWindow: document.querySelector("#harvestWindow"),
  sellWindow: document.querySelector("#sellWindow"),
  recommendation: document.querySelector("#recommendationText"),
  yield: document.querySelector("#yieldProjection"),
  revenue: document.querySelector("#revenueProjection"),
  weatherScore: document.querySelector("#weatherScore"),
  weatherNarrative: document.querySelector("#weatherNarrative"),
  smsPreview: document.querySelector("#smsPreview"),
  heroHarvest: document.querySelector("#hero-harvest-window"),
  heroPrice: document.querySelector("#hero-best-price"),
  heroRisk: document.querySelector("#hero-risk-level"),
  heroSms: document.querySelector("#hero-sms-state"),
  weatherPills: document.querySelector("#weatherPills")
};

function msg(text, isError = false) {
  el.authMessage.textContent = text;
  el.authMessage.dataset.error = isError ? "true" : "false";
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function prettyDate(value) {
  return new Intl.DateTimeFormat("en-KE", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function fillSelects(items, nodes, placeholder) {
  const html = [`<option value="">${placeholder}</option>`]
    .concat(items.map((item) => `<option value="${item.id}">${item.name}</option>`))
    .join("");
  nodes.forEach((node) => {
    node.innerHTML = html;
  });
}

function drawChart(series) {
  const svg = document.querySelector("#priceChart");
  if (!series?.length) {
    svg.innerHTML = "";
    return;
  }

  const width = 720;
  const height = 280;
  const left = 54;
  const right = 24;
  const top = 20;
  const bottom = 40;
  const maxPrice = Math.max(...series.map((point) => point.price));
  const minPrice = Math.min(...series.map((point) => point.price));
  const step = (width - left - right) / Math.max(series.length - 1, 1);
  const range = Math.max(maxPrice - minPrice, 1);
  const points = series.map((point, index) => {
    const x = left + index * step;
    const y = height - bottom - ((point.price - minPrice) / range) * (height - top - bottom);
    return { ...point, x, y };
  });
  const last = points[points.length - 1];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${path} L ${last.x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;
  const peak = points.reduce((best, point) => (point.price > best.price ? point : best), points[0]);

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(49, 92, 57, 0.34)"></stop>
        <stop offset="100%" stop-color="rgba(49, 92, 57, 0.02)"></stop>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#chartFill)"></path>
    <path d="${path}" fill="none" stroke="#315c39" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="#315c39"></circle>`).join("")}
    <circle cx="${peak.x}" cy="${peak.y}" r="8" fill="#e08a2e" stroke="#fff8ef" stroke-width="3"></circle>
    ${points.map((point) => `<text x="${point.x}" y="${height - 14}" text-anchor="middle" fill="#6a7b67" font-size="12">${point.label}</text>`).join("")}
  `;
}

function renderProfile() {
  if (!state.farmer) {
    el.authStatus.textContent = "Not signed in";
    el.profileForm.reset();
    return;
  }
  el.authStatus.textContent = `Signed in as ${state.farmer.name}`;
  el.farmerName.value = state.farmer.name || "";
  el.farmerEmail.value = state.farmer.email || "";
  el.farmerPhone.value = state.farmer.phoneNumber || "";
  el.farmerCounty.value = state.farmer.countyId || "";
}

function renderPlantings() {
  if (!state.plantings.length) {
    el.plantingRows.innerHTML = `<tr><td colspan="5">No planting records yet.</td></tr>`;
    el.latestRecord.textContent = "No planting record saved yet.";
    return;
  }
  el.plantingRows.innerHTML = state.plantings.map((item) => {
    const crop = state.crops.find((entry) => entry.id === item.cropId)?.name || item.cropId;
    const county = state.counties.find((entry) => entry.id === item.countyId)?.name || item.countyId;
    return `<tr><td>${crop}</td><td>${county}</td><td>${prettyDate(item.plantingDate)}</td><td>${item.farmSizeAcres} acres</td><td>${item.notes || "-"}</td></tr>`;
  }).join("");
  const latest = state.plantings[0];
  const crop = state.crops.find((entry) => entry.id === latest.cropId)?.name || latest.cropId;
  const county = state.counties.find((entry) => entry.id === latest.countyId)?.name || latest.countyId;
  el.latestRecord.textContent = `${crop} in ${county}, planted on ${prettyDate(latest.plantingDate)}.`;
}

function renderForecast() {
  if (!state.forecast) {
    el.harvestWindow.textContent = "No forecast yet";
    el.sellWindow.textContent = "-";
    el.recommendation.textContent = "Save a planting record to generate a real forecast.";
    el.yield.textContent = "-";
    el.revenue.textContent = "-";
    el.weatherScore.textContent = "--";
    el.weatherNarrative.textContent = "Weather details will appear here after a forecast is generated.";
    el.smsPreview.textContent = "SMS preview will appear here after login and forecast generation.";
    el.heroHarvest.textContent = "Waiting";
    el.heroPrice.textContent = "KES 0";
    el.heroRisk.textContent = "Unknown";
    el.heroSms.textContent = api.token ? "Ready" : "Sign in";
    el.weatherPills.innerHTML = "";
    drawChart([]);
    return;
  }

  const forecast = state.forecast;
  const harvestStart = prettyDate(forecast.harvestWindow.start);
  const harvestEnd = prettyDate(forecast.harvestWindow.end);
  const bestWeek = forecast.bestSellWeek > 0 ? `Week ${forecast.bestSellWeek} after harvest` : "Harvest week";
  el.harvestWindow.textContent = `${harvestStart} - ${harvestEnd}`;
  el.sellWindow.textContent = bestWeek;
  el.recommendation.textContent = forecast.recommendation;
  el.yield.textContent = `${forecast.estimatedYield} ${forecast.unit}`;
  el.revenue.textContent = money(forecast.expectedRevenue);
  el.weatherScore.textContent = `${forecast.readinessScore}%`;
  el.weatherNarrative.textContent = forecast.weatherNarrative;
  el.smsPreview.textContent = `${state.farmer?.name || "Farmer"}, ${forecast.crop.name} harvest is expected between ${harvestStart} and ${harvestEnd}. Best selling time: ${bestWeek}.`;
  el.heroHarvest.textContent = `${forecast.maturityDays} days`;
  el.heroPrice.textContent = money(Math.max(...forecast.priceSeries.map((point) => point.price)));
  el.heroRisk.textContent = forecast.riskLabel;
  el.heroSms.textContent = state.farmer?.phoneNumber ? "Ready" : "Add phone";
  document.documentElement.style.setProperty("--meter-angle", `${forecast.readinessScore}%`);
  el.weatherPills.innerHTML = [`${forecast.county.name} county`, `${forecast.crop.name} crop`, `${forecast.riskLabel} weather risk`].map((item) => `<span>${item}</span>`).join("");
  drawChart(forecast.priceSeries);
}

function defaultPlantingDate() {
  const date = new Date();
  date.setDate(date.getDate() - 21);
  return date.toISOString().slice(0, 10);
}

async function loadDatasets() {
  const payload = await api.request("/api/datasets");
  state.counties = payload.counties;
  state.crops = payload.crops;
  fillSelects(state.crops, el.cropSelects, "Select crop");
  fillSelects(state.counties, el.countySelects, "Select county");
}

async function loadDashboard() {
  if (!api.token) {
    state.farmer = null;
    state.plantings = [];
    state.forecast = null;
    renderProfile();
    renderPlantings();
    renderForecast();
    return;
  }

  const [profile, plantings, dashboard] = await Promise.all([
    api.request("/api/me/profile"),
    api.request("/api/me/plantings"),
    api.request("/api/me/dashboard")
  ]);
  state.farmer = profile.farmer;
  state.plantings = plantings.plantings;
  state.forecast = dashboard.forecast;
  renderProfile();
  renderPlantings();
  renderForecast();
}

el.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#registerName").value,
        email: document.querySelector("#registerEmail").value,
        password: document.querySelector("#registerPassword").value,
        phoneNumber: document.querySelector("#registerPhone").value,
        countyId: document.querySelector("#registerCounty").value
      })
    });
    api.token = payload.token;
    localStorage.setItem(tokenKey, api.token);
    msg("Account created and signed in.");
    await loadDashboard();
  } catch (error) {
    msg(error.message, true);
  }
});

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.querySelector("#loginEmail").value,
        password: document.querySelector("#loginPassword").value
      })
    });
    api.token = payload.token;
    localStorage.setItem(tokenKey, api.token);
    msg("Signed in successfully.");
    await loadDashboard();
  } catch (error) {
    msg(error.message, true);
  }
});

el.logoutButton.addEventListener("click", () => {
  api.token = "";
  localStorage.removeItem(tokenKey);
  msg("Signed out.");
  loadDashboard();
});

el.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api.request("/api/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: el.farmerName.value,
        phoneNumber: el.farmerPhone.value,
        countyId: el.farmerCounty.value
      })
    });
    msg("Profile updated.");
    await loadDashboard();
  } catch (error) {
    msg(error.message, true);
  }
});

el.plantingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api.request("/api/me/plantings", {
      method: "POST",
      body: JSON.stringify({
        cropId: document.querySelector("#plantingCrop").value,
        countyId: document.querySelector("#plantingCounty").value,
        plantingDate: document.querySelector("#plantingDate").value,
        farmSizeAcres: document.querySelector("#farmSize").value,
        notes: document.querySelector("#plantingNotes").value
      })
    });
    msg("Planting record saved.");
    el.plantingForm.reset();
    await loadDashboard();
  } catch (error) {
    msg(error.message, true);
  }
});

el.smsButton.addEventListener("click", async () => {
  if (!state.plantings.length) {
    msg("Save a planting record first.", true);
    return;
  }

  try {
    const payload = await api.request("/api/alerts/sms", {
      method: "POST",
      body: JSON.stringify({ plantingId: state.plantings[0].id })
    });
    msg(payload.result.delivered ? "SMS alert sent successfully." : `SMS saved in ${payload.result.mode} mode.`);
  } catch (error) {
    msg(error.message, true);
  }
});

document.querySelector("#plantingDate").value = defaultPlantingDate();
loadDatasets().then(loadDashboard).catch((error) => msg(error.message, true));
