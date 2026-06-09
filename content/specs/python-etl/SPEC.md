---
name: python-etl
description: "Modular ETL pipeline with Airflow orchestration, dbt transforms, and S3 staging."
---

## What's included

A production ETL framework organised around three distinct stages: **extract**, **load**, and **transform**. Raw data lands in **S3** via idempotent extractor tasks (partitioned by `<source>/YYYY/MM/DD/HH/`), bulk-loaded into a **PostgreSQL 16** staging schema via `COPY FROM`, and transformed into analytics-ready tables by **dbt Core 1.8** models. **Apache Airflow 2.9** (Celery executor with Redis as the broker) schedules and monitors the full pipeline.

Pre-built extractors for common sources: REST APIs (with pagination, rate limiting, and retry), SFTP, and relational databases (via SQLAlchemy with configurable batch size). A `BaseExtractor` abstract class makes adding new sources a matter of implementing a single `extract(window: DateWindow) -> Iterator[dict]` method. All extractors are **idempotent**: re-running a pipeline window upserts rather than appending — no duplicates, safe to re-trigger on failure.

A separate **data quality DAG** runs dbt tests every six hours and pages via PagerDuty on unexpected null rates, row-count anomalies, or schema drift

## Architecture

**DAGs are thin.** DAGs declare task dependencies and pass parameters; all business logic lives in operator implementations and the `etl/` package. A DAG file should be readable end-to-end in under 50 lines.

```python
# dags/ingest_orders.py
with DAG(
    "ingest_orders",
    schedule="@hourly",
    start_date=pendulum.datetime(2024, 1, 1, tz="UTC"),
    catchup=True,
    tags=["orders", "extract"],
) as dag:

    extract = ExtractOperator(
        task_id="extract_orders",
        extractor="etl.extractors.orders.OrdersExtractor",
        window="{{ data_interval_start }}",
    )
    load = LoadOperator(
        task_id="load_orders",
        source_prefix="orders/{{ ds }}/",
        target_schema="staging",
        target_table="raw_orders",
    )
    extract >> load
```

**Extractors produce S3 objects; they do not write directly to Postgres.** The extract and load stages are decoupled through S3 — an extractor writes newline-delimited JSON (NDJSON) to `s3://<bucket>/<source>/<partition>/`, and the loader picks up those files via a prefix scan. This separation allows independent retry, independent worker scaling, and a permanent raw-data archive for replay.

```python
# etl/extractors/base.py
class BaseExtractor(ABC):
    def __init__(self, s3: S3Client, window: DateWindow) -> None:
        self.s3 = s3
        self.window = window

    @abstractmethod
    def extract(self) -> Iterator[dict]:
        """Yield one raw record at a time."""
        ...

    def run(self) -> ExtractResult:
        key = self._s3_key()
        count = 0
        with self.s3.open_write(key) as f:
            for record in self.extract():
                f.write(json.dumps(record) + "\n")
                count += 1
        return ExtractResult(s3_key=key, record_count=count)
```

**dbt models layer on top of staging in a strict direction.** Staging models (`stg_*`) clean and type-cast raw data. Intermediate models (`int_*`) join and aggregate. Mart models (`mart_*`) are the final analytics-ready tables. Cross-layer dependencies flow one direction only — marts depend on intermediates, intermediates depend on staging, staging depends on raw source tables. No mart ever imports from another mart.

**Secrets never appear in DAG files.** Airflow Connections store credentials for databases and external APIs. DAG code references connections by ID (e.g. `ORDERS_DB_CONN_ID`); the `etl/` package retrieves connection details via `BaseHook.get_connection()`. This pattern works identically in local development and production with no code changes.

## File structure

```
dags/
├── ingest_orders.py         Hourly extract + load
├── ingest_customers.py
├── transform.py             Triggers dbt run on schedule
└── data_quality.py          dbt test DAG (every 6 hours)

etl/
├── extractors/
│   ├── base.py              BaseExtractor abstract class
│   ├── rest.py              REST API extractor (pagination, retry, rate limit)
│   ├── sftp.py              SFTP extractor using paramiko
│   ├── sql.py               Relational DB extractor via SQLAlchemy, batched
│   └── orders.py            Example domain extractor
├── loaders/
│   ├── s3.py                S3 write helper (NDJSON, partition by date)
│   └── postgres.py          COPY FROM S3 NDJSON into staging table
├── operators/
│   ├── extract.py           ExtractOperator wrapping BaseExtractor
│   └── load.py              LoadOperator wrapping postgres.py
├── models.py                DateWindow, ExtractResult dataclasses
└── utils/
    ├── retry.py             Exponential backoff decorator
    └── schema.py            JSON Schema validation for raw records

transforms/                  dbt project root
├── dbt_project.yml
├── profiles.yml.example
├── models/
│   ├── staging/             stg_* models: clean + type-cast
│   ├── intermediate/        int_* models: join + aggregate
│   └── marts/               mart_* models: analytics-ready output
├── tests/                   dbt singular and generic tests
└── macros/                  Shared Jinja macros

tests/
├── conftest.py              Real Postgres + localstack S3 fixtures
├── test_extractors.py       Unit tests with mocked HTTP/SFTP
└── test_loaders.py          Integration tests (real Postgres, localstack S3)

.env.example
requirements.in              Direct dependencies (compiled by pip-compile)
requirements.txt             Full pinned lockfile (committed to git)
docker-compose.yml           postgres, redis, localstack, airflow webserver + scheduler
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec python-etl

# 2. Install dependencies
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Configure
cp .env.example .env
# Set: AIRFLOW__DATABASE__SQL_ALCHEMY_CONN, AIRFLOW__CELERY__BROKER_URL
#      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
#      STAGING_POSTGRES_URL, ETL_S3_BUCKET

# 4. Initialise Airflow
export AIRFLOW_HOME=$(pwd)/.airflow
airflow db migrate
airflow users create --role Admin --username admin --password admin \
  --firstname Admin --lastname User --email admin@example.com

# 5. Start Airflow (separate terminals)
airflow scheduler
airflow webserver --port 8080   # http://localhost:8080

# 6. Trigger a sample pipeline
airflow dags trigger ingest_orders --conf '{"start_date": "2024-01-01"}'

# 7. Run dbt transforms
cd transforms/
cp profiles.yml.example profiles.yml   # point to your staging Postgres
dbt deps && dbt run && dbt test

# 8. Run Python tests
cd ..
pytest tests/
```

For local development, `docker compose up -d` starts postgres, redis, and localstack (S3 emulation) before running the steps above.

## Opinionated choices, with reasons

- **Airflow over Prefect, Dagster, or Mage.** Airflow has the largest operator ecosystem, the most production installs, and the widest community support. Dagster has superior data-lineage UI and asset-oriented semantics — prefer it when observability and lineage tracking are primary concerns. Prefect 2 is lighter but its cloud-first model adds cost at scale.
- **S3 as the extract-to-load boundary.** Decouples extract and load retry logic, provides an auditable raw-data archive, and enables fan-out (multiple loaders consuming the same extract). Writing directly from extractor to Postgres is faster but collapses two concerns and makes partial re-runs harder.
- **dbt Core over custom SQL transformation scripts.** dbt provides incremental materialisation, a built-in test framework, documentation generation (`dbt docs generate`), and source freshness checks — none of which you want to build yourself. Use dbt Cloud when you want the hosted scheduler and collaborative IDE; dbt Core is sufficient when Airflow is already your scheduler.
- **`COPY FROM` over `INSERT` for loads.** PostgreSQL's `COPY` is 10–50x faster than row-by-row inserts for bulk loads. The loader downloads the S3 NDJSON file, writes it to a temp file, and issues `COPY staging.raw_orders FROM '<tempfile>'`. For streaming loads where buffering the full file is impractical, use `execute_values` with a configurable batch size.
- **pip-compile over `pip freeze`.** `requirements.in` declares direct dependencies; `pip-compile` resolves and pins the full dependency tree to `requirements.txt`. The result is auditable, reproducible, and diff-friendly in code review. Use `uv pip compile` for speed on large dependency trees.
- **Celery executor over LocalExecutor in production.** LocalExecutor serialises task execution to a single machine. Celery distributes tasks across multiple worker nodes, allows independent scaling of extract workers (I/O-bound) and transform workers (CPU-bound), and survives scheduler restarts without dropping in-flight tasks.
- **pendulum over Python's `datetime`.** Timezone-aware datetimes with a clean API, native Airflow integration for `data_interval_start` / `data_interval_end`, and chainable arithmetic (`pendulum.now('UTC').subtract(hours=1)`). Python's `datetime` is timezone-naive by default — one missed `.replace(tzinfo=utc)` corrupts pipeline partitioning silently.

## Testing strategy

**Unit tests** cover each extractor with mocked HTTP (via the `responses` library), mocked SFTP (via `unittest.mock`), and mocked S3 (via `moto`). These run in seconds with no network I/O and cover pagination edge cases, rate-limit retry behaviour, and empty-result handling.

**Integration tests** use a real Postgres (started via `docker-compose.yml` in CI) and localstack S3. They exercise the full extract → S3 write → `COPY` to staging path for the sample DAG. A single integration test run takes roughly two minutes; CI caches Docker layers to keep the total under five minutes.

**dbt tests** (`dbt test`) run after every `dbt run` in CI. They cover uniqueness, not-null, accepted-values, and referential integrity constraints. Custom singular tests validate business rules such as non-negative order totals and valid status transitions.

## Skills paired with this spec

- `database-schema-design` — designs dbt staging and mart schemas, reviews model layering and referential integrity
- `test-writer` — pytest patterns for extractor unit tests, moto-based S3 mocks, and integration test fixtures
- `security-auditor` — reviews S3 bucket policies, IAM roles for Airflow workers, and Secrets Manager access patterns

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Real-time or near-real-time pipelines.** Airflow is a batch scheduler; its minimum scheduling granularity is roughly one minute. For streaming data with sub-second latency requirements, use Kafka + Flink or Kafka + Spark Structured Streaming.
- **Purely analytical workload with no ingestion.** If all your data already lives in a warehouse, use dbt Core or dbt Cloud alone — without the Airflow, Python extractor, and S3 staging scaffold.
- **Small data volumes (under 1 GB/day).** The Airflow + Celery + Redis + S3 stack has meaningful operational overhead. For small volumes, a Python script triggered by cron or GitHub Actions is simpler and cheaper.
- **Cloud-native managed pipelines.** On GCP, Dataflow + BigQuery + dbt is a tighter managed stack. On AWS, consider AWS Glue + Step Functions before committing to self-hosted Airflow.
