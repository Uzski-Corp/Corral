"""OpenTelemetry tracing (off by default).

The tracer provider is owned by the application instance and passed explicitly to the
instrumentors; we never install a process-global provider. Spans go to an OTLP/HTTP
exporter (endpoint from settings or the standard ``OTEL_EXPORTER_OTLP_*`` env vars).
"""

from dataclasses import dataclass, field

import structlog
from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SimpleSpanProcessor,
    SpanExporter,
)
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings

log = structlog.get_logger(__name__)

# Probes and scrapes would drown real traffic.
EXCLUDED_URLS = "healthz,readyz,health,metrics"


@dataclass
class Telemetry:
    provider: TracerProvider | None = None
    _engine_instrumented: bool = field(default=False, init=False)

    @property
    def enabled(self) -> bool:
        return self.provider is not None

    def instrument_app(self, app: FastAPI) -> None:
        if self.provider is None:
            return
        FastAPIInstrumentor.instrument_app(
            app, tracer_provider=self.provider, excluded_urls=EXCLUDED_URLS
        )

    def instrument_engine(self, engine: AsyncEngine) -> None:
        if self.provider is None:
            return
        # The instrumentation package pins "sqlalchemy < 2.1" but the engine event API it
        # uses is unchanged in 2.1; tests assert DB spans are produced.
        SQLAlchemyInstrumentor().instrument(
            engine=engine.sync_engine, tracer_provider=self.provider, skip_dep_check=True
        )
        self._engine_instrumented = True

    def shutdown(self) -> None:
        """Flush pending spans and detach instrumentation."""
        if self.provider is None:
            return
        if self._engine_instrumented:
            SQLAlchemyInstrumentor().uninstrument()
            self._engine_instrumented = False
        self.provider.shutdown()


def build_telemetry(settings: Settings, *, exporter: SpanExporter | None = None) -> Telemetry:
    """Create tracing for one app. ``exporter`` is injectable for tests (sync export)."""
    if not settings.otel_enabled:
        return Telemetry()
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": settings.otel_service_name,
                "deployment.environment": settings.app_env,
            }
        ),
        sampler=ParentBased(TraceIdRatioBased(settings.otel_sample_ratio)),
    )
    if exporter is not None:
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    else:
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint))
        )
    log.info(
        "tracing_enabled",
        endpoint=settings.otel_exporter_otlp_endpoint or "env/default",
        sample_ratio=settings.otel_sample_ratio,
    )
    return Telemetry(provider=provider)
