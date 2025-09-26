from __future__ import annotations

from .graph_models import (
    HopConstraint,
    NodeSearchRequest,
    PathQueryRequest,
    SearchResult,
)
from .predicate_models import (
    AttributePredicate,
    AttributePredicateResponse,
    CrossSpaceFilterResult,
    PredicateEvaluationRequest,
    PredicateEvaluationResponse,
    PredicateEvaluationResult,
    PredicateInferenceResult,
    PredicateQuality,
    PredicateResponse,
    ProjectionResultModel,
    SelectionPredicateRequest,
    SelectionPredicateResponse,
    TopologyPredicate,
    TopologyPredicateResponse,
)
from .predicate_requests import (
    ApplyPredicatesRequest,
    AttributePredicateRequest,
    CompositeFilterRequest,
    CrossSpacePredicateRequest,
    FilterChainRequest,
    FOLFilterRequest,
    LegacyPredicateRequest,
    NeighborhoodPredicateRequest,
    PatternFilterRequest,
    SimplePredicateRequest,
    TemplatePredicateRequest,
    TopologyPredicateRequest,
)
from .predicate_responses import (
    ApplyPredicatesResponse,
    CrossSpacePredicateResponse,
    FilterChainResponse,
    ProjectionResultResponse,
    SimplePredicateResponse,
    TemplateListResponse,
)
from .schemas import (
    Link,
    Node,
    NodeLinkGraph,
    PropertyEdge,
    PropertyGraph,
    PropertyNode,
)

__all__ = [
    # Graph models
    "HopConstraint",
    "PathQueryRequest",
    "NodeSearchRequest",
    "SearchResult",
    # Predicate models
    "ProjectionResultModel",
    "PredicateEvaluationResult",
    "PredicateEvaluationRequest",
    "PredicateEvaluationResponse",
    "SelectionPredicateRequest",
    "PredicateResponse",
    "AttributePredicateResponse",
    "TopologyPredicateResponse",
    "SelectionPredicateResponse",
    "PredicateQuality",
    "AttributePredicate",
    "TopologyPredicate",
    "PredicateInferenceResult",
    "CrossSpaceFilterResult",
    # Predicate requests
    "SimplePredicateRequest",
    "LegacyPredicateRequest",
    "CompositeFilterRequest",
    "AttributePredicateRequest",
    "TopologyPredicateRequest",
    "FilterChainRequest",
    "NeighborhoodPredicateRequest",
    "CrossSpacePredicateRequest",
    "TemplatePredicateRequest",
    "FOLFilterRequest",
    "ApplyPredicatesRequest",
    "PatternFilterRequest",
    # Predicate responses
    "SimplePredicateResponse",
    "FilterChainResponse",
    "ProjectionResultResponse",
    "CrossSpacePredicateResponse",
    "TemplateListResponse",
    "ApplyPredicatesResponse",
    # Schemas
    "PropertyNode",
    "PropertyEdge",
    "PropertyGraph",
    "Node",
    "Link",
    "NodeLinkGraph",
]
