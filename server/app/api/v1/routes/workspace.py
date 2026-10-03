"""The signed-in workspace: onboarding writes here and the next visit reads it back.

A company logo cannot go to WorkOS (organizations have no logo; AuthKit branding is one
mark for the whole environment). Logos are stored in R2 when those keys are set.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.workspace_schemas import (
    InviteIn,
    PictureOut,
    ProductBrief,
    SitePageOut,
    SiteReadIn,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.core.config import Settings
from app.core.errors import ApiProblem
from app.kb.service import DuplicateSource, KnowledgeBaseService
from app.kb.web import FetchConfig, FetchFailure, SafeFetcher, UrlRejected
from app.models.identity import Membership, Organization, User
from app.models.knowledge import Product
from app.onboarding.logo import EXT, sniff_image
from app.onboarding.site import read_public_site
from app.storage.r2 import ObjectStore, build_object_store
from app.worker.queue import JobQueue

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/workspace", tags=["workspace"])
WRITE = [Depends(require_trusted_origin)]
LOGO_PATH_SUFFIX = "/workspace/logo"
PICTURE_PATH_SUFFIX = "/workspace/picture"


def get_queue(request: Request) -> JobQueue:
    queue: JobQueue = request.app.state.queue
    return queue


def _strings(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str)]


def _pages(raw: object) -> list[SitePageOut]:
    if not isinstance(raw, list):
        return []
    pages: list[SitePageOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        path, title = item.get("path"), item.get("title")
        if isinstance(path, str) and isinstance(title, str):
            pages.append(SitePageOut(path=path, title=title))
    return pages


def _invites(raw: object) -> list[InviteIn]:
    if not isinstance(raw, list):
        return []
    invites: list[InviteIn] = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("email"), str):
            continue
        role = item.get("role")
        if role not in ("admin", "member", "viewer"):
            role = "member"
        invites.append(InviteIn(email=item["email"], role=role))
    return invites


def _team(value: str | None) -> Any:
    return value if value in ("solo", "small", "sales") else None


async def _product(db: DbDep, org_id: uuid.UUID) -> Product | None:
    return (
        await db.scalars(
            select(Product).where(Product.org_id == org_id).order_by(Product.created_at).limit(1)
        )
    ).first()


def workspace_out(org: Organization, product: Product | None) -> WorkspaceOut:
    return WorkspaceOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        timezone=org.timezone,
        team_size=_team(org.team_size),
        logo_url=org.logo_url,
        website=org.website,
        onboarded=org.onboarded_at is not None,
        skipped=[n for n in org.skipped_steps if isinstance(n, int)],
        site_pages=_pages(org.site_pages),
        site_highlights=_strings(org.site_highlights),
        invites=_invites(org.pending_invites),
        product=None
        if product is None
        else ProductBrief(id=product.id, name=product.name, description=product.description),
    )


async def _out(db: DbDep, org: Organization) -> WorkspaceOut:
    return workspace_out(org, await _product(db, org.id))


@router.get("")
async def get_workspace(ctx: AuthContextDep, db: DbDep) -> WorkspaceOut:
    return await _out(db, ctx.org)


@router.get("/members")
async def list_members(ctx: AuthContextDep, db: DbDep) -> list[dict[str, str]]:
    """People in this workspace. A new account has one row: the person who signed up."""
    rows = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == ctx.org.id)
            .order_by(Membership.created_at)
        )
    ).all()
    out = []
    for membership, user in rows:
        parts = [user.first_name or "", user.last_name or ""]
        name = " ".join(part for part in parts if part).strip() or user.email
        out.append({"id": str(user.id), "name": name, "email": user.email, "role": membership.role})
    return out


@router.patch("", dependencies=WRITE)
async def update_workspace(ctx: AuthContextDep, db: DbDep, body: WorkspaceUpdate) -> WorkspaceOut:
    org = ctx.org
    if body.name is not None:
        org.name = body.name
    if body.timezone is not None:
        org.timezone = body.timezone
    if body.team_size is not None:
        org.team_size = body.team_size
    if body.skipped is not None:
        org.skipped_steps = list(dict.fromkeys(body.skipped))
    if body.invites is not None:
        org.pending_invites = [
            {"email": invite.email, "role": invite.role} for invite in body.invites if invite.email
        ]
    if body.complete and org.onboarded_at is None:
        org.onboarded_at = datetime.now(UTC)
    if body.slug is not None and body.slug != org.slug:
        org.slug = body.slug
        try:
            async with db.begin_nested():
                await db.flush()
        except IntegrityError as exc:
            raise ApiProblem(409, "slug_taken", "That workspace URL is taken.") from exc
    else:
        await db.flush()
    return await _out(db, org)


@router.post("/logo", dependencies=WRITE)
async def upload_logo(
    ctx: AuthContextDep,
    db: DbDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
) -> WorkspaceOut:
    store = build_object_store(settings)
    if store is None:
        raise ApiProblem(
            503,
            "storage_unconfigured",
            "Logo storage isn't configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL.",
        )
    data = await file.read(settings.logo_max_bytes + 1)
    if len(data) > settings.logo_max_bytes:
        raise ApiProblem(413, "too_large", "Logos can be up to 2 MB.")
    content_type = sniff_image(data)
    if content_type is None:
        raise ApiProblem(415, "unsupported", "Use a PNG, JPEG, GIF or WebP.")
    key = f"logos/{ctx.org.id}/{uuid.uuid4().hex}.{EXT[content_type]}"
    try:
        url = await _put_logo(store, key=key, body=data, content_type=content_type)
    except OSError as exc:
        log.warning("logo_upload_failed", error_type=type(exc).__name__)
        raise ApiProblem(502, "storage_failed", "The logo couldn't be stored. Try again.") from exc
    ctx.org.logo_url = url
    await db.flush()
    return await _out(db, ctx.org)


async def _put_logo(store: ObjectStore, *, key: str, body: bytes, content_type: str) -> str:
    return await store.put_public(key=key, body=body, content_type=content_type)


def _from_mail(url: str | None) -> bool:
    """A picture we stored lives under /avatars/. Anything else came from the mail account."""
    return url is not None and url != "" and "/avatars/" not in url


@router.post("/picture", dependencies=WRITE)
async def upload_picture(
    ctx: AuthContextDep,
    db: DbDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
) -> PictureOut:
    if _from_mail(ctx.user.profile_picture_url):
        raise ApiProblem(409, "picture_from_mail", "Your mail account already has a picture.")
    store = build_object_store(settings)
    if store is None:
        raise ApiProblem(
            503,
            "storage_unconfigured",
            "Photo storage isn't configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL.",
        )
    data = await file.read(settings.logo_max_bytes + 1)
    if len(data) > settings.logo_max_bytes:
        raise ApiProblem(413, "too_large", "Photos can be up to 2 MB.")
    content_type = sniff_image(data)
    if content_type is None:
        raise ApiProblem(415, "unsupported", "Use a PNG, JPEG, GIF or WebP.")
    key = f"avatars/{ctx.user.id}/{uuid.uuid4().hex}.{EXT[content_type]}"
    try:
        url = await _put_logo(store, key=key, body=data, content_type=content_type)
    except OSError as exc:
        log.warning("picture_upload_failed", error_type=type(exc).__name__)
        raise ApiProblem(502, "storage_failed", "The photo couldn't be stored. Try again.") from exc
    ctx.user.profile_picture_url = url
    await db.flush()
    return PictureOut(profile_picture_url=url)


@router.post("/site", dependencies=WRITE)
async def read_site(
    ctx: AuthContextDep,
    db: DbDep,
    settings: SettingsDep,
    request: Request,
    body: SiteReadIn,
) -> WorkspaceOut:
    """Fetch the public site and keep what it actually says. No sample company."""
    config = FetchConfig.from_settings(settings)
    config = FetchConfig(
        timeout_s=settings.onboarding_site_timeout_s,
        max_bytes=config.max_bytes,
        max_redirects=config.max_redirects,
        allowed_ports=config.allowed_ports,
        user_agent=config.user_agent,
        respect_robots=config.respect_robots,
        crawl_max_pages=settings.onboarding_site_max_pages,
    )
    fetcher = SafeFetcher(config)
    try:
        try:
            read = await read_public_site(
                fetcher, body.url, max_pages=settings.onboarding_site_max_pages
            )
        except UrlRejected as exc:
            raise ApiProblem(422, exc.error, exc.detail) from exc
        except FetchFailure as exc:
            raise ApiProblem(422, "site_unreachable", exc.note) from exc
    finally:
        await fetcher.aclose()

    org = ctx.org
    org.website = read.url
    org.site_pages = [{"path": page.path, "title": page.title} for page in read.pages]
    org.site_highlights = list(read.highlights)
    await db.flush()
    await _enqueue_for_product(db, settings, request, ctx, read.url)
    return await _out(db, org)


async def _enqueue_for_product(
    db: DbDep,
    settings: Settings,
    request: Request,
    ctx: AuthContextDep,
    url: str,
) -> None:
    """Hand the same address to the knowledge base when a product already exists.

    A failure here does not undo the pages just read: setup still shows them.
    """
    product = await _product(db, ctx.org.id)
    if product is None:
        return
    queue = get_queue(request)
    service = KnowledgeBaseService(db, ctx.org.id, settings)
    try:
        async with db.begin_nested():
            try:
                source = await service.add_url(
                    product.id, url=url, scope="section", added_by=ctx.user.id
                )
            except DuplicateSource as exc:
                source = await service.start_reread(exc.existing)
            await queue.enqueue_ingest_source(ctx.org.id, source.id, source.generation)
    except Exception as exc:  # a queue miss must not throw away the pages just read
        log.warning("onboarding_site_enqueue_failed", error_type=type(exc).__name__)
