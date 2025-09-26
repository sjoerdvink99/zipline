"""GraphBridge Python client for visual graph analysis."""

from .graphbridge import GraphBridge, Pattern
from .datasets import make_supply_chain, make_social, load_bron, load_hetionet

__version__ = "0.1.0"
__all__ = [
    "GraphBridge",
    "Pattern",
    "make_supply_chain",
    "make_social",
    "load_bron",
    "load_hetionet",
]
