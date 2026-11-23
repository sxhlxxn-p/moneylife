from alembic import op
import sqlalchemy as sa
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('request_quotas', sa.Column('key', sa.String(64), primary_key=True),
                    sa.Column('count', sa.Integer(), nullable=False),
                    sa.Column('expires_at', sa.BigInteger(), nullable=False))
    op.create_index('ix_request_quotas_expires_at', 'request_quotas', ['expires_at'])

def downgrade():
    op.drop_table('request_quotas')
