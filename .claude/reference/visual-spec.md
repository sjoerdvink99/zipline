# GraphBridge Visual Specification

This document specifies the visual interface structure of **GraphBridge**. It provides a concise description of the three coordinated panels that operationalize predicate-based cross-space graph analysis. The intent is to inform autonomous coding agents about the visual roles, responsibilities, and coordination logic of each panel.

## Overview

GraphBridge is organized as a three-panel horizontal layout:

1. Topology Panel (left)
2. Predicate Bridge Panel (center)
3. Attribute Panel (right)

Each panel corresponds to a specific representational role and is coordinated through explicit predicate evaluation rather than implicit filtering alone.

## 1. Topology Panel

The Topology Panel represents the topology space of the graph. It supports inspection of graph structure, connectivity, and local neighborhoods.

**Visual Encoding:**

- Graph view: Node-link diagram with several layout options (force-directed, radial, k-partite)
- Schema view: Graph aggregated by node type, displaying the graph schema through a node-link diagram
- Edges encode adjacency only

**Supported Interactions:**

- Node selection (single selection by clicking and multi-select by shift clicking)
- Neighborhood selection with lasso (shift + drag lasso)
- Highlighting of nodes satisfying predicates when selecting

## 2. Predicate Bridge Panel

### Purpose

The Predicate Bridge Panel serves as the explicit coordination layer between representational spaces. It displays predicates induced from interaction and their composition into analytical patterns in the predicate builder.

**Visual Encoding:**

- **Predicate Cards**: Structured display of topology and attribute predicates with quality metrics and coverage information
- **Interactive Filter Builder**: Visual drag-and-drop composition of FOL expressions
  - **Predicate Pills**: Color-coded pills for topology (blue) and attribute (green) predicates
  - **Logical Operators**: Visual AND/OR/NOT composition with operator buttons
  - **Neighborhood Constraints**: Specialized blocks for quantified predicates with counting support
  - **FOL Display**: Real-time FOL expression generation and syntax highlighting
  - **Results Integration**: Live validation, error display, and result visualization
- **Pattern Management**: Save, load, and reuse composed predicate patterns
- **Fast Inference Integration**: <100ms predicate generation from selections with quality scoring

**Supported Interactions:**

- **Predicate Inspection**: View generated topology and attribute predicates from selections
- **Drag-and-Drop Composition**: Build complex expressions by dragging predicates to filter builder
- **Neighborhood Constraints**: Configure quantifiers (EXACTLY, AT_LEAST, AT_MOST) and relations
- **Real-time Evaluation**: Execute composed predicates and view matching nodes immediately
- **Pattern Persistence**: Save successful patterns for reuse across analysis sessions
- **Cross-Space Coordination**: Automatic highlighting and selection synchronization

## 3. Attribute Panel

The Attribute Panel represents the attribute space of the graph. It supports inspection and filtering of node attributes across types.

**Visual Encoding:**

- Two views: attribute distributions and UMAP
  - Attribute distributions show histograms, bar charts, etc., depending on the data type
  - UMAP shows a projection of the attributes (point colors based on node type)

**Supported Interactions:**

- Filter by node type in the attribute distribution view to focus attention
- Search through attribute values using a search bar when the number of unique values is high
- Brushing and filtering attribute ranges
- Shift clicking directly adds a predicate to the predicate builder
- Highlighting entities satisfying attribute predicates

## Coordination and Interaction Semantics

- Panels are coordinated through predicate evaluation, not direct filtering.
- Interaction in any panel:
  1. Induces one or more predicates
  2. Displays those predicates in the Predicate Bridge Panel
  3. Updates visual feedback across all panels based on predicate satisfaction
- No panel independently determines the result set.

## Design Principles

- Explicit separation of attribute space and topology space
- Predicate-based coordination across views
- Deterministic visual state derived from predicate structure
- Support for reusable and inspectable analytical patterns

## Scope and Limitations

- The visual specification assumes static node attributes
- Edge attributes are not visualized
- Temporal dynamics are not represented
- The design prioritizes interpretability over visual density
