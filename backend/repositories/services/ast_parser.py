import logging
from dataclasses import dataclass, field
import tree_sitter
from tree_sitter import Language, Parser

import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
import tree_sitter_java as tsjava

logger = logging.getLogger(__name__)

# Tree-sitter > 0.22 uses module.language() directly instead of loading .so files
LANGUAGES = {
    "python": Language(tspython.language()),
    "javascript": Language(tsjavascript.language()),
    "typescript": Language(tstypescript.language_typescript()),
    "tsx": Language(tstypescript.language_tsx()),
    "java": Language(tsjava.language()),
}

# The parsing logic itself shouldn't care about Django models, it just returns Pydantic-like dataclasses
# so that it can be tested easily and independently from the database.

@dataclass
class ParsedSymbol:
    symbol_type: str
    name: str
    start_line: int
    end_line: int
    start_column: int
    end_column: int
    signature: str = ""
    qualified_name: str = ""
    parent: "ParsedSymbol | None" = None
    node_id: int = 0

@dataclass
class ParsedImport:
    imported_module: str
    imported_name: str = ""
    alias: str = ""
    start_line: int = 0

@dataclass
class ParseResult:
    symbols: list[ParsedSymbol] = field(default_factory=list)
    imports: list[ParsedImport] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    status: str = "parsed"
    error: str = ""
    parser_version: str = "tree-sitter-0.26"

def parse_code(content: str, language: str) -> ParseResult:
    """Parse source code into structural symbols and imports using Tree-sitter."""
    if language not in LANGUAGES:
        return ParseResult(status="unsupported", error=f"Unsupported language: {language}")

    lang = LANGUAGES[language]
    parser = Parser(lang)
    
    try:
        tree = parser.parse(content.encode("utf-8"))
    except Exception as e:
        return ParseResult(status="failed", error=str(e)[:1000])

    symbols: list[ParsedSymbol] = []
    imports: list[ParsedImport] = []
    metrics = {
        "loc": len(content.splitlines()),
        "classes": 0,
        "functions": 0,
        "methods": 0,
        "imports": 0,
    }

    try:
        if language == "python":
            _parse_python(tree, lang, content, symbols, imports, metrics)
        elif language in ("javascript", "typescript", "tsx"):
            _parse_js_ts(tree, lang, content, symbols, imports, metrics)
        elif language == "java":
            _parse_java(tree, lang, content, symbols, imports, metrics)
            
        metrics["classes"] = sum(1 for s in symbols if s.symbol_type == "class")
        metrics["functions"] = sum(1 for s in symbols if s.symbol_type == "function")
        metrics["methods"] = sum(1 for s in symbols if s.symbol_type == "method")
        metrics["imports"] = len(imports)
        
    except Exception as e:
        logger.exception("Error extracting AST for language %s", language)
        return ParseResult(status="failed", error=f"Extraction error: {e}"[:1000])

    return ParseResult(
        symbols=symbols,
        imports=imports,
        metrics=metrics,
        status="parsed",
    )

def _get_text(node, content_bytes: bytes) -> str:
    return content_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")

def _parse_python(tree, lang, content: str, symbols: list, imports: list, metrics: dict):
    content_bytes = content.encode("utf-8")
    
    def traverse(node, parent_symbol):
        current_symbol = parent_symbol
        
        if node.type == "class_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                name = _get_text(name_node, content_bytes)
                current_symbol = ParsedSymbol(
                    symbol_type="class",
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                name = _get_text(name_node, content_bytes)
                sym_type = "method" if parent_symbol and parent_symbol.symbol_type == "class" else "function"
                current_symbol = ParsedSymbol(
                    symbol_type=sym_type,
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type == "import_statement":
            for child in node.children:
                if child.type == "dotted_name":
                    imports.append(ParsedImport(
                        imported_module=_get_text(child, content_bytes),
                        start_line=node.start_point.row + 1
                    ))
                elif child.type == "aliased_import":
                    name_node = child.child_by_field_name("name")
                    alias_node = child.child_by_field_name("alias")
                    if name_node and alias_node:
                        imports.append(ParsedImport(
                            imported_module=_get_text(name_node, content_bytes),
                            alias=_get_text(alias_node, content_bytes),
                            start_line=node.start_point.row + 1
                        ))
                        
        elif node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            module_name = _get_text(module_node, content_bytes) if module_node else ""
            for child in node.children:
                if child == module_node:
                    continue
                if child.type == "dotted_name":
                    imports.append(ParsedImport(
                        imported_module=module_name,
                        imported_name=_get_text(child, content_bytes),
                        start_line=node.start_point.row + 1
                    ))
                elif child.type == "aliased_import":
                    name_node = child.child_by_field_name("name")
                    alias_node = child.child_by_field_name("alias")
                    if name_node and alias_node:
                        imports.append(ParsedImport(
                            imported_module=module_name,
                            imported_name=_get_text(name_node, content_bytes),
                            alias=_get_text(alias_node, content_bytes),
                            start_line=node.start_point.row + 1
                        ))

        for child in node.children:
            traverse(child, current_symbol)

    traverse(tree.root_node, None)

def _parse_js_ts(tree, lang, content: str, symbols: list, imports: list, metrics: dict):
    content_bytes = content.encode("utf-8")
    
    def traverse(node, parent_symbol):
        current_symbol = parent_symbol
        
        if node.type in ("class_declaration", "class"):
            name_node = node.child_by_field_name("name")
            if name_node:
                name = _get_text(name_node, content_bytes)
                current_symbol = ParsedSymbol(
                    symbol_type="class",
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type in ("function_declaration", "method_definition", "arrow_function"):
            name = ""
            if node.type == "arrow_function":
                # Find parent variable declarator
                if node.parent and node.parent.type == "variable_declarator":
                    name_node = node.parent.child_by_field_name("name")
                    if name_node:
                        name = _get_text(name_node, content_bytes)
            else:
                name_node = node.child_by_field_name("name")
                if name_node:
                    name = _get_text(name_node, content_bytes)
            
            if name:
                sym_type = "method" if node.type == "method_definition" or (parent_symbol and parent_symbol.symbol_type == "class") else "function"
                current_symbol = ParsedSymbol(
                    symbol_type=sym_type,
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type == "import_statement":
            src_node = node.child_by_field_name("source")
            if src_node:
                mod = _get_text(src_node, content_bytes).strip("\"'")
                imports.append(ParsedImport(
                    imported_module=mod,
                    start_line=node.start_point.row + 1
                ))

        for child in node.children:
            traverse(child, current_symbol)

    traverse(tree.root_node, None)

def _parse_java(tree, lang, content: str, symbols: list, imports: list, metrics: dict):
    content_bytes = content.encode("utf-8")
    
    def traverse(node, parent_symbol):
        current_symbol = parent_symbol
        
        if node.type in ("class_declaration", "interface_declaration", "enum_declaration"):
            name_node = node.child_by_field_name("name")
            if name_node:
                name = _get_text(name_node, content_bytes)
                current_symbol = ParsedSymbol(
                    symbol_type="class" if node.type == "class_declaration" else node.type.split("_")[0],
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type == "method_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                name = _get_text(name_node, content_bytes)
                sym_type = "method"
                current_symbol = ParsedSymbol(
                    symbol_type=sym_type,
                    name=name,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_column=node.start_point.column,
                    end_column=node.end_point.column,
                    qualified_name=f"{parent_symbol.qualified_name}.{name}" if parent_symbol else name,
                    parent=parent_symbol,
                    node_id=node.id
                )
                symbols.append(current_symbol)
                
        elif node.type == "import_declaration":
            # In java import node, children might be `import`, `identifier/scoped_identifier`, `;`
            mod = ""
            for child in node.children:
                if child.type in ("identifier", "scoped_identifier"):
                    mod = _get_text(child, content_bytes)
            if mod:
                imports.append(ParsedImport(
                    imported_module=mod,
                    start_line=node.start_point.row + 1
                ))

        for child in node.children:
            traverse(child, current_symbol)

    traverse(tree.root_node, None)
