from fastapi import APIRouter, Depends

from app.api.v1.routes import (
    companies,
    inbox,
    kb,
    knowledge,
    lead_imports,
    leads,
    products,
    segments,
    sequences,
    workspace,
)
from app.auth import routes as auth
from app.auth.deps import require_auth

api_router = APIRouter(prefix="/api/v1")
# Auth routes decide per-endpoint; everything else is authenticated at the router level so
# a new endpoint can't accidentally ship without auth.
api_router.include_router(auth.router)
for module in (
    leads,
    companies,
    segments,
    lead_imports,
    sequences,
    inbox,
    knowledge,
    products,
    kb,
    workspace,
):
    api_router.include_router(module.router, dependencies=[Depends(require_auth)])
