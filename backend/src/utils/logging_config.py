import json
import logging
import sys
import time

import colorlog


class StructuredFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
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

        # Add any extra fields from the log record
        if hasattr(record, "extra"):
            log_entry.update(record.extra)

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class ColoredConsoleFormatter(colorlog.ColoredFormatter):
    def __init__(self):
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


def setup_logging(log_level: str = "INFO", structured: bool = False):
    # Clear any existing handlers
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Set logging level
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger.setLevel(numeric_level)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    if structured:
        console_handler.setFormatter(StructuredFormatter())
    else:
        console_handler.setFormatter(ColoredConsoleFormatter())

    root_logger.addHandler(console_handler)

    # Configure specific loggers
    configure_loggers(numeric_level)

    logging.info(
        "✅ Logging configured",
        extra={
            "log_level": log_level,
            "structured": structured,
            "loggers_configured": [
                "graphbridge.app",
                "graphbridge.predicates",
                "graphbridge.fol",
                "graphbridge.api",
                "graphbridge.datasets",
                "graphbridge.performance",
            ],
        },
    )


def configure_loggers(level: int):
    # Application logger
    app_logger = logging.getLogger("graphbridge.app")
    app_logger.setLevel(level)

    # FOL compilation and evaluation
    fol_logger = logging.getLogger("graphbridge.fol")
    fol_logger.setLevel(level)

    # Predicate processing
    predicate_logger = logging.getLogger("graphbridge.predicates")
    predicate_logger.setLevel(level)

    # API endpoints
    api_logger = logging.getLogger("graphbridge.api")
    api_logger.setLevel(level)

    # Dataset operations
    datasets_logger = logging.getLogger("graphbridge.datasets")
    datasets_logger.setLevel(level)

    # Performance monitoring
    performance_logger = logging.getLogger("graphbridge.performance")
    performance_logger.setLevel(level)

    # Graph operations
    graph_logger = logging.getLogger("graphbridge.graph")
    graph_logger.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"graphbridge.{name}")


class LogContext:
    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.old_factory = None

    def __enter__(self):
        self.old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = self.old_factory(*args, **kwargs)
            for key, value in self.context.items():
                setattr(record, key, value)
            return record

        logging.setLogRecordFactory(record_factory)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        logging.setLogRecordFactory(self.old_factory)


def log_performance(logger: logging.Logger):
    def decorator(func):
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                logger.info(
                    f"✅ {func.__name__} completed",
                    extra={
                        "function": func.__name__,
                        "execution_time_ms": round(execution_time, 2),
                        "args_count": len(args),
                        "kwargs_count": len(kwargs),
                    },
                )
                return result
            except Exception as e:
                execution_time = (time.time() - start_time) * 1000
                logger.error(
                    f"❌ {func.__name__} failed",
                    extra={
                        "function": func.__name__,
                        "execution_time_ms": round(execution_time, 2),
                        "error": str(e),
                        "error_type": type(e).__name__,
                    },
                )
                raise

        return wrapper

    return decorator


def log_api_request(logger: logging.Logger, endpoint: str, method: str = "POST"):
    def decorator(func):
        import functools

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request_id = f"{int(time.time())}{hash(func.__name__) % 1000:03d}"

            logger.info(
                f"🔄 API Request: {method} {endpoint}",
                extra={
                    "request_id": request_id,
                    "endpoint": endpoint,
                    "method": method,
                    "function": func.__name__,
                },
            )

            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000

                logger.info(
                    f"✅ API Response: {method} {endpoint}",
                    extra={
                        "request_id": request_id,
                        "endpoint": endpoint,
                        "method": method,
                        "execution_time_ms": round(execution_time, 2),
                        "status": "success",
                    },
                )
                return result
            except Exception as e:
                execution_time = (time.time() - start_time) * 1000
                logger.error(
                    f"❌ API Error: {method} {endpoint}",
                    extra={
                        "request_id": request_id,
                        "endpoint": endpoint,
                        "method": method,
                        "execution_time_ms": round(execution_time, 2),
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "status": "error",
                    },
                )
                raise

        return wrapper

    return decorator
