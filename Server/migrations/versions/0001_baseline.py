"""Baseline schema. Existing complete schemas are adopted only after comparison."""
from alembic import op
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from sqlalchemy import MetaData

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def expected_metadata():
    # Frozen baseline columns are captured below by executing the migration against a temporary DB.
    from sqlalchemy import create_engine
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        create_schema(Operations(MigrationContext.configure(connection)))
        metadata = MetaData()
        metadata.reflect(connection)
    engine.dispose()
    return metadata

def upgrade():
    connection = op.get_bind()
    names = set(sa.inspect(connection).get_table_names()) - {'alembic_version'}
    if names:
        expected = expected_metadata()
        # Compare types using the target dialect; SQLite's reflected types are portable here.
        differences = compare_metadata(op.get_context(), expected)
        if differences:
            raise RuntimeError('Existing schema differs from baseline; back up and migrate explicitly.')
        return
    create_schema()

def create_schema(operations=op):
    operations.create_table('ai_clarifications',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('plan_id', sa.String(length=36), nullable=False),
    sa.Column('expires_at', sa.BigInteger(), nullable=False),
    sa.Column('original_message', sa.String(length=2000), nullable=False),
    sa.Column('question', sa.String(length=1000), nullable=False),
    sa.Column('turns', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    operations.create_index(operations.f('ix_ai_clarifications_owner_id'), 'ai_clarifications', ['owner_id'], unique=False)
    operations.create_table('ai_explanations',
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('text', sa.String(length=2000), nullable=False),
    sa.Column('model', sa.String(length=128), nullable=False),
    sa.Column('prompt_version', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('run_id')
    )
    operations.create_index(operations.f('ix_ai_explanations_owner_id'), 'ai_explanations', ['owner_id'], unique=False)
    operations.create_table('ai_proposals',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('base_plan_id', sa.String(length=36), nullable=False),
    sa.Column('expires_at', sa.BigInteger(), nullable=False),
    sa.Column('message', sa.String(length=2000), nullable=False),
    sa.Column('intents', sa.JSON(), nullable=False),
    sa.Column('candidate', sa.JSON(), nullable=False),
    sa.Column('model', sa.String(length=128), nullable=False),
    sa.Column('prompt_version', sa.String(length=64), nullable=False),
    sa.Column('applied_plan_id', sa.String(length=36), nullable=True),
    sa.Column('applied_run_id', sa.String(length=36), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    operations.create_index(operations.f('ix_ai_proposals_owner_id'), 'ai_proposals', ['owner_id'], unique=False)
    operations.create_table('guest_sessions',
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('expires_at', sa.BigInteger(), nullable=False),
    sa.PrimaryKeyConstraint('token_hash'),
    sa.UniqueConstraint('owner_id')
    )
    operations.create_table('news_game_records',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('request_id', sa.String(length=36), nullable=False),
    sa.Column('paper_plan_id', sa.String(length=36), nullable=False),
    sa.Column('paper_run_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=40), nullable=False),
    sa.Column('source_month', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'request_id')
    )
    operations.create_index(operations.f('ix_news_game_records_owner_id'), 'news_game_records', ['owner_id'], unique=False)
    operations.create_index(operations.f('ix_news_game_records_paper_plan_id'), 'news_game_records', ['paper_plan_id'], unique=False)
    operations.create_table('paper_explanations',
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('prompt_version', sa.String(length=64), nullable=False),
    sa.Column('model', sa.String(length=128), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('selected_ids', sa.JSON(), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.PrimaryKeyConstraint('run_id', 'prompt_version', 'model')
    )
    operations.create_index(operations.f('ix_paper_explanations_owner_id'), 'paper_explanations', ['owner_id'], unique=False)
    operations.create_table('paper_plans',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('request_id', sa.String(length=36), nullable=False),
    sa.Column('command', sa.JSON(), nullable=False),
    sa.Column('financial_plan_id', sa.String(length=36), nullable=False),
    sa.Column('parent_id', sa.String(length=36), nullable=True),
    sa.Column('state', sa.JSON(), nullable=False),
    sa.Column('orders', sa.JSON(), nullable=False),
    sa.Column('market_snapshot', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'request_id')
    )
    operations.create_index(operations.f('ix_paper_plans_owner_id'), 'paper_plans', ['owner_id'], unique=False)
    operations.create_table('paper_runs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('paper_plan_id', sa.String(length=36), nullable=False),
    sa.Column('engine_version', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.Column('input_snapshot', sa.JSON(), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('paper_plan_id')
    )
    operations.create_index(operations.f('ix_paper_runs_owner_id'), 'paper_runs', ['owner_id'], unique=False)
    operations.create_table('plans',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=40), nullable=False),
    sa.Column('parent_plan_id', sa.String(length=36), nullable=True),
    sa.Column('schema_version', sa.Integer(), nullable=False),
    sa.Column('goal_basis', sa.String(length=24), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.Column('state', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    operations.create_index(operations.f('ix_plans_owner_id'), 'plans', ['owner_id'], unique=False)
    operations.create_table('simulation_runs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('request_id', sa.String(length=36), nullable=False),
    sa.Column('plan_id', sa.String(length=36), nullable=False),
    sa.Column('plan_version', sa.Integer(), nullable=False),
    sa.Column('engine_version', sa.String(length=64), nullable=False),
    sa.Column('months', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.Column('input_snapshot', sa.JSON(), nullable=False),
    sa.Column('monthly_results', sa.JSON(), nullable=False),
    sa.Column('summary', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'request_id')
    )
    operations.create_index(operations.f('ix_simulation_runs_owner_id'), 'simulation_runs', ['owner_id'], unique=False)
    operations.create_index(operations.f('ix_simulation_runs_plan_id'), 'simulation_runs', ['plan_id'], unique=False)

def downgrade():
    raise RuntimeError('Baseline downgrade is disabled; restore a verified backup instead.')
