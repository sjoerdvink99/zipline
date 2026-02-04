# ZipLine

ZipLine is a **visual analytics system for interactive graph explanation**. Given a multivariate graph, analysts can **select a set of nodes, receive a formal first-order-logic explanation of what characterises that selection, refine the selection based on the explanation, and re-explain** — iterating until they have discovered and articulated the complex pattern they were looking for.

The system bridges three representational spaces — graph topology, node attributes, and their logical combinations — through **explicit, inspectable, and reusable predicate expressions**. All coordination between views is mediated by predicate evaluation, replacing implicit mental coordination with transparent reasoning artefacts grounded in formal logic.

## Reference Documentation

| Document                                        | Purpose                                                |
| ----------------------------------------------- | ------------------------------------------------------ |
| `.claude/reference/formalism.md`                | **Source of truth** — formal semantics and constraints |
| `.claude/reference/predicate-learning.md`       | Predicate learning algorithm (FOIL-based)              |
| `.claude/reference/visual-spec.md`              | Visual interface specification                         |
| `.claude/reference/visual-predicate-builder.md` | Visual predicate builder component                     |
| `.claude/reference/use-cases/summary.md`        | Domain use cases (cybersecurity, biology, energy)      |

## Tech Stack

**Backend**: Python 3.10+, FastAPI, NetworkX, Pydantic
**Frontend**: React 19, TypeScript, PIXI.js 8, D3.js, Zustand, Tailwind CSS, Vite

## Project Structure

```
ZipLine/
├── backend/
│   └── src/
│       ├── app.py                  # FastAPI application
│       ├── api/                    # REST endpoints
│       │   ├── datasets.py         # Dataset management
│       │   ├── attributes.py       # Attribute distributions & UMAP
│       │   ├── topology.py         # Graph elements, search, schema, paths
│       │   ├── fol.py              # FOL evaluation & inference
│       │   └── learning.py         # Predicate learning endpoints
│       ├── fol/                    # FOL engine
│       │   ├── ast.py              # AST nodes (predicates, connectives, quantifiers)
│       │   ├── parser.py           # Recursive descent parser
│       │   ├── evaluator.py        # Predicate evaluation against graphs
│       │   ├── inference.py        # Predicate inference from selections
│       │   ├── schema.py           # Edge schema extraction & 2-hop path enumeration
│       │   ├── topology.py         # Pre-computed topology metrics
│       │   └── learning/           # FOIL-based predicate learning
│       │       ├── learner.py      # ExplanationLearner (conjunctive, disjunctive, contrastive)
│       │       ├── beam_search.py  # Beam search with deduplication & diversification
│       │       ├── scoring.py      # Bernoulli LLR scoring, marginal gain
│       │       ├── literal_generator.py  # Literal generation with quality filtering
│       │       ├── neighborhood_index.py # Neighborhood evaluation & typed adjacency
│       │       ├── threshold_finder.py   # Enrichment-driven threshold selection
│       │       └── feature_filter.py     # Feature filtering utilities
│       ├── models/                 # Pydantic data models
│       ├── services/               # Business logic (evaluation, distributions, paths)
│       ├── core/                   # Dataset management, dependency injection
│       └── utils/                  # Logging, node validation
│   └── tests/                      # 249 tests
├── frontend/
│   └── src/
│       ├── components/             # UI (panels, predicate-builder, results, topology, ui)
│       ├── api/                    # Backend API integration
│       ├── store/                  # Zustand state management
│       ├── hooks/                  # React hooks (validation, learning, schema)
│       ├── types/                  # TypeScript definitions
│       └── utils/                  # FOL formatting, colors, persistence, quadtree
├── data/                           # Sample datasets (BRON, PrimeKG, TenneT NH)
├── docs/                           # Documentation
└── scripts/                        # Data processing scripts
```

## Commands

```bash
make setup          # Install all dependencies
make dev            # Run full dev environment
make dev-backend    # Backend only (port 8000)
make dev-frontend   # Frontend only (port 5173)
make test           # Run all tests (249)
make lint           # Code quality checks
make format         # Format backend code
```

## FOL Engine (`backend/src/fol/`)

Complete first-order logic engine aligned with the formalism:

| Module         | Purpose                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `ast.py`       | AST nodes — `ComparisonPredicate`, `TypePredicate`, `UnaryPredicate`, `NeighborhoodQuantifier`, connectives |
| `parser.py`    | Recursive descent parser for FOL expressions                                                                |
| `evaluator.py` | Predicate evaluation against NetworkX graphs                                                                |
| `inference.py` | Predicate inference from node selections                                                                    |
| `schema.py`    | Edge schema extraction, 2-hop path enumeration with sibling filtering                                       |
| `topology.py`  | Pre-computed topology metrics (degree, pagerank, k_core, louvain_community, structural_role)                |
| `learning/`    | FOIL-based predicate learning from selections                                                               |

### Formalism Alignment

| Formalism Concept        | Implementation                                                      |
| ------------------------ | ------------------------------------------------------------------- |
| G = (V, E, A)            | NetworkX graph with node attributes                                 |
| Logical connectives      | `Conjunction`, `Disjunction`, `Negation` AST nodes                  |
| Neighborhood N_k(x)      | `NeighborhoodQuantifier` with k-hop support                         |
| Cardinality operators    | `exactly(k)`, `at_least(k)`, `at_most(k)` quantifiers               |
| Array membership         | `ComparisonPredicate` with list-aware equality: `attr(x) = "value"` |
| Type predicates          | `ComparisonPredicate`: `node_type(x) = "protein"`                   |
| Schema-constrained paths | `N_{t1.t2}(x)` with sibling bridge exclusion                        |
| Result structure         | `SetComprehension` for `{ (x, y) \| P(x, y) }`                      |

## API Endpoints

### Datasets

```
GET  /api/datasets                         # List available datasets
POST /api/datasets/{name}/load             # Load a dataset
GET  /api/datasets/current                 # Get current dataset
POST /api/datasets/switch                  # Switch active dataset
```

### Graph & Topology

```
GET  /api/graph/elements                   # Nodes + edges
GET  /api/graph/schema                     # Edge-type schema
POST /api/graph/search                     # Full-text node search
POST /api/graph/find_paths                 # Constrained path finding
GET  /api/graph/neighbor_values            # Neighbor attribute values
POST /api/graph/paths/find                 # PathFinder service
GET  /api/graph/validate_neighbor_constraint
```

### Attributes

```
GET  /api/attributes/distributions         # Attribute histograms
GET  /api/attributes/umap                  # UMAP embedding coordinates
```

### Predicate Evaluation & Inference

```
POST /api/predicates/evaluate-fol          # Evaluate FOL expression
POST /api/predicates/apply                 # Apply predicate, return matching nodes
POST /api/predicates/describe              # Infer predicates from selection
POST /api/predicates/infer-selection-predicates
GET  /api/predicates/lifted                # Get lifted array predicates
```

### Predicate Learning

```
POST /api/predicates/learn/explanations    # Conjunctive explanation learning
POST /api/predicates/learn/quick           # Same with default hyperparameters
POST /api/predicates/learn/contrastive     # Contrastive learning (explicit S-)
POST /api/predicates/learn/disjunctive     # Disjunctive learning (marginal-gain)
```

## Code Conventions

### Backend (Python)

- Pydantic models for all data validation
- NetworkX graphs as primary data structure
- Type hints on all functions
- Uses `uv` for dependency management

### Frontend (TypeScript)

- Component-based architecture
- PIXI.js for WebGL graph rendering
- Zustand for state management
- Tailwind CSS (no separate CSS files)

## Testing

```bash
cd backend && pytest tests/ -v              # All 249 tests
cd backend && pytest tests/test_roundtrip.py -v  # Learn -> parse -> evaluate roundtrip
cd backend && pytest tests/test_fol.py -v   # FOL parser & evaluator
```
