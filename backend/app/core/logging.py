"""Journalisation structurée JSON (compatible Loki / CloudWatch)."""

import logging
import sys

import structlog


def configure_logging() -> None:
    """Configure structlog pour des logs JSON exploitables en supervision."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Retourne un logger structuré nommé."""
    return structlog.get_logger(name)
