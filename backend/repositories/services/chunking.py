import hashlib
from typing import List, Optional
from dataclasses import dataclass
from django.conf import settings

from repositories.models import (
    SourceContent, CodeParsing, CodeSymbol, CodeChunk, PullRequestFile
)

@dataclass
class SemanticChunk:
    chunk_type: str
    text: str
    start_line: Optional[int]
    end_line: Optional[int]
    symbol_name: str
    symbol_id: Optional[int] = None
    
    @property
    def hash(self) -> str:
        # Deterministic EXACT input deduplication hash.
        # Since the text includes the metadata header (file, symbol, language),
        # hashing the text alone is sufficient to represent exactly this semantic chunk's inputs.
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()

def generate_ast_chunks(parsing: CodeParsing) -> List[SemanticChunk]:
    """
    Generate semantic chunks for a given CodeParsing context using AST symbols.
    """
    chunks = []
    
    # We need the source file context for the metadata header.
    # In GitPulse, a CodeParsing maps to a SourceContent.
    # We can fetch a representative file path from the SourceFiles that use this content.
    # We just need one deterministic path to give the model context.
    source_file = parsing.source_content.files.first()
    file_path = source_file.file_path if source_file else "unknown_file"
    language = parsing.language
    
    content_lines = parsing.source_content.content.splitlines()
    
    symbols = list(parsing.symbols.all().order_by('start_line'))
    
    if not symbols:
        # File fallback chunking if no symbols extracted (or unsupported lang)
        # For simplicity, we create one chunk for the whole file if it's small enough.
        # (A real implementation might window this if > 8k tokens)
        chunk_text = _format_chunk_text(file_path, language, None, parsing.source_content.content)
        chunks.append(SemanticChunk(
            chunk_type=CodeChunk.ChunkType.FILE_FALLBACK,
            text=chunk_text,
            start_line=1,
            end_line=len(content_lines),
            symbol_name="",
        ))
        return chunks

    # If we have symbols, chunk by function and method
    for sym in symbols:
        if sym.symbol_type in ("function", "method"):
            # Extract lines
            start = max(0, sym.start_line - 1)
            end = min(len(content_lines), sym.end_line)
            code_snippet = "\n".join(content_lines[start:end])
            
            chunk_text = _format_chunk_text(file_path, language, sym.qualified_name, code_snippet)
            
            chunks.append(SemanticChunk(
                chunk_type=CodeChunk.ChunkType.FUNCTION if sym.symbol_type == "function" else CodeChunk.ChunkType.METHOD,
                text=chunk_text,
                start_line=sym.start_line,
                end_line=sym.end_line,
                symbol_name=sym.qualified_name,
                symbol_id=sym.id
            ))
        elif sym.symbol_type == "class":
            # Class context
            start = max(0, sym.start_line - 1)
            # Just take up to 10 lines of the class for context
            end = min(len(content_lines), start + 10, sym.end_line)
            code_snippet = "\n".join(content_lines[start:end])
            
            chunk_text = _format_chunk_text(file_path, language, sym.qualified_name, code_snippet)
            
            chunks.append(SemanticChunk(
                chunk_type=CodeChunk.ChunkType.CLASS_CONTEXT,
                text=chunk_text,
                start_line=sym.start_line,
                end_line=sym.start_line + 9, # Approximation
                symbol_name=sym.qualified_name,
                symbol_id=sym.id
            ))

    return chunks

def generate_pr_patch_chunk(pr_file: PullRequestFile) -> Optional[SemanticChunk]:
    if not pr_file.patch or pr_file.is_truncated:
        return None
        
    chunk_text = f"PR Patch: {pr_file.file_path}\nStatus: {pr_file.status}\n\n{pr_file.patch}"
    return SemanticChunk(
        chunk_type=CodeChunk.ChunkType.PR_PATCH,
        text=chunk_text,
        start_line=None,
        end_line=None,
        symbol_name=""
    )

def _format_chunk_text(file_path: str, language: str, symbol_name: Optional[str], code: str) -> str:
    lines = [
        f"File: {file_path}",
        f"Language: {language}"
    ]
    if symbol_name:
        lines.append(f"Symbol: {symbol_name}")
    lines.append("")
    lines.append(code)
    return "\n".join(lines)
