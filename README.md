# GraphBridge

A Visual Analytics system for multivariate graph analysis that bridges representational spaces through descriptive predicates. GraphBridge transforms implicit cross-space navigation into explicit, coordinated exploration.

**✨ Space-bridging approach - explore topology, attributes, and patterns as connected analytical spaces!**

## 🚀 Quick Start

```bash
pip install graphbridge
```

```python
import networkx as nx
import graphbridge as gb

# Load any NetworkX graph
G = nx.karate_club_graph()

# Start coordinated three-panel exploration
bridge = gb.GraphBridge()
bridge.load(G, default_node_label="Person")
bridge.open()  # Opens space-bridging interface
```

## ✨ Features

- **🌉 Space Bridging**: Coordinate exploration across topology, attribute, and pattern spaces
- **🔍 Descriptive Predicates**: Automatically generate relational descriptions from selections
- **🎛️ Three-Panel Interface**: Coordinated views with real-time cross-space highlighting
- **🧩 Interactive Filter Builder**: Drag-and-drop predicate composition with set operations
- **⚡ Zero Configuration**: Embedded server integration with Jupyter notebooks
- **📊 Cross-Space Analytics**: Reveal non-obvious relationships between structure and attributes
- **🚀 Performance Optimized**: <100ms predicate inference with comprehensive caching
- **📝 IEEE VIS Ready**: Publication-ready system with validated formalism compliance

## 🛠️ Development

```bash
# Install for development
make install

# Build frontend + install package
make build

# Run examples in Jupyter
make jupyter
```

## 📚 Domain Examples

Multi-domain evaluation with real-world case studies:

- **Structural Biology**: Protein interaction networks and functional modules
- **Cybersecurity**: Attack pattern recognition and threat intelligence
- **Energy Systems**: Power grid topology and critical infrastructure analysis

## 📦 Architecture

- **Space-Bridging Core**: Descriptive predicate generation across representational spaces
- **Three-Panel Interface**: Coordinated topology, predicate bridge, and attribute views
- **Real-time Coordination**: WebSocket synchronization between Python and browser
- **Embedded Integration**: Zero-configuration deployment within Jupyter workflows

## License

MIT
