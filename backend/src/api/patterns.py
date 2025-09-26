import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.pattern_models import (
    NodeSelection,
    Pattern,
    PatternCreate,
    PatternMatch,
    PatternSuggestion,
    PatternType,
)
from services.patterns.pattern_library import PatternLibrary
from services.patterns.pattern_matcher import PatternMatcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patterns", tags=["patterns"])

_pattern_library = PatternLibrary()
_pattern_matcher = PatternMatcher(_pattern_library)


def _initialize_domain_patterns() -> None:
    """Domain patterns have been removed - no initialization needed"""
    logger.info("Domain patterns initialization skipped (patterns removed)")


_initialize_domain_patterns()


def get_pattern_library() -> PatternLibrary:
    return _pattern_library


def get_pattern_matcher() -> PatternMatcher:
    return _pattern_matcher


@router.get("/", response_model=list[Pattern])
async def get_patterns(
    domain: str | None = None,
    pattern_type: PatternType | None = None,
    pattern_library: PatternLibrary = Depends(get_pattern_library),
) -> list[Pattern]:
    try:
        if domain:
            patterns = pattern_library.get_domain_patterns(domain)
        else:
            patterns = pattern_library.get_all_patterns()

        if pattern_type:
            patterns = [p for p in patterns if p.pattern_type == pattern_type]

        return patterns
    except Exception as e:
        logger.error(f"Error fetching patterns: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch patterns") from e


@router.get("/templates", response_model=list[Pattern])
async def get_pattern_templates(
    domain: str | None = None,
    pattern_library: PatternLibrary = Depends(get_pattern_library),
) -> list[Pattern]:
    try:
        patterns = pattern_library.get_all_patterns()
        templates = [p for p in patterns if not p.node_ids]

        if domain:
            templates = [p for p in templates if p.domain == domain]

        return templates
    except Exception as e:
        logger.error(f"Error fetching pattern templates: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch pattern templates"
        ) from e


@router.get("/domains", response_model=list[str])
async def get_domains(
    pattern_library: PatternLibrary = Depends(get_pattern_library),
) -> list[str]:
    try:
        return pattern_library.get_domain_list()
    except Exception as e:
        logger.error(f"Error fetching domains: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch domains") from e


@router.get("/{pattern_id}", response_model=Pattern)
async def get_pattern(
    pattern_id: str, pattern_library: PatternLibrary = Depends(get_pattern_library)
) -> Pattern:
    try:
        pattern = pattern_library.get_pattern_by_id(pattern_id)
        if not pattern:
            raise HTTPException(status_code=404, detail="Pattern not found")
        return pattern
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch pattern") from e


@router.post("/", response_model=Pattern)
async def create_pattern(
    pattern_data: PatternCreate,
    pattern_library: PatternLibrary = Depends(get_pattern_library),
) -> Pattern:
    try:
        pattern = pattern_library.save_pattern(pattern_data)
        logger.info(f"Created pattern: {pattern.id}")
        return pattern
    except Exception as e:
        logger.error(f"Error creating pattern: {e}")
        raise HTTPException(status_code=500, detail="Failed to create pattern") from e


@router.put("/{pattern_id}", response_model=Pattern)
async def update_pattern(
    pattern_id: str,
    updates: dict[str, Any],
    pattern_library: PatternLibrary = Depends(get_pattern_library),
) -> Pattern:
    try:
        pattern = pattern_library.update_pattern(pattern_id, updates)
        if not pattern:
            raise HTTPException(status_code=404, detail="Pattern not found")

        logger.info(f"Updated pattern: {pattern_id}")
        return pattern
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update pattern") from e


@router.delete("/{pattern_id}", response_model=dict[str, str])
async def delete_pattern(
    pattern_id: str, pattern_library: PatternLibrary = Depends(get_pattern_library)
) -> dict[str, str]:
    try:
        success = pattern_library.delete_pattern(pattern_id)
        if not success:
            raise HTTPException(status_code=404, detail="Pattern not found")

        logger.info(f"Deleted pattern: {pattern_id}")
        return {"message": "Pattern deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete pattern") from e


@router.post("/match", response_model=list[PatternMatch])
async def find_pattern_matches(
    selection: NodeSelection,
    threshold: float = 0.7,
    pattern_matcher: PatternMatcher = Depends(get_pattern_matcher),
) -> list[PatternMatch]:
    try:
        matches = pattern_matcher.find_similar_patterns(
            selected_nodes=selection.node_ids, threshold=threshold
        )
        logger.info(f"Found {len(matches)} pattern matches for selection")
        return matches
    except Exception as e:
        logger.error(f"Error finding pattern matches: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to find pattern matches"
        ) from e


@router.post("/suggestions", response_model=list[PatternSuggestion])
async def get_pattern_suggestions(
    selection: NodeSelection,
    pattern_matcher: PatternMatcher = Depends(get_pattern_matcher),
) -> list[PatternSuggestion]:
    try:
        suggestions = pattern_matcher.suggest_patterns(selection)
        logger.info(f"Generated {len(suggestions)} pattern suggestions")
        return suggestions
    except Exception as e:
        logger.error(f"Error generating pattern suggestions: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to generate suggestions"
        ) from e


@router.get("/search/{query}", response_model=list[Pattern])
async def search_patterns(
    query: str, pattern_library: PatternLibrary = Depends(get_pattern_library)
) -> list[Pattern]:
    try:
        results = pattern_library.search_patterns(query)
        logger.info(f"Found {len(results)} patterns matching query: {query}")
        return results
    except Exception as e:
        logger.error(f"Error searching patterns: {e}")
        raise HTTPException(status_code=500, detail="Failed to search patterns") from e


@router.post("/validate/{pattern_id}", response_model=dict[str, Any])
async def validate_pattern(
    pattern_id: str,
    node_ids: list[str],
    pattern_library: PatternLibrary = Depends(get_pattern_library),
    pattern_matcher: PatternMatcher = Depends(get_pattern_matcher),
) -> dict[str, Any]:
    try:
        pattern = pattern_library.get_pattern_by_id(pattern_id)
        if not pattern:
            raise HTTPException(status_code=404, detail="Pattern not found")

        validation = pattern_matcher.validate_pattern_match(
            pattern=pattern, node_ids=node_ids
        )

        return validation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate pattern") from e
