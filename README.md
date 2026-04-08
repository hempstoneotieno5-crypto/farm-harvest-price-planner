# Farm Harvest & Price Planner

Farm Harvest & Price Planner is now a Node.js full-stack project with authentication, farmer profiles, planting history, backend forecasting, Kenya-focused crop and county datasets, weather integration, and Africa's Talking SMS support.

## What is included

- Farmer registration and login
- Farmer profile management
- Historical planting records
- Backend forecast engine moved out of the browser
- Kenya county, crop, and market price datasets in `data/`
- Live weather lookup through Open-Meteo
- SMS alert integration hook through Africa's Talking
- Responsive frontend served by the backend

## Project structure

```text
.
|-- data/
|   |-- counties.json
|   |-- crops.json
|   `-- market-prices.json
|-- scripts/
|   |-- client.js
|   |-- app.js
|   |-- data.js
|   `-- forecast.js
|-- src/
|   |-- forecast-service.js
|   |-- sms-service.js
|   |-- storage.js
|   `-- weather-service.js
|-- storage/
|   |-- farmers.json
|   |-- plantings.json
|   |-- sessions.json
|   `-- sms-outbox.json
|-- styles/
|   `-- main.css
|-- .env.example
|-- package.json
|-- server.js
`-- index.html
```

The active frontend entry is `scripts/client.js`. Older browser-only files remain in `scripts/` as legacy references from the first static version.

## Setup

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Update the Africa's Talking credentials in `.env` if you want real SMS delivery.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Environment variables

- `PORT`: Server port
- `SESSION_SECRET`: Session secret for local auth flow
- `OPEN_METEO_BASE_URL`: Weather API base URL
- `AFRICASTALKING_USERNAME`: Africa's Talking username
- `AFRICASTALKING_API_KEY`: Africa's Talking API key
- `AFRICASTALKING_SENDER_ID`: Optional sender ID

## Notes

- If Africa's Talking credentials are missing, SMS messages are saved in `storage/sms-outbox.json` as preview/fallback records.
- If live weather is unavailable, the forecast falls back to county climate assumptions.
- Farmer data is stored in JSON files for simplicity. For production, move this to PostgreSQL or MySQL.

## Deployment

This project is no longer a GitHub Pages-only site because it now includes a backend. Deploy it on platforms that support Node.js apps, such as Render, Railway, or Fly.io.
