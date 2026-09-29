from fastapi import APIRouter

from app.api.v1.routes import inbox, knowledge, leads, segments, sequences
from app.auth import routes as auth

api_router = APIRouter(prefix="/api/v1")
for module in (auth, leads, segments, sequences, inbox, knowledge):
    api_router.include_router(module.router)
