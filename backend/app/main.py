# FastAPI application entry point. Hosts the Trip Planner cost
# calculation and AI Advisor logic in later sprints; for now, the
# health-check endpoint, Trip Planner directions lookup, and shared app
# configuration (CORS, and one handler that keeps request-validation errors
# from echoing the rejected input back — see below). CAR-25: also a catch-all
# that turns any unexpected error into a fixed friendly 500 (never a stack
# trace or exception text), and keeps outbound-URL logging (which would print
# API keys) switched off.

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ALLOWED_ORIGINS
from app.routers import ai_advisor, car_specs, health, trip_planner

logger = logging.getLogger(__name__)

# CAR-25: httpx logs every outbound request URL at INFO level, and Google Maps,
# Gemini and YouTube receive their API key as a `?key=` query parameter — so a
# host that runs at INFO (many do) would print our keys into its logs. Keeping
# the HTTP libraries at WARNING means a URL is never logged on success.
for _http_logger in ("httpx", "httpcore"):
    logging.getLogger(_http_logger).setLevel(logging.WARNING)

# Sent for any error we did not anticipate. Fixed text: never the exception.
UNEXPECTED_ERROR_MESSAGE = "Something went wrong on our side. Please try again."

app = FastAPI(title="CarSage API")


# CAR-25: catches any error no route handled. The client gets a fixed friendly
# JSON message — never the exception text, a stack trace or a file path — and
# the real traceback goes to the server log only. It is registered BEFORE the
# CORS middleware on purpose: middleware added later wraps the earlier ones, so
# this sits inside CORS and its reply carries the CORS headers, which lets the
# browser actually read (and the frontend show) the message. (An
# `exception_handler(Exception)` would run outside CORS, and the browser would
# see only a blocked, unreadable response.)
@app.middleware("http")
async def hide_unexpected_errors(request: Request, call_next):
    """Runs the request; on any unhandled exception, logs it and returns a 500."""
    try:
        return await call_next(request)
    except Exception:  # noqa: BLE001 - this is the last line of defence
        logger.exception("Unhandled error handling %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": UNEXPECTED_ERROR_MESSAGE})


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    """
    Returns a 422 that says WHERE a request was invalid and WHY, but never
    echoes the rejected value (CAR-23). FastAPI's default body includes the
    raw `input`: that reflected huge payloads back to the sender, and for a
    non-finite JSON number (`Infinity` / `NaN`) it could not even be
    serialized, so the 422 itself crashed into a 500.
    """
    errors = [
        {
            "loc": list(error.get("loc", ())),
            "msg": error.get("msg", "Invalid value."),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


app.include_router(health.router)
app.include_router(trip_planner.router)
app.include_router(car_specs.router)
app.include_router(ai_advisor.router)
