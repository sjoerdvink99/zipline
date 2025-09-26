# GraphBridge

Python client for GraphBridge visual graph analysis. Load NetworkX graphs into an interactive web UI and retrieve detected structural patterns.

## Installation

```bash
pip install graphbridge
```

## Quick Start

```python
import networkx as nx
from graphbridge import GraphBridge

# Connect to GraphBridge server
gb = GraphBridge(api_port=5178, frontend_port=5173)

# Load a graph
G = nx.karate_club_graph()
gb.load(G, default_node_label="Person")

# Open in browser
gb.open()

# Get detected patterns
patterns = gb.get_patterns()
for p in patterns:
    print(f"{p.name}: {len(p.nodes)} nodes, confidence={p.confidence:.2f}")
```

## Features

- Load any NetworkX graph into GraphBridge
- Automatic property graph model detection (node labels, edge types)
- Retrieve detected patterns as Python objects
- Extract pattern subgraphs for further analysis

## Requirements

- Python 3.10+
- Running GraphBridge server (API on port 5178, frontend on port 5173)

## License

MIT
