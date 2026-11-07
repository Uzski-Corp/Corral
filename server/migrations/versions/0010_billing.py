"""billing projection, checkout attempts, webhook receipts, sms scaffold

Revision ID: 0010_billing
Revises: 0009_integration_detail
Create Date: 2026-11-07

Tenant tables use the usual ``tenant_isolation`` policy. ``paddle_webhook_events`` is
operational: row-level security denies ``corral_app``, and the table is not granted to
that role. The ``app_billing_*`` functions are the only cross-tenant path. They resolve
a workspace from a checkout, customer, or subscription row this server created.
``custom_data`` is not consulted here.

SECURITY DEFINER runs as the table owner, which bypasses row-level security unless it
is forced. It is not forced, so these functions can write the receipt table. Forcing
it would make the deny policy block the functions too.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_billing"
down_revision: str | None = "0009_integration_detail"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "corral_app"
CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid"
TENANT_TABLES = (
    "workspace_billing",
    "billing_checkouts",
    "billing_sms_preferences",
    "billing_sms_notifications",
)
OPERATIONAL = "paddle_webhook_events"

FUNCTIONS = (
    "app_billing_record_webhook(text, text, text, timestamptz, jsonb)",
    "app_billing_load_webhook(text)",
    "app_billing_attach_transaction(uuid, text)",
    "app_billing_resolve_org(text, text, text)",
    "app_billing_mark_webhook(text, text, uuid, text)",
    "app_billing_unprocessed(integer)",
    "app_billing_subscription_targets(integer)",
)


def _tenant_columns(name: str) -> list[Any]:
    return [
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f(f"fk_{name}_org_id_organizations"),
            ondelete="CASCADE",
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "workspace_billing",
        *_tenant_columns("workspace_billing"),
        sa.Column("trial_started_at", sa.DateTime(timezone=True)),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True)),
        sa.Column("trial_started_by_user_id", sa.Uuid()),
        sa.Column("paddle_customer_id", sa.String(30)),
        sa.Column("paddle_subscription_id", sa.String(30)),
        sa.Column("subscription_status", sa.String(16)),
        sa.Column("paddle_price_id", sa.String(30)),
        sa.Column("plan_id", sa.String(16)),
        sa.Column("billing_interval", sa.String(8)),
        sa.Column("paid_through_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_effective_at", sa.DateTime(timezone=True)),
        sa.Column("subscription_event_at", sa.DateTime(timezone=True)),
        sa.Column("payment_problem", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("payment_recovered_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["trial_started_by_user_id"],
            ["users.id"],
            name=op.f("fk_workspace_billing_trial_started_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("org_id", name="uq_workspace_billing_org_id"),
        sa.CheckConstraint(
            "plan_id IS NULL OR plan_id IN ('field', 'range', 'territory')",
            name=op.f("ck_workspace_billing_plan_id"),
        ),
        sa.CheckConstraint(
            "billing_interval IS NULL OR billing_interval IN ('month', 'year')",
            name=op.f("ck_workspace_billing_billing_interval"),
        ),
        sa.CheckConstraint(
            "subscription_status IS NULL OR subscription_status IN "
            "('active', 'trialing', 'past_due', 'paused', 'canceled')",
            name=op.f("ck_workspace_billing_subscription_status"),
        ),
        sa.CheckConstraint(
            "(trial_started_at IS NULL) = (trial_ends_at IS NULL)",
            name=op.f("ck_workspace_billing_trial_pair"),
        ),
        sa.CheckConstraint(
            "trial_ends_at IS NULL OR trial_ends_at > trial_started_at",
            name=op.f("ck_workspace_billing_trial_order"),
        ),
    )
    op.create_index(
        "uq_workspace_billing_paddle_customer",
        "workspace_billing",
        ["paddle_customer_id"],
        unique=True,
        postgresql_where=sa.text("paddle_customer_id IS NOT NULL"),
    )
    op.create_index(
        "uq_workspace_billing_paddle_subscription",
        "workspace_billing",
        ["paddle_subscription_id"],
        unique=True,
        postgresql_where=sa.text("paddle_subscription_id IS NOT NULL"),
    )

    op.create_table(
        "billing_checkouts",
        *_tenant_columns("billing_checkouts"),
        sa.Column("plan_id", sa.String(16), nullable=False),
        sa.Column("interval", sa.String(8), nullable=False),
        sa.Column("paddle_price_id", sa.String(30), nullable=False),
        sa.Column("paddle_transaction_id", sa.String(30)),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid()),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_billing_checkouts_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("paddle_transaction_id", name="uq_billing_checkouts_transaction"),
        sa.CheckConstraint(
            "plan_id IN ('field', 'range', 'territory')",
            name=op.f("ck_billing_checkouts_plan_id"),
        ),
        sa.CheckConstraint(
            "interval IN ('month', 'year')",
            name=op.f("ck_billing_checkouts_interval"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'ambiguous', 'completed', 'canceled')",
            name=op.f("ck_billing_checkouts_status"),
        ),
    )
    op.create_index(
        "uq_billing_checkouts_one_open",
        "billing_checkouts",
        ["org_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('open', 'ambiguous')"),
    )
    op.create_index(
        "ix_billing_checkouts_org_id_created_at",
        "billing_checkouts",
        ["org_id", "created_at"],
    )

    op.create_table(
        "billing_sms_preferences",
        *_tenant_columns("billing_sms_preferences"),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("phone_e164", sa.String(20)),
        sa.Column("phone_verified_at", sa.DateTime(timezone=True)),
        sa.Column("consented", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True)),
        sa.Column("consent_version", sa.String(40)),
        sa.Column("timezone", sa.String(64)),
        sa.Column("quiet_start_minute", sa.Integer()),
        sa.Column("quiet_end_minute", sa.Integer()),
        sa.Column("notify_trial_ending", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notify_payment_failed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notify_renewal", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_billing_sms_preferences_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("org_id", "user_id", name="uq_billing_sms_preferences_org_user"),
        sa.CheckConstraint(
            "quiet_start_minute IS NULL OR quiet_start_minute BETWEEN 0 AND 1439",
            name=op.f("ck_billing_sms_preferences_quiet_start"),
        ),
        sa.CheckConstraint(
            "quiet_end_minute IS NULL OR quiet_end_minute BETWEEN 0 AND 1439",
            name=op.f("ck_billing_sms_preferences_quiet_end"),
        ),
        sa.CheckConstraint(
            "(quiet_start_minute IS NULL) = (quiet_end_minute IS NULL)",
            name=op.f("ck_billing_sms_preferences_quiet_pair"),
        ),
    )

    op.create_table(
        "billing_sms_notifications",
        *_tenant_columns("billing_sms_notifications"),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("dedupe_key", sa.String(120), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_billing_sms_notifications_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("org_id", "dedupe_key", name="uq_billing_sms_notifications_dedupe"),
        sa.CheckConstraint(
            "kind IN ('trial_ending', 'payment_failed', 'renewal')",
            name=op.f("ck_billing_sms_notifications_kind"),
        ),
        sa.CheckConstraint(
            "status IN ('unavailable', 'skipped_revoked', 'suppressed_recovered')",
            name=op.f("ck_billing_sms_notifications_status"),
        ),
    )

    op.create_table(
        OPERATIONAL,
        sa.Column("event_id", sa.String(40), nullable=False),
        sa.Column("notification_id", sa.String(40)),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(16), server_default="received", nullable=False),
        sa.Column("org_id", sa.Uuid()),
        sa.Column("detail", sa.Text()),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("event_id", name=op.f(f"pk_{OPERATIONAL}")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_paddle_webhook_events_org_id_organizations"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('received', 'processed', 'unresolved', 'failed')",
            name=op.f("ck_paddle_webhook_events_status"),
        ),
    )
    op.create_index("ix_paddle_webhook_events_status", OPERATIONAL, ["status"])

    for table in TENANT_TABLES:
        op.create_index(op.f(f"ix_{table}_org_id"), table, ["org_id"])
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (org_id = {CURRENT_ORG}) WITH CHECK (org_id = {CURRENT_ORG})"
        )

    op.execute(f"REVOKE ALL ON {OPERATIONAL} FROM PUBLIC")
    op.execute(f"REVOKE ALL ON {OPERATIONAL} FROM {APP_ROLE}")
    op.execute(f"ALTER TABLE {OPERATIONAL} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY billing_webhook_deny ON {OPERATIONAL} USING (false) WITH CHECK (false)"
    )

    # asyncpg prepares each execute: one function definition per command.
    # Split only the outer dollar-quoted terminator, never PL/pgSQL semicolons.
    for statement in _FUNCTIONS_SQL.split("$fn$;"):
        if statement.strip():
            op.execute(statement + "$fn$;")
    for signature in FUNCTIONS:
        op.execute(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO {APP_ROLE}")


def downgrade() -> None:
    for signature in FUNCTIONS:
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
    op.execute("DROP POLICY IF EXISTS billing_webhook_deny ON paddle_webhook_events")
    op.execute("ALTER TABLE paddle_webhook_events DISABLE ROW LEVEL SECURITY")
    op.drop_table(OPERATIONAL)
    for table in reversed(TENANT_TABLES):
        op.drop_table(table)


_FUNCTIONS_SQL = """
CREATE FUNCTION app_billing_record_webhook(
    p_event_id text,
    p_notification_id text,
    p_event_type text,
    p_occurred_at timestamptz,
    p_payload jsonb
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
    INSERT INTO paddle_webhook_events (
        event_id, notification_id, event_type, occurred_at, payload, status
    ) VALUES (
        p_event_id, p_notification_id, p_event_type, p_occurred_at, p_payload, 'received'
    )
    ON CONFLICT (event_id) DO NOTHING;
    RETURN FOUND;
END
$fn$;

CREATE FUNCTION app_billing_load_webhook(p_event_id text)
RETURNS TABLE (event_type text, occurred_at timestamptz, payload jsonb, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
    SELECT e.event_type, e.occurred_at, e.payload, e.status
    FROM paddle_webhook_events e
    WHERE e.event_id = p_event_id
$fn$;

CREATE FUNCTION app_billing_attach_transaction(p_checkout_id uuid, p_txn text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_org uuid;
BEGIN
    UPDATE billing_checkouts
    SET paddle_transaction_id = p_txn
    WHERE id = p_checkout_id
      AND (paddle_transaction_id IS NULL OR paddle_transaction_id = p_txn)
    RETURNING org_id INTO v_org;
    RETURN v_org;
END
$fn$;

CREATE FUNCTION app_billing_resolve_org(p_txn text, p_customer text, p_subscription text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
    SELECT CASE WHEN count(DISTINCT org_id) = 1 THEN min(org_id::text)::uuid ELSE NULL END
    FROM (
        SELECT org_id FROM billing_checkouts
        WHERE p_txn IS NOT NULL AND paddle_transaction_id = p_txn
        UNION
        SELECT org_id FROM workspace_billing
        WHERE p_customer IS NOT NULL AND paddle_customer_id = p_customer
        UNION
        SELECT org_id FROM workspace_billing
        WHERE p_subscription IS NOT NULL AND paddle_subscription_id = p_subscription
    ) hits
$fn$;

CREATE FUNCTION app_billing_mark_webhook(
    p_event_id text, p_status text, p_org uuid, p_detail text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
    UPDATE paddle_webhook_events
    SET status = p_status,
        org_id = COALESCE(p_org, org_id),
        detail = p_detail,
        processed_at = CASE WHEN p_status = 'processed' THEN now() ELSE processed_at END
    WHERE event_id = p_event_id;
END
$fn$;

CREATE FUNCTION app_billing_unprocessed(p_limit integer)
RETURNS TABLE (event_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
    SELECT e.event_id
    FROM paddle_webhook_events e
    WHERE e.status IN ('received', 'unresolved')
    ORDER BY e.received_at
    LIMIT p_limit
$fn$;

CREATE FUNCTION app_billing_subscription_targets(p_limit integer)
RETURNS TABLE (org_id uuid, paddle_subscription_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
    SELECT b.org_id, b.paddle_subscription_id
    FROM workspace_billing b
    WHERE b.paddle_subscription_id IS NOT NULL
    ORDER BY b.updated_at
    LIMIT p_limit
$fn$;
"""
