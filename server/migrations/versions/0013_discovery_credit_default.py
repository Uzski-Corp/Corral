"""New workspaces start with 200 discovery credits."""

from alembic import op

revision = "0013_discovery_credit_default"
down_revision = "0012_ai_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("organizations", "discovery_credit_month", server_default="200")


def downgrade() -> None:
    op.alter_column("organizations", "discovery_credit_month", server_default="0")
