# GraphBridge

A Visual Analytics system for multivariate graph analysis that bridges representational spaces through descriptive predicates. GraphBridge enables analysts to explore connections between topological structure, node attributes, and higher-level patterns by automatically deriving relational descriptions from user selections.

## Tech Stack

- **Backend**: Python 3.10+, NetworkX, FastAPI, Pydantic
- **Frontend**: React 19, TypeScript, PIXI.js, D3.js, Zustand, Tailwind CSS, Vite
- **Core Innovation**: Descriptive predicate generation across topology, attribute, and pattern spaces
- **Architecture**: Single-user REST API application for focused graph analysis

## Project Structure

```
GraphBridge/
├── backend/
│   ├── src/                          # Source code directory
│   │   ├── app.py                    # FastAPI application factory
│   │   ├── api/                      # API endpoints (graph, datasets, predicates, patterns)
│   │   │   ├── attributes.py         # Attribute space API
│   │   │   ├── datasets.py           # Dataset management API
│   │   │   ├── patterns.py           # Pattern detection API
│   │   │   ├── predicates.py         # Predicate evaluation API
│   │   │   └── topology.py           # Graph topology API
│   │   ├── core/                     # Core framework components
│   │   │   ├── dataset_manager.py    # Dataset loading and management
│   │   │   └── dependencies.py       # Dependency injection
│   │   ├── models/                   # Pydantic data models
│   │   │   ├── graph_models.py       # Graph data structures
│   │   │   ├── pattern_models.py     # Pattern detection models
│   │   │   ├── predicate_models.py   # Core predicate data models
│   │   │   ├── predicate_requests.py # Request schemas
│   │   │   ├── predicate_responses.py# Response schemas
│   │   │   └── schemas.py            # General API schemas
│   │   ├── services/                 # Core business logic services
│   │   │   ├── compiler/             # FOL compilation engine
│   │   │   │   ├── base_predicates.py    # Base predicate classes
│   │   │   │   ├── filter_chain.py       # Filter composition
│   │   │   │   ├── fol_ast.py           # Abstract syntax tree
│   │   │   │   ├── fol_parser.py        # FOL parser implementation
│   │   │   │   ├── formal_types.py      # Type system
│   │   │   │   └── optimization.py      # Query optimization
│   │   │   ├── evaluation/           # Predicate evaluation engine
│   │   │   │   ├── constraint_evaluator.py # Constraint evaluation
│   │   │   │   ├── fol_evaluator.py     # FOL expression evaluator
│   │   │   │   └── unified_evaluator.py # Unified evaluation interface
│   │   │   ├── inference/            # Fast predicate inference
│   │   │   │   ├── attribute_statistics.py  # Attribute analysis
│   │   │   │   ├── fast_inference_engine.py # <100ms inference engine
│   │   │   │   ├── precomputed_metrics.py   # Cached graph metrics
│   │   │   │   ├── predicate_templates.py   # Template system
│   │   │   │   └── quality_metrics.py       # Quality scoring
│   │   │   ├── patterns/             # Pattern detection & matching
│   │   │   │   ├── detectors.py          # Pattern detection algorithms
│   │   │   │   ├── engine.py             # Pattern engine
│   │   │   │   ├── library.py            # Pattern library
│   │   │   │   └── matcher.py            # Pattern matching
│   │   │   ├── predicates/           # Predicate generation services
│   │   │   │   ├── attribute_predicates.py # Attribute space predicates
│   │   │   │   ├── descriptive.py        # Descriptive predicate generation
│   │   │   │   └── topology_predicates.py  # Topology space predicates
│   │   │   ├── attribute_distributions.py # Attribute analysis
│   │   │   ├── datasets.py               # Dataset services
│   │   │   ├── dimensionality_reduction.py # UMAP and embeddings
│   │   │   ├── metrics.py                # Graph metrics computation
│   │   │   └── predicate_service.py      # Main predicate orchestration
│   │   ├── tests/                    # Comprehensive test suite (98 tests)
│   │   │   ├── test_array_membership_formalism.py     # Array operations
│   │   │   ├── test_cardinality_constraints_formalism.py # Counting quantifiers
│   │   │   ├── test_fol_ast_evaluation.py              # AST evaluation
│   │   │   └── test_predicate_compilation.py           # Compilation engine
│   │   └── utils/                    # Utility functions
│   │       └── logging_config.py     # Structured logging
│   ├── pyproject.toml                # Python project configuration
│   ├── uv.lock                       # Dependency lock file
│   └── .venv/                        # Python virtual environment (uv)
├── frontend/
│   ├── src/
│   │   ├── components/               # UI components
│   │   │   ├── panels/               # Three-panel interface
│   │   │   │   ├── AttributePanel.tsx    # Attribute space visualization
│   │   │   │   ├── GraphCanvas.tsx       # Topology space visualization
│   │   │   │   ├── PredicateBridge.tsx   # Central predicate bridge
│   │   │   │   └── UmapVisualization.tsx # UMAP embedding view
│   │   │   ├── predicate-builder/    # Interactive predicate composition
│   │   │   │   ├── constraints/          # Neighborhood constraints
│   │   │   │   ├── menus/               # Context menus
│   │   │   │   ├── pills/               # Predicate pills
│   │   │   │   ├── FilterBuilder.tsx    # Visual filter builder
│   │   │   │   ├── FOLDisplay.tsx       # FOL expression display
│   │   │   │   └── PredicateComposer.tsx # Main composer interface
│   │   │   ├── results/              # Results visualization
│   │   │   ├── ui/                   # Reusable UI components
│   │   │   ├── DatasetSelector.tsx   # Dataset selection
│   │   │   └── SchemaView.tsx        # Graph schema visualization
│   │   ├── api/                      # Backend API integration
│   │   │   ├── attributes.ts         # Attribute API client
│   │   │   ├── datasets.ts           # Dataset API client
│   │   │   ├── predicates.ts         # Predicate API client
│   │   │   └── graph.ts              # Graph API client
│   │   ├── hooks/                    # React hooks
│   │   │   ├── useGraphSchema.ts     # Graph schema management
│   │   │   ├── usePatterns.ts        # Pattern management
│   │   │   └── usePersistedState.ts  # State persistence
│   │   ├── store/                    # Zustand state management
│   │   │   ├── analysisStore.ts      # Main analysis state
│   │   │   ├── predicateComposerStore.ts # Predicate composition
│   │   │   └── predicates.ts         # Predicate management
│   │   ├── types/                    # TypeScript type definitions
│   │   ├── utils/                    # Utility functions
│   │   │   ├── fol.ts                # FOL utilities
│   │   │   ├── formatting.ts         # Text formatting
│   │   │   └── persistence.ts        # State persistence
│   │   ├── App.tsx                   # Main application component
│   │   └── main.tsx                  # Application entry point
│   ├── package.json                  # NPM dependencies and scripts
│   └── bun.lockb                     # Bun lock file
├── .claude/                          # Project documentation
│   ├── PRD.md                        # Product requirements document
│   └── reference/                    # Implementation references
│       ├── formalism.md              # Mathematical formalism specification
│       ├── use-cases.md              # Domain use cases
│       └── visual-spec.md            # Visual interface specification
├── data/                             # Sample datasets
│   ├── bron_threat_intel.json        # BRON cybersecurity dataset (~1.8K nodes)
│   └── primekg_drug_repurposing.json # PrimeKG biomedical dataset (~1.8K nodes)
├── scripts/                          # Data processing scripts
├── Makefile                          # Development automation
├── CLAUDE.md                         # Complete development guide (this file)
└── README.md                         # Project overview
```

## Commands

```bash
# Complete Setup (recommended for new users)
make setup                        # Setup backend, frontend, generate sample data, and install pre-commit hooks

# Individual Setup Steps
make setup-backend                # Setup backend environment only
make setup-frontend               # Setup frontend environment only
make setup-data                   # Generate sample datasets only
make setup-pre-commit             # Install pre-commit hooks for code quality

# Development
make dev                          # Start both backend and frontend servers
make dev-backend                  # Start backend server only
make dev-frontend                 # Start frontend server only

# Quick Demo
make demo                         # Generate sample data and start both servers

# Testing
make test                         # Run backend tests

# Code Quality
make lint                         # Run backend linting (check only)
make lint-fix                     # Run backend linting with auto-fix
make format                       # Format backend code

# Pre-commit hooks automatically run on every commit:
# • Ruff linting and formatting on backend Python files
# • Full backend test suite (98 tests) for formalism correctness
# • File quality checks (trailing whitespace, end-of-file, etc.)

# Manual Commands (if needed)
cd backend && uv venv && uv sync  # Setup backend environment manually
cd frontend && bun install        # Setup frontend environment manually
```

## MCP Servers

No specific MCP servers configured for this project.

## Reference Documentation

Read these documents when working on specific areas:

| Document | When to Read |
|----------|-------------|
| `.claude/PRD.md` | Understanding requirements, features, API spec |
| `backend/README.md` | Backend development, API usage, deployment |
| `README.md` | Project overview and getting started |

## Code Conventions

### Backend (Python)

- Use Pydantic models for all data validation and serialization
- NetworkX graphs as primary data structure
- Pure REST API architecture for single-user analysis
- Standalone FastAPI server in `src/app.py`
- Built-in datasets in `src/datasets/` for testing and examples
- Uses `uv` for dependency management with `pyproject.toml`

### Frontend (React)

- Component-based architecture with TypeScript
- PIXI.js for WebGL-powered graph visualization
- D3.js for layout algorithms (force-directed, hierarchical)
- Zustand for lightweight state management with localStorage persistence
- Tailwind CSS for styling - no separate CSS files
- REST API integration with direct state management

## API Design

- Pure RESTful endpoints under `/api/`
- Single-user architecture with direct graph access
- Graph operations: dataset switching, node/edge queries, attribute analysis
- Cross-space predicate evaluation and pattern detection
- Return appropriate HTTP status codes

## Core Innovation: Cross-Space Descriptive Predicates

GraphBridge introduces a formal framework for bridging representational spaces in graph analytics through first-order logic-based predicates. The system features an optimized predicate inference engine that generates descriptive predicates in under 100ms, making cross-space exploration highly responsive.

### Formal Foundation

**Multivariate Graph Model**: A multivariate graph is defined as G = (V, E, A) where:
- V = {v₁, v₂, ..., vₙ} is the set of nodes
- E ⊆ V × V is the set of edges
- A: V → D is the attribute function mapping nodes to their properties

**Two Representational Spaces**:

1. **Attribute Space**: Node properties derived from attribute function A
   - Numerical, categorical, or boolean values
   - Example: category ∈ {protein, enzyme}, molecular_weight ∈ ℝ⁺, active ∈ {true, false}
   - Analysis follows tabular data patterns (filtering, aggregation, statistics)

2. **Topology Space**: Structural properties derived from graph structure (V, E)
   - Computed from graph structure rather than stored as node data
   - Examples: degree(v), neighbors(v), centrality(v), clustering(v)

### Cross-Space Predicate Framework

**Cross-Space Constraints**: Predicates that simultaneously reference both topology and attribute spaces.

**Grammar** (based on first-order logic):
```
CrossSpacePredicate ::= SimplePredicate | CompositePredicate | QuantifiedPredicate
SimplePredicate ::= TopologyPredicate | AttributePredicate
CompositePredicate ::= Predicate ∧ Predicate | Predicate ∨ Predicate
QuantifiedPredicate ::= Quantifier Variable ∈ Relation: ConstraintPredicate
```

**Examples**:
- Single-space: `category(x, "protein")` (attribute only), `degree(x) > 5` (topology only)
- Cross-space: `degree(x) > 5 ∧ category(x, "protein")` (combines both spaces)
- Neighborhood: `∀y ∈ neighbors(x): category(y, "enzyme")` (topology relation + neighbor attributes)

**Extended Quantifiers**: Beyond standard ∀ and ∃, we support:
- EXACTLY(k): Precisely k neighbors must satisfy constraint
- AT_LEAST(k): At least k neighbors must satisfy constraint
- AT_MOST(k): At most k neighbors must satisfy constraint

**Interactive Composition**: For user-selected starting predicates F₁, F₂, ..., Fₙ and neighborhood constraint N:
```
ComposedPredicate(x) := (F₁(x) ∨ F₂(x) ∨ ... ∨ Fₙ(x)) ∧ N(x)
```

### Implementation Architecture

- **Backend**: `backend/src/services/predicates/` contains FOL parser, AST definitions, evaluation engine
- **Frontend**: Visual predicate builder with drag-and-drop composition
- **API**: `/api/predicates/` endpoints for cross-space predicate operations
- **Fast Inference**: Optimized predicate inference engine in `backend/src/services/predicates/inference/`
- **Real-time**: WebSocket updates for cross-space highlighting and result visualization

### Fast Predicate Inference Engine

**Performance Optimization**: The system includes a high-performance predicate inference engine that generates descriptive predicates from node selections in <100ms:

#### Core Components:
- **PrecomputedGraphMetrics**: Precomputes all topological metrics (degree, centrality, clustering) on dataset load
- **AttributeStatistics**: Builds comprehensive attribute statistics for intelligent threshold selection
- **FastPredicateInference**: Vectorized analysis engine with quality-based predicate ranking
- **IncrementalCache**: LRU cache for selection-based predicate inference results

#### Performance Features:
- **Precomputation**: All expensive graph metrics computed once on dataset load
- **Vectorized Operations**: NumPy-based attribute analysis for large graphs
- **Smart Thresholds**: Statistical threshold selection based on selection vs. population distribution
- **Quality Scoring**: Coverage (70%) + Selectivity (30%) weighted quality metrics
- **Caching**: Incremental caching of predicate inference results

#### API Endpoints:
- **POST** `/api/predicates/infer-selection-predicates`: Fast predicate generation from node selections (includes `computation_time` field)
- **GET** `/api/predicates/inference/performance`: Performance monitoring and metrics demonstrating <100ms capability
- **POST** `/api/predicates/inference/clear-cache`: Cache management

#### Formalism Compliance:
- All generated predicates follow GraphBridge FOL syntax exactly
- Array membership using `x.attribute in "value"` per Section 3.3
- Topology predicates with proper metric syntax: `degree(x) >= threshold`
- Function calls support multi-argument syntax: `node_type(x, "technique")`
- Quality validation ensures >60% coverage and >10% selectivity thresholds

#### Recent Improvements (Phase 1):
- ✅ **Performance API**: Added `/inference/performance` endpoint for demonstrable <100ms metrics
- ✅ **API Completeness**: Added missing `computation_time` field to inference responses
- ✅ **FOL Parser**: Fixed function call syntax to handle `node_type(x, "technique")` correctly
- ✅ **Evaluation Engine**: Fixed attribute reference bug in projection evaluation
- ✅ **Formalism Validation**: All 99 tests passing, maintaining mathematical correctness

### Key Benefits

- **Cross-Space Navigation**: Seamless exploration across topology and attribute spaces
- **Formal Semantics**: Mathematically precise predicate evaluation
- **Interactive Composition**: Incremental query building through UI
- **Domain Applications**: Biology (protein interactions), cybersecurity (threat intelligence)

## Database

No persistent database - all data held in memory during session. Graphs loaded from NetworkX objects.

## Testing Strategy

### Testing Pyramid

- **70% Unit tests**: FOL predicate compilation, cross-space evaluation, formalism compliance
- **20% Integration tests**: API endpoints, pattern detection workflows
- **10% E2E tests**: Full client-server workflows via Jupyter notebooks

### Formalism Testing

**Critical Requirement**: All formalism tests must pass before deployment. The backend includes comprehensive test coverage for:

- **`tests/test_predicate_compilation.py`**: Core FOL compilation and evaluation (29 tests)
- **`tests/test_array_membership_formalism.py`**: Array membership operations per Section 3.3 (19 tests)
- **`tests/test_cardinality_constraints_formalism.py`**: Extended counting quantifiers per Section 4 (17 tests)
- **`tests/test_fol_ast_evaluation.py`**: AST evaluation engine (32 tests)

These tests validate mathematical correctness of the cross-space predicate framework essential for IEEE VIS publication.

### Unit Tests

- Test pattern detection algorithms
- Test graph manipulation functions
- Test data serialization/deserialization
- Mock WebSocket connections

### Integration Tests

- Test API endpoints with real graphs
- Test WebSocket event propagation
- Test client-server synchronization

### Test Organization

```
backend/tests/
├── test_predicate_compilation.py        # FOL compilation and cross-space predicates
├── test_array_membership_formalism.py   # Section 3.3 array operations
├── test_cardinality_constraints_formalism.py # Section 4 counting quantifiers
├── test_fol_ast_evaluation.py           # Core AST evaluation engine
├── test_datasets.py                     # Built-in datasets tests
└── conftest.py                          # Shared test fixtures and utilities
```

## Core Features

### 1. Three-Panel Interface
- **Topology Space**: Interactive graph visualization with WebGL-powered PIXI.js rendering
- **Predicate Bridge**: Central panel for cross-space predicate generation and filter composition
- **Attribute Space**: Coordinated attribute exploration with cross-space highlighting

### 2. Cross-Space Predicate Generation
- **Simple Predicates**: Single-space constraints (topology-only or attribute-only)
- **Cross-Space Predicates**: Combined topology + attribute constraints
- **Quantified Predicates**: Neighborhood constraints with counting quantifiers
- **Composed Predicates**: Interactive combination of multiple starting filters

### 3. Interactive Filter Builder
- **Visual Composition**: Drag-and-drop predicate building with formal FOL backend
- **Starting Point Selection**: Choose which filters serve as domain for neighborhood constraints
- **Extended Quantifiers**: EXACTLY(k), AT_LEAST(k), AT_MOST(k) for precise counting
- **Real-time Preview**: Immediate visual feedback of cross-space filter results

### 4. Formal Evaluation Engine
- **FOL Parser**: Converts visual predicates to formal logic expressions
- **AST Evaluation**: Type-checked abstract syntax tree evaluation
- **Cross-Space Semantics**: Mathematically precise evaluation across topology and attribute spaces
- **Optimization**: Query optimization and caching for performance

### 5. API Usage

The system runs as a standalone backend server with a React frontend. Data is loaded through the web interface or via API endpoints:

```bash
# Start the backend server
cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000

# Start the frontend
cd frontend && bun run dev

# Access the application at http://localhost:5173
```

API endpoints available at `http://localhost:8000/api/`:
- `/api/datasets/` - Dataset management and switching
- `/api/graph/` - Graph operations and queries
- `/api/predicates/` - Cross-space predicate generation and evaluation
- `/api/patterns/` - Pattern detection and matching
- `/api/attributes/` - Attribute distributions and UMAP embeddings

### 6. Sample Datasets

GraphBridge includes two sample datasets for testing and demonstration:

- **BRON Threat Intelligence** (~1.8K nodes): Cybersecurity threat intelligence network with MITRE ATT&CK techniques, threat actors, and malware families
- **PrimeKG Drug Repurposing** (~1.8K nodes): Biomedical knowledge graph with genes, compounds, diseases, and their relationships for drug repurposing analysis

Generate these datasets with:
```bash
make setup-data
```

The datasets are created in `data/` directory with standardized JSON format suitable for graph analysis.

## Development Workflow

### 1. Setting Up Development Environment

```bash
# Clone repository
git clone <repository-url>
cd GraphBridge

# Setup backend environment
cd backend && uv venv && uv sync

# Setup frontend environment
cd ../frontend && bun install
```

### 2. Running Development

```bash
# Run both backend and frontend
make dev

# Or separately:
# Terminal 1: Backend development
make dev-backend

# Terminal 2: Frontend development
make dev-frontend
```

### 3. Testing Pipeline

```bash
# Run backend tests
cd backend && .venv/bin/python -m pytest tests/ --pythonpath=src

# Check code quality
cd backend && .venv/bin/ruff check --fix src/
cd frontend && npm run lint
```

## Production Deployment

### Package Installation

```bash
# Build frontend
cd frontend && bun run build

# Install backend
cd backend && uv sync
```

### Usage

```bash
# Start both servers
make dev

# Or manually:
cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000 &
cd frontend && bun run dev

# Access the application at http://localhost:5173
```
