# WindScope UK — Day-Ahead Wind Intelligence

WindScope UK is a web-based dashboard that compares Great Britain’s actual wind generation with day-ahead wind generation forecasts for January 2026. It helps users evaluate forecast accuracy, identify forecast bias, and inspect hourly differences using historical electricity-system data.

## Features

- **Actual vs. forecast:** Compare hourly wind generation with forecast values.
- **Forecast accuracy metrics:** Calculate Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), forecast bias, and Weighted Absolute Percentage Error (WAPE).
- **Coverage analysis:** View eligible forecast intervals, matched intervals, and missing observations.
- **Forecast selection:** Select the latest forecast publication available before the configured cutoff on the previous day.
- **Interactive dashboard:** Explore results using charts, summary metrics, and a detailed hourly table.
- **CSV export:** Export analysis records for further examination.
- **Configurable analysis:** Choose a date range within January 2026 and adjust the forecast publication cutoff.

## Technology Stack

**Frontend**
- React
- Vite
- Tailwind CSS
- Recharts
- Lucide React

**Backend**
- Python
- FastAPI
- Pandas
- Requests
- Uvicorn

**Deployment and development**
- Docker
- Docker Compose
- Nginx
- Git and GitHub
- Vercel (frontend deployment)
- Render (backend deployment)

## Data Source

WindScope UK uses the Elexon BMRS API:

- **FUELHH:** Actual half-hourly electricity generation by fuel type, filtered to wind.
- **WINDFOR:** Wind generation forecast data, including delivery time, publication time, and forecast generation.

API base URL: https://data.elexon.co.uk/bmrs/api/v1/

The application converts actual half-hourly generation into hourly averages before comparing it with forecasts.

## Analysis Methodology

1. Retrieve actual wind generation and forecast data from Elexon BMRS.
2. Convert timestamps to UTC and prepare hourly delivery intervals.
3. For each delivery interval, select the latest eligible forecast published at or before the configured cutoff on the previous day.
4. Match eligible forecasts with actual generation for the same delivery interval.
5. Calculate forecast errors and summary metrics.

### Metrics

- **MAE:** Average absolute difference between forecast and actual generation.
- **RMSE:** Square root of the mean squared forecast error.
- **Bias:** Average forecast minus actual generation. A positive value indicates overforecasting.
- **WAPE:** Total absolute error divided by total actual generation, expressed as a percentage.

**Forecast error = Forecast generation − Actual generation**

The default cutoff is 16:00 UTC. This is a configurable analysis assumption, not a claim about an official market deadline.

## Project Structure

```text
windscope/
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.jsx
│   ├── public/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── package-lock.json
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Run Locally

### Prerequisites

- Python 3.11 or later
- Node.js 22 or compatible version
- npm
- Git

### 1. Start the backend

Open a terminal in the project root:

```powershell
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Start the API:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health endpoint:

http://127.0.0.1:8000/api/health

Interactive API documentation:

http://127.0.0.1:8000/docs

### 2. Start the frontend

Open a second terminal:

```powershell
cd S:\windscope\frontend
npm install --ignore-scripts
npm run dev
```

Open the local Vite URL shown in the terminal, usually:

http://localhost:5173

The frontend must be configured to use the local backend API when running outside Docker.

## Run with Docker

Ensure Docker Desktop is running, then open a terminal in the project root:

```powershell
cd S:\windscope
docker compose up --build
```

Open the dashboard:

http://localhost:3000

Check the API through the frontend proxy:

http://localhost:3000/api/health

Stop the containers with `Ctrl+C`, then run:

```powershell
docker compose down
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Checks whether the backend is running |
| `GET /api/analysis` | Returns forecast comparison data and accuracy metrics |

Example analysis request:

```text
/api/analysis?start_date=2026-01-01&end_date=2026-01-31&cutoff_time=16:00:00
```

The analysis endpoint restricts the selected dates to January 2026.
## Deployment

- **Live Dashboard:** https://winduk.vercel.app
- **Backend API:** https://wind-analytics-clwt.onrender.com

### Frontend Deployment
The React frontend is deployed on Vercel.

The frontend communicates with the deployed FastAPI backend using the `VITE_API_URL` environment variable.

### Backend Deployment
The FastAPI backend is deployed on Render.

The backend retrieves data from the Elexon BMRS API and provides analysis results through REST API endpoints.

**Note:** The backend is hosted on Render's free instance. If it has been inactive, the first request may take a little longer while the service starts.

**Step 1: Activate the Backend**

Open the Render backend link first:

https://wind-analytics-clwt.onrender.com/api/health

Wait until you see:

`{"status":"ok","service":"WindScope UK API"}`

This confirms that the backend is active.

**Step 2: Open the Frontend**

After the backend is active, open the WindScope UK dashboard:

https://winduk.vercel.app

The dashboard can now request data from the backend. Subsequent requests should respond normally.

### CORS Configuration
The backend CORS configuration allows requests from the deployed frontend domain. If the frontend domain changes, update the allowed origins in `backend/app/main.py` and redeploy the backend.

## Limitations and Assumptions

- The analysis covers January 2026 and is intended for historical forecast evaluation.
- Actual generation is aggregated from half-hourly records into hourly averages.
- The 16:00 UTC publication cutoff is a configurable pilot assumption.
- Forecast accuracy does not by itself establish a profitable trading or procurement decision. Contract prices, demand, balancing costs, and other commercial inputs are outside the current scope.
- Results depend on the availability, completeness, and definitions of the source data.
- Free hosting services may experience cold starts or usage limits.

## AI Tools Used

Document the AI tools actually used during development, used for ChatGPT for syntax implementation support, debugging . Verify this list before submission.

## License

Add a license if you intend to distribute the project under a specific open-source license.
