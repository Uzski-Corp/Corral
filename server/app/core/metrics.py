"""Prometheus metrics with a per-app registry (no process-global default registry)."""

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

LATENCY_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)


class HttpMetrics:
    def __init__(self, registry: CollectorRegistry | None = None) -> None:
        self.registry = registry or CollectorRegistry()
        self.requests = Counter(
            "http_requests_total",
            "HTTP requests by method, route template and status code.",
            ["method", "route", "status"],
            registry=self.registry,
        )
        self.latency = Histogram(
            "http_request_duration_seconds",
            "HTTP request latency by method and route template.",
            ["method", "route"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.in_progress = Gauge(
            "http_requests_in_progress",
            "HTTP requests currently being served.",
            ["method"],
            registry=self.registry,
        )
        self.timeouts = Counter(
            "http_request_timeouts_total",
            "Requests aborted by the request timeout.",
            ["method", "route"],
            registry=self.registry,
        )
