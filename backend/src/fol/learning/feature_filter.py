from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class FeatureFilter:
    _IDENTITY_ATTRS = frozenset(
        {
            "id",
            "label",
            "display_name",
            "name",
            "title",
            "node_id",
            "node_name",
            "node_label",
        }
    )

    _EXTERNAL_ID_ATTRS = frozenset(
        {
            "mitre_id",
            "external_id",
            "source_id",
            "ref",
            "reference",
            "uid",
            "uuid",
            "uri",
            "url",
            "href",
            "link",
            "doi",
            "pmid",
            "ensembl_id",
            "uniprot_id",
            "drugbank_id",
            "chebi_id",
            "mesh_id",
            "omim_id",
            "kegg_id",
            "hmdb_id",
        }
    )

    _INDEX_ATTRS = frozenset(
        {
            "node_index",
            "index",
            "idx",
            "row",
            "row_id",
            "sort_order",
        }
    )

    _TEXT_ATTRS = frozenset(
        {
            "description",
            "desc",
            "summary",
            "notes",
            "comment",
            "comments",
            "abstract",
            "text",
            "body",
            "content",
            "definition",
        }
    )

    _TEMPORAL_ATTRS = frozenset(
        {
            "created",
            "modified",
            "updated",
            "deleted",
            "created_at",
            "updated_at",
            "modified_at",
            "deleted_at",
            "timestamp",
            "date",
            "datetime",
            "time",
            "first_seen",
            "last_seen",
            "start_date",
            "end_date",
            "last_modified",
        }
    )

    _LAYOUT_ATTRS = frozenset(
        {
            "pos",
            "x",
            "y",
            "z",
            "fx",
            "fy",
            "latitude",
            "longitude",
            "lat",
            "lon",
            "lng",
            "color",
            "colour",
            "fill",
            "stroke",
            "size",
            "radius",
            "width",
            "height",
            "font_size",
            "font_color",
            "opacity",
            "visible",
            "shape",
            "icon",
            "image",
            "thumbnail",
        }
    )

    _CLUSTER_ATTRS = frozenset(
        {
            "cluster_id",
            "community",
            "community_id",
            "partition",
        }
    )

    _TAG_ATTRS = frozenset(
        {
            "tags",
            "tag",
        }
    )

    EXCLUDED_ATTRIBUTES: frozenset[str] = (
        _IDENTITY_ATTRS
        | _EXTERNAL_ID_ATTRS
        | _INDEX_ATTRS
        | _TEXT_ATTRS
        | _TEMPORAL_ATTRS
        | _LAYOUT_ATTRS
        | _CLUSTER_ATTRS
        | _TAG_ATTRS
    )

    _IDENTIFIER_SUFFIXES = (
        "_id",
        "_ids",
        "_name",
        "_names",
        "_url",
        "_uri",
        "_path",
        "_hash",
        "_key",
        "_ref",
        "_link",
        "_uuid",
    )

    def __init__(
        self,
        max_categorical_uniqueness: float = 0.5,
        max_numeric_uniqueness: float = 0.9,
        min_value_frequency: int = 2,
        min_nodes_for_cardinality_check: int = 30,
        extra_excluded: set[str] | None = None,
    ):
        self.max_categorical_uniqueness = max_categorical_uniqueness
        self.max_numeric_uniqueness = max_numeric_uniqueness
        self.min_value_frequency = min_value_frequency
        self.min_nodes_for_cardinality_check = min_nodes_for_cardinality_check

        if extra_excluded:
            self._excluded = self.EXCLUDED_ATTRIBUTES | frozenset(extra_excluded)
        else:
            self._excluded = self.EXCLUDED_ATTRIBUTES

    def is_excluded_by_name(self, attr_name: str) -> bool:
        lower = attr_name.lower()

        if lower in self._excluded:
            return True

        for suffix in self._IDENTIFIER_SUFFIXES:
            if lower.endswith(suffix):
                return True

        return False

    def is_categorical_identifier(
        self,
        attr_name: str,
        value_counts: dict[Any, int],
        n_nodes: int,
    ) -> bool:
        if n_nodes == 0:
            return True

        if n_nodes < self.min_nodes_for_cardinality_check:
            return False

        n_unique = len(value_counts)
        ratio = n_unique / n_nodes

        if ratio > self.max_categorical_uniqueness:
            logger.debug(
                "Excluding categorical attribute '%s': uniqueness ratio %.2f "
                "(threshold %.2f, %d unique / %d nodes)",
                attr_name,
                ratio,
                self.max_categorical_uniqueness,
                n_unique,
                n_nodes,
            )
            return True

        return False

    def is_numeric_identifier(
        self,
        attr_name: str,
        values: dict[str, float],
        n_nodes: int,
    ) -> bool:
        if not values:
            return True

        n_observed = len(values)

        if n_observed == 0:
            return True

        if n_observed < self.min_nodes_for_cardinality_check:
            return False

        n_unique = len(set(values.values()))
        ratio = n_unique / n_observed

        if ratio > self.max_numeric_uniqueness:
            logger.debug(
                "Excluding numeric attribute '%s': uniqueness ratio %.2f "
                "(threshold %.2f, %d unique / %d observed)",
                attr_name,
                ratio,
                self.max_numeric_uniqueness,
                n_unique,
                n_observed,
            )
            return True

        return False

    def filter_categorical_values(
        self,
        value_to_nodes: dict[Any, set[str]],
    ) -> dict[Any, set[str]]:
        if len(value_to_nodes) < self.min_nodes_for_cardinality_check:
            return value_to_nodes

        return {
            val: nodes
            for val, nodes in value_to_nodes.items()
            if len(nodes) >= self.min_value_frequency
        }
