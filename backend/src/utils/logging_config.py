import json
import logging
import sys
import time
from collections.abc import Callable
from typing import Any

import colorlog


class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(record.created)
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if hasattr(record, "extra"):
            log_entry.update(record.extra)

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class ColoredConsoleFormatter(colorlog.ColoredFormatter):
    def __init__(self) -> None:
        super().__init__(
            "%(log_color)s[%(asctime)s] %(levelname)-8s %(name)s:%(funcName)s:%(lineno)d %(reset)s- %(message)s",
            datefmt="%H:%M:%S",
            log_colors={
                "DEBUG": "cyan",
                "INFO": "green",
                "WARNING": "yellow",
                "ERROR": "red",
                "CRITICAL": "bold_red",
            },
        )


def setup_logging(log_level: str = "INFO", structured: bool = False) -> None:
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger.setLevel(numeric_level)

    console_handler = logging.StreamHandler(sys.stdout)
    if structured:
        console_handler.setFormatter(StructuredFormatter())
    else:
        console_handler.setFormatter(ColoredConsoleFormatter())

    root_logger.addHandler(console_handler)

    configure_loggers(numeric_level)

    logging.info(
        "Logging configured", extra={"log_level": log_level, "structured": structured}
    )


def configure_loggers(level: int) -> None:
    app_logger = logging.getLogger("zipline.app")
    app_logger.setLevel(level)

    fol_logger = logging.getLogger("zipline.fol")
    fol_logger.setLevel(level)

    predicate_logger = logging.getLogger("zipline.predicates")
    predicate_logger.setLevel(level)

    api_logger = logging.getLogger("zipline.api")
    api_logger.setLevel(level)

    datasets_logger = logging.getLogger("zipline.datasets")
    datasets_logger.setLevel(level)

    performance_logger = logging.getLogger("zipline.performance")
    performance_logger.setLevel(level)

    graph_logger = logging.getLogger("zipline.graph")
    graph_logger.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"zipline.{name}")


class LogContext:
    def __init__(self, logger: logging.Logger, **context: Any) -> None:
        self.logger = logger
        self.context = context
        self.old_factory: Callable[..., logging.LogRecord] | None = None

    def __enter__(self) -> "LogContext":
        self.old_factory = logging.getLogRecordFactory()

        def record_factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
            assert self.old_factory is not None
            record = self.old_factory(*args, **kwargs)
            for key, value in self.context.items():
                setattr(record, key, value)
            return record

        logging.setLogRecordFactory(record_factory)
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        assert self.old_factory is not None
        logging.setLogRecordFactory(self.old_factory)
