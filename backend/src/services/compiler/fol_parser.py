import re
import time
from typing import Any

from utils.logging_config import LogContext, get_logger

from .fol_ast import (
    AtomicPredicate,
    ComparisonOperator,
    CompoundPredicate,
    CrossSpacePredicate,
    FOLPredicateAST,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
    Relation,
    Variable,
)

logger = get_logger("fol.parser")


class ParseError(Exception):
    pass


class FOLPredicateParser:
    def __init__(self):
        self.tokens = []
        self.position = 0

    def parse(self, predicate_str: str) -> CrossSpacePredicate:
        start_time = time.time()

        with LogContext(logger, predicate_input=predicate_str):
            logger.info(
                "🔄 Starting FOL predicate parsing",
                extra={
                    "predicate_length": len(predicate_str),
                    "complexity": predicate_str.count("∧")
                    + predicate_str.count("∨")
                    + predicate_str.count("∀")
                    + predicate_str.count("∃"),
                },
            )

            self.tokens = self._tokenize(predicate_str)
            self.position = 0

            logger.debug(
                "📝 Tokenization complete",
                extra={"tokens": self.tokens, "token_count": len(self.tokens)},
            )

            try:
                ast = self._parse_expression()
                description = f"Cross-space: {ast.to_string()}"
                predicate = CrossSpacePredicate(ast, description)

                parse_time = (time.time() - start_time) * 1000
                logger.info(
                    "✅ FOL predicate parsing successful",
                    extra={
                        "parse_time_ms": round(parse_time, 2),
                        "ast_type": type(ast).__name__,
                        "description": description,
                    },
                )

                return predicate

            except Exception as e:
                parse_time = (time.time() - start_time) * 1000
                logger.error(
                    "❌ FOL predicate parsing failed",
                    extra={
                        "parse_time_ms": round(parse_time, 2),
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "position": self.position,
                        "remaining_tokens": self.tokens[self.position :]
                        if self.position < len(self.tokens)
                        else [],
                    },
                )
                raise ParseError(
                    f"Failed to parse predicate: {predicate_str}. Error: {e}"
                ) from e

    def _tokenize(self, text: str) -> list[str]:
        patterns = [
            r"∀|forall|ALL",
            r"∃|exists|SOME",
            r"EXACTLY\(\d+\)",
            r"AT_LEAST\(\d+\)",
            r"AT_MOST\(\d+\)",
            r"neighbors|k_hop_neighbors|connected_components",
            r"∧|and|AND",
            r"∨|or|OR",
            r"¬|not|NOT",
            r"∈|in",
            r"~=|>=|<=|!=|=|>|<",
            r"\d+\.?\d*",
            r'\'[^\']*\'|"[^"]*"',
            r"\w+\.\w+",
            r"\w+",
            r"[\(\),:\[\].]",
            r"\s+",
        ]

        pattern = "|".join(f"({p})" for p in patterns)
        tokens = []

        for match in re.finditer(pattern, text):
            token = match.group().strip()
            if token and not token.isspace():
                tokens.append(token)

        return tokens

    def _peek(self) -> str | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def _consume(self) -> str | None:
        token = self._peek()
        if token:
            self.position += 1
        return token

    def _expect(self, expected: str) -> str:
        token = self._consume()
        if token != expected:
            raise ParseError(f"Expected '{expected}', got '{token}'")
        return token

    def _parse_expression(self) -> FOLPredicateAST:
        return self._parse_or_expression()

    def _parse_or_expression(self) -> FOLPredicateAST:
        left = self._parse_and_expression()

        while self._peek() in ["∨", "or", "OR"]:
            self._consume()
            right = self._parse_and_expression()
            left = CompoundPredicate(LogicalConnective.OR, [left, right])

        return left

    def _parse_and_expression(self) -> FOLPredicateAST:
        left = self._parse_not_expression()

        while self._peek() in ["∧", "and", "AND"]:
            self._consume()
            right = self._parse_not_expression()
            left = CompoundPredicate(LogicalConnective.AND, [left, right])

        return left

    def _parse_not_expression(self) -> FOLPredicateAST:
        if self._peek() in ["¬", "not", "NOT"]:
            self._consume()
            expr = self._parse_not_expression()
            return CompoundPredicate(LogicalConnective.NOT, [expr])

        return self._parse_primary_expression()

    def _parse_primary_expression(self) -> FOLPredicateAST:
        if self._peek() == "(":
            self._consume()
            expr = self._parse_expression()
            self._expect(")")
            return expr

        if self._peek() in ["∀", "forall", "ALL", "∃", "exists", "SOME"] or (
            self._peek() and self._peek().startswith(("EXACTLY", "AT_LEAST", "AT_MOST"))
        ):
            return self._parse_quantified_predicate()

        return self._parse_atomic_predicate()

    def _parse_quantified_predicate(self) -> QuantifiedPredicate:
        logger.debug(
            "🔍 Parsing quantified predicate",
            extra={
                "current_position": self.position,
                "upcoming_tokens": self.tokens[self.position : self.position + 5],
            },
        )

        quantifier_token = self._consume()
        quantifier, count_param = self._parse_quantifier(quantifier_token)

        logger.debug(
            "📊 Parsed quantifier",
            extra={"quantifier": quantifier.name, "count_param": count_param},
        )

        variable_name = self._consume()
        if not variable_name:
            raise ParseError("Expected variable name after quantifier")

        type_constraint = None
        if self._peek() == ":":
            self._consume()
            type_constraint = self._consume()

        self._expect("∈" if "∈" in self.tokens else "in")

        relation, target, k_param = self._parse_relation()

        logger.debug(
            "🔗 Parsed relation",
            extra={"relation": relation.name, "target": target, "k_param": k_param},
        )

        self._expect(":")

        constraint = self._parse_expression()

        predicate = QuantifiedPredicate(
            quantifier=quantifier,
            variable=Variable(variable_name, type_constraint),
            relation=relation,
            target=target,
            constraint=constraint,
            k_parameter=k_param,
            count_parameter=count_param,
        )

        logger.debug(
            "✅ Quantified predicate completed",
            extra={
                "variable": variable_name,
                "type_constraint": type_constraint,
                "relation": relation.name,
                "constraint_type": type(constraint).__name__,
            },
        )

        return predicate

    def _parse_quantifier(self, token: str) -> tuple[Quantifier, int | None]:
        if token in ["∀", "forall", "ALL"]:
            return Quantifier.FORALL, None
        elif token in ["∃", "exists", "SOME"]:
            return Quantifier.EXISTS, None
        elif token.startswith("EXACTLY"):
            count = int(re.findall(r"\d+", token)[0])
            return Quantifier.EXACTLY, count
        elif token.startswith("AT_LEAST"):
            count = int(re.findall(r"\d+", token)[0])
            return Quantifier.AT_LEAST, count
        elif token.startswith("AT_MOST"):
            count = int(re.findall(r"\d+", token)[0])
            return Quantifier.AT_MOST, count
        else:
            raise ParseError(f"Unknown quantifier: {token}")

    def _parse_relation(self) -> tuple[Relation, str, int | None]:
        token = self._consume()

        if token == "neighbors":
            self._expect("(")
            target = self._consume()
            self._expect(")")
            return Relation.NEIGHBORS, target, None

        elif token == "k_hop_neighbors":
            self._expect("(")
            target = self._consume()
            self._expect(",")
            k_param = int(self._consume())
            self._expect(")")
            return Relation.K_HOP, target, k_param

        elif token == "connected_components":
            self._expect("(")
            target = self._consume()
            self._expect(")")
            return Relation.CONNECTED_COMPONENTS, target, None

        else:
            raise ParseError(f"Unknown relation: {token}")

    def _parse_atomic_predicate(self) -> AtomicPredicate:
        left_part = self._consume()
        if not left_part:
            raise ParseError("Expected predicate")

        arguments = []  # Initialize arguments for all cases

        if self._peek() == ".":
            self._consume()
            attr_name = self._consume()
            if not attr_name:
                raise ParseError("Expected attribute name after dot")

            target = left_part
            predicate_type = f"attr_{attr_name}"
        elif "." in left_part:
            target, attr_name = left_part.split(".", 1)
            predicate_type = f"attr_{attr_name}"
        elif self._peek() == "(":
            predicate_type = left_part
            self._expect("(")
            target = self._consume()

            # Handle comma-separated arguments for functions like node_type(x, "technique")
            arguments = [target]
            while self._peek() == ",":
                self._consume()  # consume comma
                arg = self._consume()
                if arg:
                    arguments.append(arg)

            # For now, we use the first argument as the target
            # Additional arguments will be used as the value in the predicate
            target = arguments[0]

            self._expect(")")
        else:
            raise ParseError(f"Invalid atomic predicate format: {left_part}")

        # Handle function calls with multiple arguments differently
        if arguments and len(arguments) > 1:
            # For function calls like node_type(x, "technique"), the second argument is the value
            # and we default to equality operator
            operator = ComparisonOperator.EQUALS
            value = self._parse_value(arguments[1])
        else:
            # Standard case: predicate operator value
            operator_token = self._consume()
            operator = self._parse_operator(operator_token)

            value_token = self._consume()
            value = self._parse_value(value_token)

        return AtomicPredicate(predicate_type, target, operator, value)

    def _parse_operator(self, token: str) -> ComparisonOperator:
        operator_map = {
            "=": ComparisonOperator.EQUALS,
            "!=": ComparisonOperator.NOT_EQUALS,
            ">": ComparisonOperator.GREATER,
            ">=": ComparisonOperator.GREATER_EQUAL,
            "<": ComparisonOperator.LESS,
            "<=": ComparisonOperator.LESS_EQUAL,
            "in": ComparisonOperator.IN,
            "∈": ComparisonOperator.IN,  # Support mathematical element-of symbol
            "not_in": ComparisonOperator.NOT_IN,
        }

        if token not in operator_map:
            raise ParseError(f"Unknown operator: {token}")

        return operator_map[token]

    def _parse_value(self, token: str) -> Any:
        if token.startswith('"') and token.endswith('"'):
            return token[1:-1]
        elif token.startswith("'") and token.endswith("'"):
            return token[1:-1]
        elif token.startswith("[") and token.endswith("]"):
            inner = token[1:-1]
            if not inner:
                return []
            items = [item.strip().strip("\"'") for item in inner.split(",")]
            try:
                return [
                    float(item) if "." in item else int(item)
                    for item in items
                    if item.isdigit() or "." in item
                ]
            except ValueError:
                return items
        elif token.lower() in ("true", "false"):
            return token.lower() == "true"
        elif "." in token:
            try:
                return float(token)
            except ValueError:
                return token
        else:
            try:
                return int(token)
            except ValueError:
                return token


class TemplatePredicateBuilder:
    BIOLOGY_TEMPLATES = {
        "hydrophobic_cluster": {
            "name": "Hydrophobic Cluster",
            "description": "Hydrophobic amino acids that cluster structurally",
            "expression": "x.amino_acid_type in ['PHE','LEU','VAL'] ∧ AT_LEAST(3) y ∈ neighbors(x): y.amino_acid_type in ['PHE','LEU','VAL']",
            "domain": "biology",
        },
        "catalytic_triad": {
            "name": "Catalytic Triad",
            "description": "Active site residues with specific structural constraints",
            "expression": "x.residue_type = 'SER' ∧ EXACTLY(2) y ∈ k_hop_neighbors(x,2): (y.residue_type in ['HIS','ASP'] ∧ degree(y) >= 3)",
            "domain": "biology",
        },
        "surface_charged": {
            "name": "Surface Charged Residues",
            "description": "Charged residues on protein surface",
            "expression": "x.charge != 0 ∧ degree(x) <= 4 ∧ x.accessibility > 0.7",
            "domain": "biology",
        },
    }

    CYBERSECURITY_TEMPLATES = {
        "apt_financial_technique": {
            "name": "APT Financial Targeting",
            "description": "Attack techniques used only by APT groups targeting financial sector",
            "expression": "x.technique_type = 'attack' ∧ ∀ y ∈ neighbors(x): (y.actor_type = 'apt' ∧ y.target_sector = 'financial')",
            "domain": "cybersecurity",
        },
        "central_banking_malware": {
            "name": "Central Banking Malware",
            "description": "Central malware families with specific capabilities",
            "expression": "x.malware_type = 'banking_trojan' ∧ degree(x) >= 5 ∧ ∃ y ∈ neighbors(x): y.technique_id = 'T1005'",
            "domain": "cybersecurity",
        },
    }

    ENERGY_TEMPLATES = {
        "residential_generator": {
            "name": "Residential Generator",
            "description": "High-capacity generators serving residential areas exclusively",
            "expression": "x.node_type = 'generator' ∧ x.capacity_mw > 500 ∧ ∀ y ∈ neighbors(x): y.load_type = 'residential'",
            "domain": "energy",
        },
        "critical_substation": {
            "name": "Critical Substation",
            "description": "Critical substations with high degree and high load",
            "expression": "x.node_type = 'substation' ∧ degree(x) >= 4 ∧ x.peak_load_mw > 200",
            "domain": "energy",
        },
    }

    @classmethod
    def get_all_templates(cls) -> dict[str, dict]:
        templates = {}
        templates.update(cls.BIOLOGY_TEMPLATES)
        templates.update(cls.CYBERSECURITY_TEMPLATES)
        templates.update(cls.ENERGY_TEMPLATES)
        return templates

    @classmethod
    def get_templates_by_domain(cls, domain: str) -> dict[str, dict]:
        all_templates = cls.get_all_templates()
        return {k: v for k, v in all_templates.items() if v.get("domain") == domain}

    @classmethod
    def build_predicate(
        cls, template_key: str, parser: FOLPredicateParser
    ) -> CrossSpacePredicate | None:
        templates = cls.get_all_templates()
        if template_key not in templates:
            return None

        template = templates[template_key]
        try:
            return parser.parse(template["expression"])
        except ParseError:
            return None
