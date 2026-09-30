"""Products: the thing a knowledge base describes (one knowledge base per product)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import PageDep, repository
from app.api.v1.kb_schemas import ProductCreate, ProductOut, ProductUpdate
from app.auth.deps import require_trusted_origin
from app.core.errors import ApiProblem
from app.kb.service import source_counts
from app.models.knowledge import Product
from app.repositories import ProductRepository

router = APIRouter(prefix="/products", tags=["products"])
Repo = Annotated[ProductRepository, Depends(repository(ProductRepository))]
WRITE = [Depends(require_trusted_origin)]


async def products_out(repo: ProductRepository, products: list[Product]) -> list[ProductOut]:
    counts = await source_counts(repo.session, repo.org_id, (p.id for p in products))
    fields = [f for f in ProductOut.model_fields if f != "source_count"]
    return [
        ProductOut.model_validate(
            {**{f: getattr(p, f) for f in fields}, "source_count": counts.get(p.id, 0)}
        )
        for p in products
    ]


async def product_out(repo: ProductRepository, product: Product) -> ProductOut:
    (out,) = await products_out(repo, [product])
    return out


def not_found() -> ApiProblem:
    return ApiProblem(404, "not_found", "Product not found")


def name_taken() -> ApiProblem:
    return ApiProblem(409, "name_taken", "A product with this name already exists")


@router.get("")
async def list_products(repo: Repo, page: PageDep) -> list[ProductOut]:
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return await products_out(repo, list(rows))


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_product(repo: Repo, body: ProductCreate) -> ProductOut:
    try:
        async with repo.session.begin_nested():
            product = await repo.create(**body.model_dump())
    except IntegrityError as exc:
        raise name_taken() from exc
    return await product_out(repo, product)


@router.get("/{product_id}")
async def get_product(repo: Repo, product_id: uuid.UUID) -> ProductOut:
    product = await repo.get(product_id)
    if product is None:
        raise not_found()
    return await product_out(repo, product)


@router.patch("/{product_id}", dependencies=WRITE)
async def update_product(repo: Repo, product_id: uuid.UUID, body: ProductUpdate) -> ProductOut:
    try:
        async with repo.session.begin_nested():
            product = await repo.update(product_id, **body.model_dump(exclude_unset=True))
    except IntegrityError as exc:
        raise name_taken() from exc
    if product is None:
        raise not_found()
    return await product_out(repo, product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=WRITE)
async def delete_product(repo: Repo, product_id: uuid.UUID) -> Response:
    """Deletes the product and, by cascade, its whole knowledge base."""
    if not await repo.delete(product_id):
        raise not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
