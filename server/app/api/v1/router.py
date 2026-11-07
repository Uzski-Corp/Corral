from fastapi import APIRouter, Depends

from app.api.v1.routes import (
    ai,
    billing,
    billing_webhooks,
    companies,
    demo_mail,
    developers,
    discovery,
    inbox,
    integrations,
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
api_router.include_router(ai.tool_router)
api_router.include_router(demo_mail.webhook_router)
for module in (
    ai,
    demo_mail,
    leads,
    companies,
    segments,
    lead_imports,
    sequences,
    inbox,
    discovery,
    integrations,
    developers,
    knowledge,
    products,
    kb,
    workspace,
    billing,
):
    api_router.include_router(module.router, dependencies=[Depends(require_auth)])
api_router.include_router(sequences.mailbox_router, dependencies=[Depends(require_auth)])
# Paddle signs this request. It is not a browser session and does not use Origin checks.
api_router.include_router(billing_webhooks.router)
