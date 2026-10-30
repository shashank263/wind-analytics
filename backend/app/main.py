
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache

import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

FUELHH_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"
WINDFOR_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"

app = FastAPI(
    title="WindScope UK API",
    description="Wind generation forecast and accuracy analysis",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://wind-analyticuk.vercel.app"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def fetch_json(url: str, params: dict) -> list[dict]:
    """Fetch records from an Elexon endpoint."""
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()

        if not isinstance(data, list):
            raise ValueError("Expected a JSON list from Elexon.")

        return data

    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not retrieve valid Elexon data: {exc}",
        ) from exc


@lru_cache(maxsize=32)
def get_actuals(start_date: str, end_date: str) -> pd.DataFrame:
    records = fetch_json(
        FUELHH_URL,
        {
            "settlementDateFrom": start_date,
            "settlementDateTo": end_date,
            "fuelType": "WIND",
        },
    )

    if not records:
        return pd.DataFrame(columns=["startTime", "actual_mw"])

    df = pd.DataFrame(records)

    required = {"startTime", "generation", "fuelType"}
    if not required.issubset(df.columns):
        raise HTTPException(
            status_code=502,
            detail="FUELHH response is missing required fields.",
        )

    df = df[df["fuelType"] == "WIND"].copy()
    df["startTime"] = pd.to_datetime(
        df["startTime"], utc=True, errors="coerce"
    )
    df["generation"] = pd.to_numeric(
        df["generation"], errors="coerce"
    )
    df = df.dropna(subset=["startTime", "generation"])

    # Actual generation is an average MW value for each half-hour.
    # Average the two half-hourly values to obtain an hourly average MW.
    df["hour"] = df["startTime"].dt.floor("h")

    return (
        df.groupby("hour", as_index=False)["generation"]
        .mean()
        .rename(columns={
            "hour": "startTime",
            "generation": "actual_mw",
        })
    )


@lru_cache(maxsize=32)
def get_forecasts(
    publish_from: str, publish_to: str
) -> pd.DataFrame:
    records = fetch_json(
        WINDFOR_URL,
        {
            "publishDateTimeFrom": publish_from,
            "publishDateTimeTo": publish_to,
        },
    )

    if not records:
        return pd.DataFrame(
            columns=["startTime", "publishTime", "forecast_mw"]
        )

    df = pd.DataFrame(records)

    required = {"startTime", "publishTime", "generation"}
    if not required.issubset(df.columns):
        raise HTTPException(
            status_code=502,
            detail="WINDFOR response is missing required fields.",
        )

    df["startTime"] = pd.to_datetime(
        df["startTime"], utc=True, errors="coerce"
    )
    df["publishTime"] = pd.to_datetime(
        df["publishTime"], utc=True, errors="coerce"
    )
    df["generation"] = pd.to_numeric(
        df["generation"], errors="coerce"
    )
    df = df.dropna(
        subset=["startTime", "publishTime", "generation"]
    )

    return df.rename(columns={"generation": "forecast_mw"})[
        ["startTime", "publishTime", "forecast_mw"]
    ]


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "WindScope UK API"}


@app.get("/api/analysis")
def analysis(
    start_date: date = Query(
        default=date(2026, 1, 1),
        description="First delivery date, inclusive",
    ),
    end_date: date = Query(
        default=date(2026, 1, 31),
        description="Last delivery date, inclusive",
    ),
    cutoff_time: time = Query(
        default=time(16, 0),
        description="Decision cutoff on the previous day, UTC",
    ),
):
    
    if (
        start_date.year != 2026
        or start_date.month != 1
        or end_date.year != 2026
        or end_date.month != 1
    ):
        raise HTTPException(
            status_code=400,
            detail="Delivery dates must be in January 2026.",
        )

    if end_date < start_date:
        raise HTTPException(
            status_code=400,
            detail="end_date must be on or after start_date.",
        )

    if (end_date - start_date).days > 30:
        raise HTTPException(
            status_code=400,
            detail="Select a maximum of 31 delivery days.",
        )

    try:
        # UK uses GMT (UTC+0) during January.
        # The 16:00 default is a configurable pilot assumption,
        # not a verified market deadline.
        cutoff = cutoff_time.strftime("%H:%M:%S")

        actuals = get_actuals(
            start_date.isoformat(),
            end_date.isoformat(),
        )

        # Retrieve forecast publications around the delivery period.
        # The previous-day cutoff determines which version is eligible.
        publish_from = datetime.combine(
            start_date - timedelta(days=2),
            time.min,
            tzinfo=timezone.utc,
        )
        publish_to = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )

        forecasts = get_forecasts(
            publish_from.isoformat().replace("+00:00", "Z"),
            publish_to.isoformat().replace("+00:00", "Z"),
        )

        delivery_start = pd.Timestamp(
            start_date, tz="UTC"
        )
        delivery_end = pd.Timestamp(
            end_date + timedelta(days=1), tz="UTC"
        )

        if not actuals.empty:
            actuals = actuals[
                (actuals["startTime"] >= delivery_start)
                & (actuals["startTime"] < delivery_end)
            ]

        if not forecasts.empty:
            forecasts = forecasts[
                (forecasts["startTime"] >= delivery_start)
                & (forecasts["startTime"] < delivery_end)
            ].copy()

        selected = []

        if not forecasts.empty:
            # Each delivery date gets its own previous-day cutoff.
            for delivery_date in pd.date_range(
                start_date, end_date, freq="D"
            ):
                delivery_day = delivery_date.date()

                decision_cutoff = pd.Timestamp(
                    datetime.combine(
                        delivery_day - timedelta(days=1),
                        cutoff_time,
                        tzinfo=timezone.utc,
                    )
                )

                eligible = forecasts[
                    (forecasts["startTime"].dt.date == delivery_day)
                    & (
                        forecasts["publishTime"]
                        <= decision_cutoff
                    )
                ]

                if not eligible.empty:
                    latest = (
                        eligible.sort_values("publishTime")
                        .drop_duplicates(
                            subset=["startTime"], keep="last"
                        )
                    )
                    selected.append(latest)

        if selected:
            forecast_df = pd.concat(
                selected, ignore_index=True
            )
        else:
            forecast_df = pd.DataFrame(
                columns=["startTime", "publishTime", "forecast_mw"]
            )

        matched = actuals.merge(
            forecast_df,
            on="startTime",
            how="inner",
        )

        if not matched.empty:
            matched["error_mw"] = (
                matched["forecast_mw"] - matched["actual_mw"]
            )
            matched["absolute_error_mw"] = (
                matched["error_mw"].abs()
            )

            mae = float(matched["absolute_error_mw"].mean())
            rmse = float(
                (matched["error_mw"] ** 2).mean() ** 0.5
            )
            bias = float(matched["error_mw"].mean())

            actual_total = float(matched["actual_mw"].abs().sum())
            wape = (
                float(
                    matched["absolute_error_mw"].sum()
                    / actual_total
                    * 100
                )
                if actual_total > 0
                else None
            )

            rows = matched.sort_values("startTime").copy()
            rows["startTime"] = rows["startTime"].dt.strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            rows["publishTime"] = rows["publishTime"].dt.strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            data = rows.to_dict(orient="records")

        else:
            mae = rmse = bias = wape = None
            data = []

        return {
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "cutoff_time_utc": cutoff,
            },
            "method": {
                "actual_resolution": "Hourly average from two half-hourly records",
                "forecast_selection": (
                    "Latest publication at or before the previous-day cutoff"
                ),
                "error_definition": "Forecast minus actual",
            },
            "coverage": {
                "actual_hourly_intervals": len(actuals),
                "eligible_forecast_intervals": len(forecast_df),
                "matched_intervals": len(data),
                "unmatched_actual_intervals": max(
                    0, len(actuals) - len(data)
                ),
            },
            "metrics": {
                "mae_mw": mae,
                "rmse_mw": rmse,
                "bias_mw": bias,
                "wape_percent": wape,
            },
            "data": data,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {exc}",
        ) from exc
