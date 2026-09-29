"""row-level security keyed by app.current_org, plus the corral_app role

Revision ID: 0003_row_level_security
Revises: 0002_domain_table_stubs
Create Date: 2026-09-29

The application switches to the NOLOGIN role ``corral_app`` at the start of every request
transaction (``SELECT set_config('role', 'corral_app', true)``). That role owns nothing and
cannot bypass RLS, so policies apply even when the pooled login role is the table owner.

Identity rows are created/looked up before a tenant is known, so two narrowly scoped
SECURITY DEFINER functions (owned by the migration role, which bypasses RLS as owner)
are the only cross-tenant path:

* ``app_provision_identity(...)`` - idempotent sign-in upsert of user/org/membership
* ``app_resolve_membership(workos_user_id, workos_org_id)`` - the caller's own membership
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003_row_level_security"
down_revision: str | None = "0002_domain_table_stubs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "corral_app"
DOMAIN_TABLES = ("leads", "segments", "sequences", "inbox_threads", "knowledge_items")
ORG_SCOPED_TABLES = ("memberships", *DOMAIN_TABLES)

CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid"
CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"

PROVISION_FN = """
CREATE FUNCTION app_provision_identity(
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
        ON CONFLICT (workos_organization_id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = now()
        RETURNING o.id INTO v_org;
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

RESOLVE_FN = """
CREATE FUNCTION app_resolve_membership(p_workos_user_id text, p_workos_org_id text)
RETURNS TABLE (o_user_id uuid, o_org_id uuid, o_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
    SELECT u.id, o.id, m.role
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN organizations o ON o.id = m.org_id
    WHERE u.workos_user_id = p_workos_user_id
      AND (
        (p_workos_org_id IS NOT NULL AND o.workos_organization_id = p_workos_org_id)
        OR (p_workos_org_id IS NULL AND o.personal_owner_user_id = u.id)
      )
$fn$
"""

FUNCTION_SIGNATURES = (
    "app_provision_identity(text, text, boolean, text, text, text, timestamptz,"
    " text, text, text, text)",
    "app_resolve_membership(text, text)",
)


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
            END IF;
        END
        $$
        """
    )
    # Let the migrating (and, typically, the pooled login) role switch into corral_app.
    op.execute(f"GRANT {APP_ROLE} TO CURRENT_USER")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, UPDATE ON users, organizations TO {APP_ROLE}")
    tables = ", ".join(ORG_SCOPED_TABLES)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tables} TO {APP_ROLE}")

    for table in ORG_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (org_id = {CURRENT_ORG}) WITH CHECK (org_id = {CURRENT_ORG})"
        )

    op.execute("ALTER TABLE organizations ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON organizations "
        f"USING (id = {CURRENT_ORG}) WITH CHECK (id = {CURRENT_ORG})"
    )

    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    # Users are global identities: visible to themselves and to members of the current org.
    op.execute(
        "CREATE POLICY users_visible ON users FOR SELECT USING ("
        f"id = {CURRENT_USER} OR EXISTS ("
        "SELECT 1 FROM memberships m "
        f"WHERE m.user_id = users.id AND m.org_id = {CURRENT_ORG}))"
    )
    op.execute(
        "CREATE POLICY users_update_self ON users FOR UPDATE "
        f"USING (id = {CURRENT_USER}) WITH CHECK (id = {CURRENT_USER})"
    )

    op.execute(PROVISION_FN)
    op.execute(RESOLVE_FN)
    for signature in FUNCTION_SIGNATURES:
        op.execute(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO {APP_ROLE}")


def downgrade() -> None:
    for signature in FUNCTION_SIGNATURES:
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")

    op.execute("DROP POLICY IF EXISTS users_update_self ON users")
    op.execute("DROP POLICY IF EXISTS users_visible ON users")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON organizations")
    op.execute("ALTER TABLE organizations DISABLE ROW LEVEL SECURITY")
    for table in ORG_SCOPED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    tables = ", ".join((*ORG_SCOPED_TABLES, "users", "organizations"))
    op.execute(f"REVOKE ALL ON {tables} FROM {APP_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")
    # The role is cluster-wide and may be used by other databases, so it is kept.
