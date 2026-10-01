"""keep an uploaded profile picture when mail has none

Revision ID: 0007_keep_uploaded_picture
Revises: 0006_workspace_profile
Create Date: 2026-10-01

Sign-in used to copy WorkOS's profile_picture_url on every login, including null.
An uploaded photo would disappear the next time someone signed in without a mail
picture. A picture WorkOS actually sends still replaces the upload.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007_keep_uploaded_picture"
down_revision: str | None = "0006_workspace_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same body as 0006, except a null incoming picture leaves the stored one in place.
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
        profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, u.profile_picture_url),
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

PREVIOUS_FN = PROVISION_FN.replace(
    "profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, u.profile_picture_url),",
    "profile_picture_url = EXCLUDED.profile_picture_url,",
)


def upgrade() -> None:
    op.execute(PROVISION_FN)


def downgrade() -> None:
    op.execute(PREVIOUS_FN)
