from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, cast

from fol.ast import (
    Comparator,
    ComparisonPredicate,
    Conjunction,
    Disjunction,
    FOLNode,
    Negation,
    NeighborhoodQuantifier,
    Quantifier,
    SetComprehension,
    TypePredicate,
    UnaryPredicate,
    Variable,
)
from fol.schema import EdgeStep


class ParseError(Exception):
    pass


@dataclass(slots=True)
class Token:
    type: str
    value: str
    position: int


class Lexer:
    KEYWORDS = {
        "∀": "FORALL",
        "forall": "FORALL",
        "∃": "EXISTS",
        "exists": "EXISTS",
        "∧": "AND",
        "and": "AND",
        "∨": "OR",
        "or": "OR",
        "¬": "NOT",
        "not": "NOT",
        "∈": "IN",
        "in": "IN",
        "neighbors": "NEIGHBORS",
    }

    PATTERNS = [
        (r"exactly\(\d+\)", "EXACTLY"),
        (r"at_least\(\d+\)", "AT_LEAST"),
        (r"at_most\(\d+\)", "AT_MOST"),
        (r"N_\{[a-zA-Z0-9_.-]+\}", "TYPED_KHOP"),
        (r"N_\d+", "KHOP"),
        (r">=", "GTE"),
        (r"<=", "LTE"),
        (r"!=", "NEQ"),
        (r"=", "EQ"),
        (r">", "GT"),
        (r"<", "LT"),
        (r":", "COLON"),
        (r"\(", "LPAREN"),
        (r"\)", "RPAREN"),
        (r"\{", "LBRACE"),
        (r"\}", "RBRACE"),
        (r"\|", "PIPE"),
        (r",", "COMMA"),
        (r'"[^"]*"', "STRING"),
        (r"'[^']*'", "STRING"),
        (r"-?\d+\.?\d*", "NUMBER"),
        (r"true|false", "BOOLEAN"),
        (r"[a-zA-Z_][a-zA-Z0-9_]*", "IDENTIFIER"),
    ]

    def __init__(self, text: str):
        self.text = text
        self.position = 0

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []

        while self.position < len(self.text):
            if self.text[self.position].isspace():
                self.position += 1
                continue

            matched = False
            for keyword, token_type in self.KEYWORDS.items():
                if self.text[self.position :].startswith(keyword):
                    tokens.append(Token(token_type, keyword, self.position))
                    self.position += len(keyword)
                    matched = True
                    break

            if matched:
                continue

            for pattern, token_type in self.PATTERNS:
                match = re.match(pattern, self.text[self.position :], re.IGNORECASE)
                if match:
                    value = match.group()
                    tokens.append(Token(token_type, value, self.position))
                    self.position += len(value)
                    matched = True
                    break

            if not matched:
                raise ParseError(
                    f"Unexpected character at position {self.position}: "
                    f"'{self.text[self.position]}'"
                )

        return tokens


class Parser:
    TYPE_KEYWORDS = frozenset(
        {
            "protein",
            "enzyme",
            "compound",
            "gene",
            "drug",
            "disease",
            "technique",
            "threat_actor",
            "malware",
            "tool",
            "campaign",
            "mitigation",
            "generator",
            "load",
            "substation",
            "bus",
            "line",
            "anatomy",
            "biological_process",
            "pathway",
            "exposure",
            "molecular_function",
            "cellular_component",
            "effect",
            "phenotype",
        }
    )

    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.position = 0

    def parse(self) -> FOLNode | SetComprehension:
        result = self._parse_expression()

        if self.position < len(self.tokens):
            raise ParseError(f"Unexpected token: {self.tokens[self.position].value}")

        return result

    def _peek(self) -> Token | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def _consume(self) -> Token:
        token = self._peek()
        if token is None:
            raise ParseError("Unexpected end of expression")
        self.position += 1
        return token

    def _expect(self, token_type: str) -> Token:
        token = self._consume()
        if token.type != token_type:
            raise ParseError(
                f"Expected {token_type}, got {token.type} ('{token.value}')"
            )
        return token

    def _parse_expression(self) -> FOLNode | SetComprehension:
        return self._parse_or()

    def _parse_or(self) -> FOLNode | SetComprehension:
        left: FOLNode | SetComprehension = self._parse_and()

        while (t := self._peek()) and t.type == "OR":
            self._consume()
            right = cast(FOLNode, self._parse_and())
            left_node = cast(FOLNode, left)
            if isinstance(left_node, Disjunction):
                left = Disjunction([*left_node.operands, right])
            else:
                left = Disjunction([left_node, right])

        return left

    def _parse_and(self) -> FOLNode | SetComprehension:
        left: FOLNode | SetComprehension = self._parse_unary()

        while (t := self._peek()) and t.type == "AND":
            self._consume()
            right = cast(FOLNode, self._parse_unary())
            left_node = cast(FOLNode, left)
            if isinstance(left_node, Conjunction):
                left = Conjunction([*left_node.operands, right])
            else:
                left = Conjunction([left_node, right])

        return left

    def _parse_unary(self) -> FOLNode | SetComprehension:
        if (t := self._peek()) and t.type == "NOT":
            self._consume()
            operand = self._parse_unary()
            return Negation(cast(FOLNode, operand))

        return self._parse_primary()

    def _parse_primary(self) -> FOLNode | SetComprehension:
        token = self._peek()
        if token is None:
            raise ParseError("Unexpected end of expression")

        if token.type == "LPAREN":
            self._consume()
            expr = self._parse_expression()
            self._expect("RPAREN")
            return expr

        if token.type == "LBRACE":
            return self._parse_set_comprehension()

        if token.type in ("FORALL", "EXISTS", "EXACTLY", "AT_LEAST", "AT_MOST"):
            return self._parse_quantified()

        return self._parse_atomic()

    def _parse_set_comprehension(self) -> SetComprehension:
        self._expect("LBRACE")

        variables = []

        token = self._peek()
        if token and token.type == "LPAREN":
            self._consume()
            var_token = self._expect("IDENTIFIER")
            variables.append(Variable(var_token.value))

            while (t := self._peek()) and t.type == "COMMA":
                self._consume()
                var_token = self._expect("IDENTIFIER")
                variables.append(Variable(var_token.value))

            self._expect("RPAREN")
        else:
            var_token = self._expect("IDENTIFIER")
            variables.append(Variable(var_token.value))

        self._expect("PIPE")
        predicate = self._parse_expression()
        self._expect("RBRACE")

        return SetComprehension(variables, cast(FOLNode, predicate))

    def _parse_quantified(self) -> NeighborhoodQuantifier:
        quant_token = self._consume()
        quantifier, count = self._parse_quantifier_type(quant_token)

        var_token = self._expect("IDENTIFIER")
        bound_var = Variable(var_token.value)

        self._expect("IN")

        target_var, k, path = self._parse_neighborhood_relation()

        self._expect("COLON")

        body = self._parse_expression()

        return NeighborhoodQuantifier(
            quantifier=quantifier,
            bound_variable=bound_var,
            target_variable=target_var,
            k=k,
            body=cast(FOLNode, body),
            count=count,
            path=path,
        )

    def _parse_quantifier_type(self, token: Token) -> tuple[Quantifier, int | None]:
        if token.type == "FORALL":
            return Quantifier.FORALL, None
        elif token.type == "EXISTS":
            return Quantifier.EXISTS, None
        elif token.type == "EXACTLY":
            m = re.search(r"\d+", token.value)
            assert m is not None
            count = int(m.group())
            return Quantifier.EXACTLY, count
        elif token.type == "AT_LEAST":
            m = re.search(r"\d+", token.value)
            assert m is not None
            count = int(m.group())
            return Quantifier.AT_LEAST, count
        elif token.type == "AT_MOST":
            m = re.search(r"\d+", token.value)
            assert m is not None
            count = int(m.group())
            return Quantifier.AT_MOST, count

        raise ParseError(f"Unknown quantifier: {token.value}")

    def _parse_neighborhood_relation(self) -> tuple[Variable, int, tuple | None]:
        token = self._consume()

        if token.type == "NEIGHBORS":
            self._expect("LPAREN")
            target = self._expect("IDENTIFIER")
            self._expect("RPAREN")
            return Variable(target.value), 1, None

        if token.type == "KHOP":
            m = re.search(r"\d+", token.value)
            assert m is not None
            k = int(m.group())
            self._expect("LPAREN")
            target = self._expect("IDENTIFIER")
            self._expect("RPAREN")
            return Variable(target.value), k, None

        if token.type == "TYPED_KHOP":
            m = re.search(r"N_\{([^}]+)\}", token.value)
            assert m is not None
            path_str = m.group(1)
            edge_types = path_str.split(".")
            path = tuple(EdgeStep(et) for et in edge_types)
            self._expect("LPAREN")
            target = self._expect("IDENTIFIER")
            self._expect("RPAREN")
            return Variable(target.value), len(path), path

        raise ParseError(f"Expected neighborhood relation, got '{token.value}'")

    def _parse_atomic(self) -> FOLNode:
        name_token = self._expect("IDENTIFIER")
        name = name_token.value

        if not (t := self._peek()) or t.type != "LPAREN":
            raise ParseError(f"Expected '(' after predicate name '{name}'")

        self._consume()
        var_token = self._expect("IDENTIFIER")
        variable = Variable(var_token.value)
        self._expect("RPAREN")

        if (t := self._peek()) and t.type in (
            "EQ",
            "NEQ",
            "GT",
            "GTE",
            "LT",
            "LTE",
        ):
            comparator = self._parse_comparator()
            value = self._parse_value()
            return ComparisonPredicate(name, variable, comparator, value)

        if name.lower() in self.TYPE_KEYWORDS:
            return TypePredicate(name, variable)

        return UnaryPredicate(name, variable)

    def _parse_comparator(self) -> Comparator:
        token = self._consume()
        mapping = {
            "EQ": Comparator.EQ,
            "NEQ": Comparator.NEQ,
            "GT": Comparator.GT,
            "GTE": Comparator.GTE,
            "LT": Comparator.LT,
            "LTE": Comparator.LTE,
        }
        return mapping[token.type]

    def _parse_value(self) -> Any:
        token = self._consume()

        if token.type == "STRING":
            return token.value[1:-1]
        elif token.type == "NUMBER":
            return float(token.value) if "." in token.value else int(token.value)
        elif token.type == "BOOLEAN":
            return token.value.lower() == "true"
        elif token.type == "IDENTIFIER":
            return token.value

        raise ParseError(f"Expected value, got {token.type}")


def parse(expression: str) -> FOLNode | SetComprehension:
    lexer = Lexer(expression)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    return parser.parse()
