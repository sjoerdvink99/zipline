# GraphBridge Formalism

This document specifies the **formal semantics and constraints** underlying **GraphBridge**. It is intended as a precise, implementation-oriented reference for autonomous coding agents and system developers. The formalism mirrors the concepts and guarantees described in the GraphBridge paper and intentionally avoids features outside its analytical scope.

## 1. Data Model and Representational Spaces

### 1.1 Multivariate Graph Model

GraphBridge operates on **multivariate graphs** that encode relational structure together with node attributes.

A graph is defined as:

**G = (V, E, A)**

- **V**: set of nodes
- **E ⊆ V × V**: set of edges
- **A : V → D**: attribute function mapping each node to a tuple of attribute values

Only **node attributes** are considered. Edge attributes, temporal dynamics, and hyperedges are out of scope.

### 1.2 Attribute Space

The **attribute space** consists of properties explicitly stored on nodes via **A**.

- Attributes describe intrinsic properties of nodes
- Independent of graph structure
- Supported types:
  - Numerical
  - Categorical
  - Boolean

**Examples**

- `category ∈ {protein, enzyme}`
- `molecular_weight ∈ ℝ⁺`
- `active ∈ {true, false}`

### 1.3 Topology Space

The **topology space** consists of properties derived from **(V, E)**.

- Computed, not stored
- Describe connectivity and local structure

**Examples**

- `degree(v)`
- `centrality(v)`
- `clustering_coefficient(v)`

## 2. Predicates and First-Order Logic

GraphBridge bridges attribute and topology spaces using **explicit relational predicates grounded in first-order logic (FOL)**.

### 2.1 Predicates

A **predicate** is a Boolean-valued function over graph entities.

**Examples**

- `category(x, "protein")`
- `degree(x) > 5`
- `active(x)`

Predicates may be combined using:

- Conjunction (`∧`)
- Disjunction (`∨`)
- Negation (`¬`)

### 2.2 Quantifiers

Supported base quantifiers:

- **Universal (∀)**
  `∀y ∈ neighbors(x) : active(y)`

- **Existential (∃)**
  `∃y ∈ neighbors(x) : enzyme(y)`

Quantifiers are always **bounded** to node neighborhoods.

## 3. Cross-Space Predicate Composition

### 3.1 Single-Space Predicates

Operate entirely within one space.

- Attribute-only: `category(x, "protein")`
- Topology-only: `degree(x) > 5`

### 3.2 Cross-Space Predicates

Cross-space predicates are formed by composing attribute and topology predicates.

**Example**

```
degree(x) > 5 ∧ category(x, "protein")
```

These predicates:

- Explicitly encode relationships between structure and attributes
- Are inspectable, composable, and reusable
- Replace implicit mental coordination during analysis

### 3.3 Array Membership Operations

**Array Attributes**: Many node attributes are arrays rather than scalar values (e.g., `platforms`, `aliases`, `tactics`).

**Membership Syntax**: Use the `in` operator for array membership testing:

```
x.platforms in "Linux"     // Check if "Linux" is in the platforms array
x.aliases in "Thrip"       // Check if "Thrip" is in the aliases array
x.tactics in "persistence" // Check if "persistence" is in the tactics array
```

**Examples**:
- `x.platforms in "Linux" ∧ x.node_type = "technique"` (Linux techniques)
- `x.aliases in "Thrip" ∧ x.node_type = "threat_actor"` (Thrip threat actor)

**Important**: Do NOT use `=` for array membership. Use `in` for checking if a value exists within an array attribute.

## 4. Cardinality Constraints on Neighborhoods

### 4.1 Motivation

Standard FOL quantifiers are insufficient for common graph constraints involving counts.

### 4.2 Counting Quantifiers

GraphBridge extends FOL with **three bounded counting quantifiers**:

#### exactly(k)

```
exactly(2) y ∈ neighbors(x) : amino_acid_type(y, "HIS")
```

#### at_least(k)

```
at_least(10) y ∈ neighbors(x) : verified_status(y, true)
```

#### at_most(k)

```
at_most(3) y ∈ neighbors(x) : actor_type(y, "apt")
```

### 4.3 Semantics

- Cardinality constraints apply to a **primary entity**
- Neighbor variables act only as constraint witnesses
- No projection occurs by default
- Fully composable with other predicates

### 4.4 Real-World Example

**Combined Array Membership and Quantifiers**:

```
x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x) : y.node_type = "threat_actor" ∧ y.aliases in "Thrip"
```

This predicate finds nodes (x) that:
1. Have "Linux" in their platforms array AND
2. Have at least one neighbor (y) that is a threat actor with "Thrip" in their aliases array

**Result**: Linux techniques connected to the Thrip threat actor group.

## 5. Projection Semantics

### 5.1 Default Projection

By default, a pattern returns **only primary entities** that satisfy the predicate.

- Neighbor variables are not returned
- Equivalent to projection in relational algebra

### 5.2 Optional Projection

Projection may be enabled to return relational structure.

**Example**

```
exactly(2) y ∈ neighbors(x) : enzyme(y)
∧ at_least(1) z ∈ neighbors(x) : inhibitor(z)
```

Returns:

- Central node `x`
- Two enzyme neighbors
- One or more inhibitor neighbors

Results are **structured relational artifacts**, not flat node sets.

## 6. Deterministic Semantics

- Predicate evaluation is deterministic
- Projection results are deterministic
- Output depends only on:
  - Graph G
  - Predicate structure
  - Projection configuration

Semantics are independent of visualization, interaction order, or execution strategy.

## 7. Scope and Constraints

GraphBridge intentionally supports:

- Bounded relational patterns only
- No recursion or unbounded path enumeration
- Node attributes only
- Fixed or slowly evolving schemas

These constraints preserve interpretability, composability, and analytical clarity.
