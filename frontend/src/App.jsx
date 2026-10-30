
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Wind,
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api/analysis`
  : (import.meta.env.DEV
      ? "http://127.0.0.1:8000/api/analysis"
      : "/api/analysis");

const formatNumber = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-GB", {
        maximumFractionDigits: 1,
      });

function MetricCard({ label, value, unit, description }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-value">
        {value} <span>{unit}</span>
      </div>
      <p className="metric-description">{description}</p>
    </div>
  );
}

export default function App() {
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [cutoff, setCutoff] = useState("16:00");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadAnalysis() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        cutoff_time: cutoff,
      });

      const response = await fetch(`${API_URL}?${params}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${response.status})`);
      }

      setResult(await response.json());
    } catch (err) {
      const backendHint = import.meta.env.DEV
        ? "Check that the Python backend is running at http://127.0.0.1:8000."
        : "If this frontend is hosted on Vercel, set VITE_API_URL to the backend origin in the Vercel project settings and redeploy. Otherwise, check the API proxy and backend.";
      setError(
        `${err.message}. ${backendHint}`
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysis();
    // Load initial analysis once when the dashboard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(
    () =>
      (result?.data || []).map((row) => ({
        ...row,
        time: new Date(row.startTime).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        }),
      })),
    [result]
  );

  const metrics = result?.metrics || {};
  const coverage = result?.coverage || {};

  function downloadCsv() {
    if (!result?.data?.length) return;

    const columns = [
      "startTime",
      "publishTime",
      "actual_mw",
      "forecast_mw",
      "error_mw",
      "absolute_error_mw",
    ];

    const escapeCsv = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const csv = [
      columns.join(","),
      ...result.data.map((row) =>
        columns.map((column) => escapeCsv(row[column])).join(",")
      ),
    ].join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `windscope-${startDate}-to-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Wind size={23} /></div>
          <div>
            <strong>WindScope</strong>
            <span>UK WIND INTELLIGENCE</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <div className="nav-item active">
          <Activity size={18} />
          Forecast analysis
        </div>

        <div className="sidebar-note">
          <span className="status-dot" />
          <div>
            <strong>Data source</strong>
            <p>Elexon BMRS API</p>
            <small>Great Britain · January 2026</small>
          </div>
        </div>

        <div className="sidebar-footer">
          Decision support for wind generation forecasting.
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">ENERGY INTELLIGENCE / GB</p>
            <h1>Wind forecast analysis</h1>
            <p className="subtitle">
              Compare day-ahead forecasts with actual wind generation.
            </p>
          </div>
          <div className="live-pill">
            <span className="status-dot" />
            Historical data
          </div>
        </header>

        <section className="filter-panel">
          <div className="filter-heading">
            <CalendarDays size={18} />
            <strong>Analysis settings</strong>
          </div>

          <div className="filters">
            <label>
              Delivery start
              <input
                type="date"
                min="2026-01-01"
                max="2026-01-31"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Delivery end
              <input
                type="date"
                min="2026-01-01"
                max="2026-01-31"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label>
              Previous-day cutoff (UTC)
              <input
                type="time"
                value={cutoff}
                onChange={(event) => setCutoff(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              onClick={loadAnalysis}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading ? "Loading…" : "Run analysis"}
            </button>
          </div>
          <p className="helper-text">
            The 16:00 UTC default is a configurable pilot assumption, not a
            verified market deadline. Metrics use only matched hourly intervals.
          </p>
        </section>

        {error && (
          <div className="error-banner">
            <AlertCircle size={19} />
            <span>{error}</span>
          </div>
        )}

        {loading && !result && (
          <div className="loading-panel">Retrieving Elexon data…</div>
        )}

        <section className="metrics-grid">
          <MetricCard
            label="Mean absolute error"
            value={formatNumber(metrics.mae_mw)}
            unit="MW"
            description="Average absolute forecast error"
          />
          <MetricCard
            label="Root mean squared error"
            value={formatNumber(metrics.rmse_mw)}
            unit="MW"
            description="Penalises larger forecast errors"
          />
          <MetricCard
            label="Forecast bias"
            value={formatNumber(metrics.bias_mw)}
            unit="MW"
            description="Positive means forecast exceeded actual"
          />
          <MetricCard
            label="Weighted absolute error"
            value={formatNumber(metrics.wape_percent)}
            unit="%"
            description="Absolute error relative to actual generation"
          />
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Actual vs forecast generation</h2>
              <p>Hourly average wind generation · MW · timestamps in UTC</p>
            </div>
            <span className="interval-badge">
              {coverage.matched_intervals ?? 0} matched intervals
            </span>
          </div>

          {chartData.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#087f8c" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#087f8c" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e7a33e" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#e7a33e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e8edf2" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value.toLocaleString()} MW`}
                    width={85}
                  />
                  <Tooltip
                    formatter={(value) => [`${formatNumber(value)} MW`]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e4eaf0",
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="actual_mw"
                    name="Actual"
                    stroke="#087f8c"
                    fill="url(#actualFill)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast_mw"
                    name="Forecast"
                    stroke="#d9952f"
                    fill="url(#forecastFill)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <Wind size={32} />
              <strong>No matched hourly intervals</strong>
              <p>
                Try another January date or cutoff. If this persists, inspect
                the API response and forecast coverage before drawing conclusions.
              </p>
            </div>
          )}
        </section>

        <section className="coverage-grid">
          <div className="panel coverage-card">
            <h2>Data coverage</h2>
            <div className="coverage-row">
              <span>Actual hourly intervals</span>
              <strong>{coverage.actual_hourly_intervals ?? "—"}</strong>
            </div>
            <div className="coverage-row">
              <span>Eligible forecast intervals</span>
              <strong>{coverage.eligible_forecast_intervals ?? "—"}</strong>
            </div>
            <div className="coverage-row">
              <span>Matched intervals</span>
              <strong>{coverage.matched_intervals ?? "—"}</strong>
            </div>
            <div className="coverage-row">
              <span>Unmatched actual intervals</span>
              <strong>{coverage.unmatched_actual_intervals ?? "—"}</strong>
            </div>
          </div>

          <div className="panel method-card">
            <h2>Methodology</h2>
            <p>
              <strong>Actuals:</strong> Elexon FUELHH wind records, averaged
              from half-hourly MW values into hourly values.
            </p>
            <p>
              <strong>Forecasts:</strong> Elexon WINDFOR publications, choosing
              the latest available version at or before the previous-day cutoff.
            </p>
            <p>
              <strong>Limit:</strong> This dashboard evaluates forecast accuracy.
              It does not calculate a procurement position because demand,
              contract volumes and prices are not supplied.
            </p>
          </div>
        </section>

        <section className="panel table-panel">
          <div className="panel-heading table-heading">
            <div>
              <h2>Hourly audit table</h2>
              <p>Inspect the source-aligned values behind the metrics.</p>
            </div>
            <button
              className="secondary-button"
              onClick={downloadCsv}
              disabled={!result?.data?.length}
            >
              Export CSV
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Delivery time (UTC)</th>
                  <th>Published (UTC)</th>
                  <th>Actual (MW)</th>
                  <th>Forecast (MW)</th>
                  <th>Error (MW)</th>
                </tr>
              </thead>
              <tbody>
                {(result?.data || []).slice(0, 100).map((row) => (
                  <tr key={row.startTime}>
                    <td>{row.startTime.replace("T", " ").replace("Z", "")}</td>
                    <td>{row.publishTime.replace("T", " ").replace("Z", "")}</td>
                    <td>{formatNumber(row.actual_mw)}</td>
                    <td>{formatNumber(row.forecast_mw)}</td>
                    <td className={row.error_mw > 0 ? "positive" : row.error_mw < 0 ? "negative" : ""}>
                      {formatNumber(row.error_mw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result?.data?.length > 100 && (
              <p className="helper-text">
                Showing the first 100 rows. Export CSV for all matched intervals.
              </p>
            )}
            {result && result.data.length === 0 && (
              <p className="table-empty">No matched records to display.</p>
            )}
          </div>
        </section>

        <footer className="page-footer">
          WindScope UK · Historical analysis · Source: Elexon BMRS API
        </footer>
      </main>
    </div>
  );
}
