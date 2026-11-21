from alembic import op
import sqlalchemy as sa
revision='0004'
down_revision='0003'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('plan_saves',sa.Column('id',sa.String(36),primary_key=True),
                    sa.Column('owner_id',sa.String(36),nullable=False),
                    sa.Column('request_id',sa.String(36),nullable=False),
                    sa.Column('plan_id',sa.String(36),nullable=False),
                    sa.Column('command',sa.JSON(),nullable=False),
                    sa.UniqueConstraint('owner_id','request_id'))
    op.create_index('ix_plan_saves_owner_id','plan_saves',['owner_id'])

def downgrade():
    op.drop_table('plan_saves')
