"""workspace profile: logo, site read, onboarding progress

Revision ID: 0006_workspace_profile
Revises: 0005_lead_crm
Create Date: 2026-10-01

Onboarding used to live in a browser cookie. These columns are the workspace's own
record: name and slug were already here; time zone, team size, logo, website, the
pages Corral actually read, invites typed during setup, and when setup was finished.

Sign-in used to overwrite the organization name from WorkOS on every login, which
would wipe a name chosen here. The provision function now keeps the stored name.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0006_workspace_profile"
down_revision: str | None = "0005_lead_crm"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same body as 0003, except a repeat sign-in no longer replaces the workspace name.
PROVISION_FN = """
CREATE OR REPLACE FUNCTION app_provision_identity(
    p_workos_user_id text,
    p_email text,
    p_email_verified boolean,
    p_first_name text,
    p_last_name text,
    p_profile_picture_url text,
    p_signed_in_at timestamptz,
    p_workos_org_id text,
    p_org_name text,
    p_org_slug text,
    p_role text
)
RETURNS TABLE (o_user_id uuid, o_org_id uuid, o_membership_id uuid, o_role text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_user uuid;
    v_org uuid;
    v_membership uuid;
BEGIN
    INSERT INTO users AS u (
        workos_user_id, email, email_verified, first_name, last_name,
        profile_picture_url, last_sign_in_at
    )
    VALUES (
        p_workos_user_id, p_email, p_email_verified, p_first_name, p_last_name,
        p_profile_picture_url, p_signed_in_at
    )
    ON CONFLICT (workos_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        profile_picture_url = EXCLUDED.profile_picture_url,
        last_sign_in_at = EXCLUDED.last_sign_in_at,
        updated_at = now()
    RETURNING u.id INTO v_user;

    IF p_workos_org_id IS NOT NULL THEN
        INSERT INTO organizations AS o (name, slug, workos_organization_id)
        VALUES (p_org_name, p_org_slug, p_workos_org_id)
        ON CONFLICT (workos_organization_id) DO NOTHING
        RETURNING o.id INTO v_org;
        IF v_org IS NULL THEN
            SELECT o.id INTO v_org
            FROM organizations o
            WHERE o.workos_organization_id = p_workos_org_id;
        END IF;
    ELSE
        INSERT INTO organizations AS o (name, slug, personal_owner_user_id)
        VALUES (p_org_name, p_org_slug, v_user)
        ON CONFLICT (personal_owner_user_id) DO NOTHING
        RETURNING o.id INTO v_org;
        IF v_org IS NULL THEN
            SELECT o.id INTO v_org FROM organizations o WHERE o.personal_owner_user_id = v_user;
        END IF;
    END IF;

    INSERT INTO memberships AS m (org_id, user_id, role)
    VALUES (v_org, v_user, p_role)
    ON CONFLICT (org_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        updated_at = now()
    RETURNING m.id INTO v_membership;

    RETURN QUERY SELECT v_user, v_org, v_membership, p_role;
END
$fn$
"""


def upgrade() -> None:
    op.add_column("organizations", sa.Column("timezone", sa.String(64)))
    op.add_column("organizations", sa.Column("team_size", sa.String(16)))
    op.add_column("organizations", sa.Column("logo_url", sa.String(2048)))
    op.add_column("organizations", sa.Column("website", sa.String(2048)))
    op.add_column("organizations", sa.Column("onboarded_at", sa.DateTime(timezone=True)))
    op.add_column(
        "organizations",
        sa.Column("skipped_steps", JSONB(), server_default="[]", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("site_pages", JSONB(), server_default="[]", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("site_highlights", JSONB(), server_default="[]", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("pending_invites", JSONB(), server_default="[]", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_organizations_team_size"),
        "organizations",
        "team_size IS NULL OR team_size IN ('solo', 'small', 'sales')",
    )
    op.execute(PROVISION_FN)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_organizations_team_size"), "organizations", type_="check")
    op.drop_column("organizations", "pending_invites")
    op.drop_column("organizations", "site_highlights")
    op.drop_column("organizations", "site_pages")
    op.drop_column("organizations", "skipped_steps")
    op.drop_column("organizations", "onboarded_at")
    op.drop_column("organizations", "website")
    op.drop_column("organizations", "logo_url")
    op.drop_column("organizations", "team_size")
    op.drop_column("organizations", "timezone")
