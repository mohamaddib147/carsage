# FastAPI application entry point. Hosts the Trip Planner cost
# calculation and AI Advisor logic in later sprints; for now, the
# health-check endpoint, Trip Planner directions lookup, and shared app
# configuration (CORS, and one handler that keeps request-validation errors
# from echoing the rejected input back — see below).

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ALLOWED_ORIGINS
from app.routers import ai_advisor, car_specs, health, trip_planner

app = FastAPI(title="CarSage API")

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
