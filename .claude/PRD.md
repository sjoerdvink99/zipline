# GraphBridge - Product Requirements Document

## 1) Abstract

Multivariate graph analysis requires analysts to reason across two fundamentally different representational spaces: the topological structure of a graph and the attribute characteristics of the data encoded in its nodes. Existing visualization tools mainly facilitate inspection within these spaces, but provide limited support for explicitly relating selections in one space to explanatory characteristics in the other. As a result, analysts must manually navigate and maintain these cross-space relationships during analysis. In this paper, we introduce a space-bridging approach that treats attribute and topology as distinct but equally important analytical spaces, and connects them through explicitly represented relational predicates grounded in first-order logic. These predicates make relationships between structural and attribute-based properties explicit, enabling cross-space constraints to be composed, inspected, and reused during analysis. We instantiate this approach in GraphBridge, a Visual Analytics system that supports exploration across representational spaces by deriving first-order predicate descriptions from user selections, revealing connections between topology, attributes, and higher-level patterns. We evaluate GraphBridge through three use-case studies with domain experts in structural biology, cybersecurity, and energy systems. The results demonstrate how coordinated exploration across representational spaces reduces manual coordination effort, supports discovery of non-obvious relationships, and produces reusable analytical artifacts that extend beyond a single exploration session.

## 2) Mission

**Primary Mission**: Publish the work as a paper in IEEE VIS, establishing a novel paradigm for multivariate graph analysis through predicate-based reasoning between representational spaces.

**Mission Statement**: Develop and validate GraphBridge as a Visual Analytics system that transforms implicit cross-space navigation into explicit, coordinated exploration, reducing manual coordination effort and enabling reusable analytical artifacts.

### Core Principles

1. **Two coordinated representational spaces in graph analytics**
   - **Topology Space**: Structural representation focusing on graph connectivity and topological patterns
   - **Attribute Space**: Node attributes represented as multidimensional data

2. **Space-bridging through descriptive predicates** - Automatically derive relational descriptions that explain selections in one space through characteristics in other spaces. These descriptions reveal non-obvious relationships and support coordinated exploration.

## 3) Target Users

### Primary persona: Graph analyst

- **Who**: Graph data analyst in one of the following domains: cybersecurity, structural biology, or power grids
- **Technical comfort**: Comfortable with data analysis, familiar with graphs, technologically savvy but not a programmer
- **Goals**:
  - Discover meaningful patterns and anomalies in complex network data that involve topology and attributes
  - Generate explanations for certain topological findings through predicates
  - Build reusable analytical workflows for recurring network analysis tasks
  - Validate hypotheses about network behavior and relationships
- **Pain points**:
  - Manual navigation between topology and attribute views loses analytical context
  - Difficulty maintaining mental model of cross-space relationships during exploration
  - Tedious coordination effort required to relate structural patterns to attribute characteristics
  - Analytical discoveries remain implicit and cannot be easily communicated or reused
  - No systematic way to build and reuse cross-space analytical vocabulary

## 4) MVP Scope

### In Scope

- **Three coordinated panels**:
  - **Topology Space**: Interactive graph visualization with node/edge selection and layout control
  - **Predicate Bridge**: Central coordination panel that generates descriptive predicates from selections and includes a predicate builder allowing users to combine predicates from different spaces
  - **Attribute Space**: Coordinated attribute filtering and exploration
- **Descriptive predicate generation** across topology and attribute spaces
- **Interactive filter builder** with drag-and-drop predicate composition
- **Cross-space coordination** with real-time highlighting and selection synchronization

### Out of Scope

- Sharing of findings to stakeholders

## 5) User Stories

For a description of the use-cases, go to `.claude/reference/use-cases.md`.

## 6) Core Architecture & Workflow

For the visual specification of the system, go to `.claude/reference/visual-spec.md`.

### Overall Workflow

1. User selects nodes/edges in either the topology or the attribute panel
2. Backend identifies topology and attribute predicates that describe the selection
3. Frontend displays these descriptive predicates in the predicate bridge panel
4. The user constructs predicate expressions by combining these descriptive predicates from both spaces
5. The user moves iteratively between topology space and attribute space, refining the expression through this back-and-forth process
6. The frontend translates this into our FOL-inspired language
7. When the user clicks evaluate, the expression is executed on the backend

### Predicate Compilation Architecture

The backend implements a sophisticated FOL compilation pipeline organized into distinct service layers:

**Compilation Pipeline** (`services/compiler/`):
- **FOL Parser** (`fol_parser.py`): Recursive descent parser for FOL syntax with template support
- **AST Builder** (`fol_ast.py`): Type-safe abstract syntax tree construction and evaluation
- **Formal Types** (`formal_types.py`): Type system for cross-space variable binding
- **Optimization** (`optimization.py`): Query optimization and performance tuning

**Evaluation Engine** (`services/evaluation/`):
- **FOL Evaluator** (`fol_evaluator.py`): Core FOL expression evaluation with performance metrics
- **Unified Evaluator** (`unified_evaluator.py`): Unified interface for all predicate types
- **Constraint Evaluator** (`constraint_evaluator.py`): Specialized constraint evaluation

**Fast Inference** (`services/inference/`):
- **Fast Inference Engine** (`fast_inference_engine.py`): <100ms predicate generation from selections
- **Precomputed Metrics** (`precomputed_metrics.py`): Cached topological metrics for performance
- **Quality Metrics** (`quality_metrics.py`): Coverage (70%) + Selectivity (30%) scoring

**Orchestration** (`predicate_service.py`): Main service coordinating all predicate operations with unified API for simple, cross-space, template, neighborhood, and legacy predicates.

## 7) Features

### 7.1 Topology Space Analysis

**Purpose:** Allow the visual analysis of the topological features of the graph

**Requirements:**

- Topology space panel that shows the graph through two views: graph view and schema view
- Graph view: Node-link diagram of the graph with several layout strategies possible (force-directed, k-partite, ...)
- Schema view: Schema visualization showing the graph in aggregated form by node type, allowing users to see which node types are connected
- Selections should be possible in both the graph view as well as the schema view through lasso and click

### 7.2 Attribute Space Analysis

**Purpose:** Analysis of the node attributes of the graph

**Requirements:**

- Attribute space panel that shows the attributes of the graph through two views: attribute distributions and UMAP
- Attribute distributions view: shows the attribute distributions of different node types
  - Users should be able to filter this down to only the node types they are interested in
  - Depending on the data type of the attribute, it shows a visualization of the distribution
  - Shift + click directly adds it as a predicate to the predicate builder
- UMAP view: shows a UMAP-based projection of the attributes, where point colors are based on node labels
  - Users should be able to select through lasso or click on nodes

### 7.3 Cross-Space Analysis

**Purpose:** Analyse both spaces together, and see interdependencies between them

**Requirements:**

- Users should be able to seamlessly move between these two spaces and see what features in one space mean in the other space
- Synchronized highlighting and selection across all panels

### 7.4 Predicate Construction

**Purpose:** Construct predicates in the predicate builder

**Requirements:**

- This feature is very much tied to the formalism in `.claude/reference/formalism.md`
- Upon selection in the topology or attribute space, we should show the predicates that describe these selections in the bottom part of the predicate bridge panel in the middle
- Users should be able to drag and drop predicates from there to the predicate builder and construct expressions by combining features from both spaces through set operations
- Quantified predicates over node neighborhoods, as introduced in the reference formalism file, with the ability to nest them to create complex structures
- Users should be able to run/evaluate the predicate expressions in the builder and see which nodes pass the predicate (by selecting them)
- Users must be able to save predicate expressions from the builder (saved to the right panel) and reuse them as pills in the predicate builder later

## 8) Technology Stack

### Frontend

- **React 19**: Component-based UI framework
- **TypeScript**: Type-safe development
- **PIXI.js**: WebGL-powered graph rendering
- **D3.js**: Layout algorithms and force simulations
- **Zustand**: Lightweight state management
- **Tailwind CSS**: Utility-first styling

### Backend

- **FastAPI**: High-performance Python API framework
- **NetworkX**: Graph data structures and algorithms
- **Pydantic**: Data validation and serialization
- **uvicorn**: ASGI server for REST API (no WebSocket - pure REST architecture)

### Core Innovation - FOL Engine

- **Recursive Descent Parser**: FOL syntax compilation to AST
- **Type-Safe Evaluator**: AST evaluation with cross-space variable binding
- **Fast Inference Engine**: <100ms predicate generation from selections
- **Comprehensive Test Suite**: 98 tests validating mathematical formalism

### Development

- **Vite**: Fast frontend build tooling
- **Bun**: JavaScript runtime and package manager
- **uv**: Python dependency management and virtual environments
- **pytest**: Backend testing framework with formalism validation
- **Ruff**: Python linting and formatting
- **Pre-commit hooks**: Automated code quality and test execution

## 9) Success Criteria

### Technical Success

- **Performance**: Handle graphs with 1000+ nodes and real-time interaction (<100ms response)
- **Cross-Space Coordination**: Seamless selection synchronization across all panels
- **Predicate Generation**: Automatic FOL predicate synthesis from user selections
- **Visual Quality**: WebGL rendering with smooth interactions and clear visual feedback

### User Experience Success

- **Intuitive Interaction**: Drag-and-drop predicate composition without FOL knowledge
- **Analytical Value**: Generate reusable cross-space insights and export artifacts

### Research Success

- **Publication**: Accept paper at IEEE VIS establishing cross-space navigation paradigm
- **Validation**: In the publication demonstrate effectiveness across multiple domains (use-cases described `.claude/reference/use-cases.md`)

## 10) Reference Documentation

For detailed implementation guidance, consult these key documents:

| Document                           | Purpose                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                        | Complete project overview, tech stack, architecture, conventions, and development workflows |
| `README.md`                        | Project overview and getting started guide                                                  |
| `.claude/reference/formalism.md`   | Formal mathematical specification of cross-space predicates and FOL semantics               |
| `.claude/reference/use-cases.md`   | Domain-specific use cases and example scenarios                                             |
| `.claude/reference/visual-spec.md` | Visual design specifications and interface guidelines                                       |
