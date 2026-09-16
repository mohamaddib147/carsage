# FastAPI application entry point. Hosts the Trip Planner cost
# calculation and AI Advisor logic in later sprints; for now, the
# health-check endpoint, Trip Planner directions lookup, and shared app
# configuration (CORS).

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.routers import health, trip_planner

app = FastAPI(title="CarSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(trip_planner.router)
