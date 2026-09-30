"""OpenAPI contract for the lead CRM: paths, shapes and documented errors the client relies on."""

from typing import Any

import pytest

from app.leads.rules import FIELD_OPS
from app.leads.vocab import EMAIL_STATUSES, REPLY_STATUSES
from app.main import create_app
from tests.conftest import make_settings

SCHEMA: dict[str, Any] = create_app(make_settings()).openapi()
PATHS = SCHEMA["paths"]
COMPONENTS = SCHEMA["components"]["schemas"]


def component(name: str) -> dict[str, Any]:
    return dict(COMPONENTS[name])


def resolve(ref: dict[str, Any]) -> dict[str, Any]:
    return component(ref["$ref"].rsplit("/", 1)[1])


EXPECTED = {
    "/api/v1/companies": {"get", "post"},
    "/api/v1/companies/query": {"post"},
    "/api/v1/companies/bulk": {"post"},
    "/api/v1/companies/enroll-plan": {"post"},
    "/api/v1/companies/{company_id}": {"get", "patch", "delete"},
    "/api/v1/companies/{company_id}/merge": {"post"},
    "/api/v1/segments": {"get", "post"},
    "/api/v1/segments/preview": {"post"},
    "/api/v1/segments/{segment_id}": {"get", "patch", "delete"},
    "/api/v1/segments/{segment_id}/companies": {"post"},
    "/api/v1/lead-imports": {"get", "post"},
    "/api/v1/lead-imports/{import_id}": {"get"},
    "/api/v1/lead-imports/{import_id}/errors.csv": {"get"},
    "/api/v1/leads/{lead_id}/unsubscribe": {"post"},
}


@pytest.mark.parametrize(("path", "methods"), sorted(EXPECTED.items()))
def test_paths(path: str, methods: set[str]) -> None:
    assert set(PATHS[path]) == methods


def test_cursor_page_shape() -> None:
    page = component("CompanyPage")
    assert set(page["required"]) == {"data", "next_cursor", "has_more", "total"}
    for path in ("/api/v1/companies/query", "/api/v1/segments/{segment_id}/companies"):
        ok = PATHS[path]["post"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert ok == {"$ref": "#/components/schemas/CompanyPage"}
        assert "400" in PATHS[path]["post"]["responses"]


def test_company_shape_uses_codes_not_labels() -> None:
    out = component("CompanyOut")["properties"]
    assert set(out["reply_status"]["enum"]) == set(REPLY_STATUSES)
    assert set(component("PersonOut")["properties"]["email_status"]["enum"]) == set(EMAIL_STATUSES)
    assert {"fit", "primary", "import_id", "reply_status_set_by"} <= set(out)


def test_rules_are_typed() -> None:
    rule = component("Rule")["properties"]
    assert set(rule["field"]["enum"]) == set(FIELD_OPS)
    assert set(rule["op"]["enum"]) == {"gte", "lte", "is", "not", "contains"}


def test_bulk_is_a_discriminated_union() -> None:
    body = PATHS["/api/v1/companies/bulk"]["post"]["requestBody"]["content"]["application/json"]
    schema = body["schema"]
    assert schema["discriminator"]["propertyName"] == "action"
    assert set(schema["discriminator"]["mapping"]) == {
        "set_reply_status", "add_to_segment", "remove_from_segment", "delete"
    }  # fmt: skip
    responses = PATHS["/api/v1/companies/bulk"]["post"]["responses"]
    assert {"403", "409", "422"} <= set(responses)


def test_import_contract() -> None:
    post = PATHS["/api/v1/lead-imports"]["post"]
    assert {"200", "202", "403", "411", "413", "415", "422", "429"} <= set(post["responses"])
    form = post["requestBody"]["content"]["multipart/form-data"]["schema"]
    props = resolve(form)["properties"]
    assert {"file", "mapping", "policy", "dry_run"} <= set(props)
    csv = PATHS["/api/v1/lead-imports/{import_id}/errors.csv"]["get"]["responses"]["200"]
    assert "text/csv" in csv["content"]


def test_every_crm_write_documents_the_origin_check() -> None:
    read_only = {"/api/v1/companies/query", "/api/v1/companies/enroll-plan",
                 "/api/v1/segments/preview", "/api/v1/segments/{segment_id}/companies"}  # fmt: skip
    for path, methods in EXPECTED.items():
        for method in methods - {"get"}:
            if path not in read_only:
                assert "403" in PATHS[path][method]["responses"], (method, path)
