"""Products: the thing a knowledge base describes (one knowledge base per product)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import PageDep, repository
from app.api.v1.kb_schemas import ProductCreate, ProductOut, ProductUpdate
from app.auth.deps import require_trusted_origin
from app.core.errors import ApiProblem
from app.repositories import ProductRepository

router = APIRouter(prefix="/products", tags=["products"])
Repo = Annotated[ProductRepository, Depends(repository(ProductRepository))]
WRITE = [Depends(require_trusted_origin)]


def not_found() -> ApiProblem:
    return ApiProblem(404, "not_found", "Product not found")


def name_taken() -> ApiProblem:
    return ApiProblem(409, "name_taken", "A product with this name already exists")


@router.get("")
async def list_products(repo: Repo, page: PageDep) -> list[ProductOut]:
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return [ProductOut.model_validate(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_product(repo: Repo, body: ProductCreate) -> ProductOut:
    try:
        async with repo.session.begin_nested():
            product = await repo.create(**body.model_dump())
    except IntegrityError as exc:
        raise name_taken() from exc
    return ProductOut.model_validate(product)


@router.get("/{product_id}")
async def get_product(repo: Repo, product_id: uuid.UUID) -> ProductOut:
    product = await repo.get(product_id)
    if product is None:
        raise not_found()
    return ProductOut.model_validate(product)


@router.patch("/{product_id}", dependencies=WRITE)
async def update_product(repo: Repo, product_id: uuid.UUID, body: ProductUpdate) -> ProductOut:
    try:
        async with repo.session.begin_nested():
            product = await repo.update(product_id, **body.model_dump(exclude_unset=True))
    except IntegrityError as exc:
        raise name_taken() from exc
    if product is None:
        raise not_found()
    return ProductOut.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=WRITE)
async def delete_product(repo: Repo, product_id: uuid.UUID) -> Response:
    """Deletes the product and, by cascade, its whole knowledge base."""
    if not await repo.delete(product_id):
        raise not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
