# ZipLine Backend

Python backend for ZipLine — interactive graph explanation through predicate-based visual analytics.

## Quick Start

```bash
uv venv && uv sync          # Install dependencies
uvicorn src.app:app --reload --port 8000
```

## Architecture

```
src/
├── app.py                      # FastAPI application entry point
├── api/
│   ├── datasets.py             # Dataset management (list, load, switch)
│   ├── attributes.py           # Attribute distributions & UMAP embeddings
│   ├── topology.py             # Graph elements, search, schema, paths
│   ├── fol.py                  # FOL evaluation & predicate inference
│   └── learning.py             # Predicate learning endpoints
├── fol/                        # First-Order Logic engine
│   ├── ast.py                  # AST nodes (Variable, predicates, quantifiers, connectives)
│   ├── parser.py               # Recursive descent FOL parser
│   ├── evaluator.py            # Predicate evaluation against NetworkX graphs
│   ├── inference.py            # Predicate inference from selections
│   ├── schema.py               # Edge schema extraction & 2-hop path enumeration
│   ├── topology.py             # Pre-computed topology metrics cache
│   └── learning/               # FOIL-based predicate learning
│       ├── learner.py          # ExplanationLearner (conjunctive, disjunctive, contrastive)
│       ├── beam_search.py      # Beam search with deduplication & diversification
│       ├── scoring.py          # Bernoulli LLR enrichment scoring
│       ├── literal_generator.py    # Literal generation with quality filtering
│       ├── neighborhood_index.py   # Neighborhood evaluation & typed adjacency
│       ├── threshold_finder.py     # Enrichment-driven threshold selection
│       └── feature_filter.py       # Feature filtering utilities
├── models/                     # Pydantic request/response schemas
│   ├── fol_schemas.py          # FOL API schemas
│   ├── graph_models.py         # Graph-related models
│   └── learning_schemas.py     # Learning schemas
├── services/                   # Business logic
│   ├── evaluator.py            # High-level predicate evaluation service
│   ├── attribute_distributions.py  # Attribute histogram computation
│   ├── dimensionality_reduction.py # UMAP embeddings
│   ├── path_finder.py          # Path finding between nodes
│   └── evaluation/
│       └── constraint_evaluator.py # Path constraint evaluation
├── core/
│   ├── dataset_manager.py      # Dataset lifecycle management
│   └── dependencies.py         # FastAPI dependency injection
└── utils/
    ├── logging_config.py       # Structured logging
    └── node_validation.py      # Node ID validation
```

## API Endpoints

### Datasets — `/api/datasets`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List available datasets |
| POST | `/{name}/load` | Load a dataset |
| GET | `/current` | Get current dataset |
| POST | `/switch` | Switch active dataset |

### Graph — `/api/graph`

| Method | Path | Description |
|---|---|---|
| GET | `/elements` | Get all nodes + edges |
| GET | `/schema` | Edge-type schema |
| POST | `/search` | Full-text node search |
| POST | `/find_paths` | Constrained path finding |
| GET | `/neighbor_values` | Neighbor attribute values |
| POST | `/paths/find` | PathFinder service |
| GET | `/validate_neighbor_constraint` | Validate constraints |

### Attributes — `/api/attributes`

| Method | Path | Description |
|---|---|---|
| GET | `/distributions` | Attribute histograms |
| GET | `/umap` | UMAP embedding coordinates |

### Predicates — `/api/predicates`

| Method | Path | Description |
|---|---|---|
| POST | `/evaluate-fol` | Evaluate FOL expression |
| POST | `/apply` | Apply predicates, return matching nodes |
| POST | `/describe` | Infer predicates from selection |
| POST | `/infer-selection-predicates` | Enhanced predicate inference |
| GET | `/lifted` | Get lifted array predicates |

### Learning — `/api/predicates/learn`

| Method | Path | Description |
|---|---|---|
| POST | `/explanations` | Conjunctive explanation learning |
| POST | `/quick` | Quick learning (default params) |
| POST | `/contrastive` | Contrastive learning (explicit S⁻) |
| POST | `/disjunctive` | Disjunctive learning (marginal-gain) |

## FOL Engine

The `fol/` module implements the formalism from `docs/formalism.md`:

- **Predicates**: Comparison (`attr(x) op value`), type, unary
- **Connectives**: Conjunction (∧), disjunction (∨), negation (¬)
- **Quantifiers**: ∀, ∃, exactly(k), at_least(k), at_most(k)
- **Neighborhoods**: N_k(x) for k-hop, N_{t₁.t₂}(x) for typed 2-hop paths
- **Topology**: degree, pagerank, k_core, louvain_community, structural_role
- **Learning**: FOIL-based beam search with Bernoulli LLR scoring

## Testing

```bash
pytest tests/ -v                              # All 249 tests
pytest tests/test_roundtrip.py -v             # Learn → parse → evaluate roundtrip
pytest tests/test_fol.py -v                   # FOL parser & evaluator
pytest tests/test_learning.py -v              # Learning pipeline
pytest tests/test_scoring.py -v               # Enrichment scoring
pytest tests/test_neighborhood.py -v          # Neighborhood literals
pytest tests/test_beam_search.py -v           # Beam search
pytest tests/test_disjunctive_learning.py -v  # Disjunctive mode
pytest tests/test_typed_neighborhoods.py -v   # Typed 2-hop paths
```

## Development

```bash
uv sync --dev         # Install with dev dependencies
ruff format src/      # Format code
ruff check --fix src/ # Lint with auto-fix
```
