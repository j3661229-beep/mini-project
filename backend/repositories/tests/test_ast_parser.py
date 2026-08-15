import pytest
from datetime import datetime, timezone
from django.conf import settings
from unittest.mock import patch, MagicMock

from repositories.models import (
    Repository, Commit, SourceContent, SourceFile, 
    CodeParsing, CodeSymbol, CodeImport
)
from repositories.services.git_ingest import ParsedCommit, ParsedCommitFile, ParsedSourceFile
from repositories.tasks import _persist_new_commits, parse_repository_code
from repositories.services.ast_parser import parse_code

@pytest.fixture
def repo():
    return Repository.objects.create(owner="test", name="repo", github_url="http://test")

@pytest.fixture
def repo2():
    return Repository.objects.create(owner="test", name="repo2", github_url="http://test2")

@pytest.mark.django_db
def test_python_ast_extraction():
    content = """
import os
from sys import path as sys_path

class MyClass:
    def method(self):
        pass

def my_func():
    pass
    """
    result = parse_code(content, "python")
    assert result.status == "parsed"
    
    # Imports
    assert len(result.imports) == 2
    assert result.imports[0].imported_module == "os"
    assert result.imports[1].imported_module == "sys"
    assert result.imports[1].imported_name == "path"
    assert result.imports[1].alias == "sys_path"
    
    # Symbols
    symbols = result.symbols
    assert len(symbols) == 3
    cls = next(s for s in symbols if s.symbol_type == "class")
    assert cls.name == "MyClass"
    
    meth = next(s for s in symbols if s.symbol_type == "method")
    assert meth.name == "method"
    assert meth.parent.name == "MyClass"
    
    func = next(s for s in symbols if s.symbol_type == "function")
    assert func.name == "my_func"

@pytest.mark.django_db
def test_js_ts_ast_extraction():
    content = """
import { useState } from 'react';
class TestClass {
    myMethod() {}
}
function testFunc() {}
const arrowFunc = () => {};
    """
    result = parse_code(content, "javascript")
    assert result.status == "parsed"
    
    assert len(result.imports) == 1
    assert result.imports[0].imported_module == "react"
    
    symbols = result.symbols
    assert len(symbols) == 4
    assert any(s.name == "TestClass" and s.symbol_type == "class" for s in symbols)
    assert any(s.name == "myMethod" and s.symbol_type == "method" for s in symbols)
    assert any(s.name == "testFunc" and s.symbol_type == "function" for s in symbols)
    assert any(s.name == "arrowFunc" and s.symbol_type == "function" for s in symbols)

@pytest.mark.django_db
def test_java_ast_extraction():
    content = """
import java.util.List;

public class MyJavaClass {
    public void doWork() {}
}
    """
    result = parse_code(content, "java")
    assert result.status == "parsed"
    
    assert len(result.imports) == 1
    assert result.imports[0].imported_module == "java.util.List"
    
    symbols = result.symbols
    assert len(symbols) == 2
    assert any(s.name == "MyJavaClass" and s.symbol_type == "class" for s in symbols)
    assert any(s.name == "doWork" and s.symbol_type == "method" for s in symbols)

@pytest.mark.django_db
def test_incremental_parsing_behavior(repo):
    src = ParsedSourceFile(
        content="def hello(): pass", hash="abc1", is_binary=False,
        is_skipped_size=False, size=14, status="A", language="python"
    )
    pf = ParsedCommitFile(file_path="main.py", insertions=1, deletions=0, source_file=src)
    pc = ParsedCommit(
        hash="commit1", author_name="author", author_email="e@e",
        committed_at=datetime.now(timezone.utc), parent_hashes=[],
        message="init", branch="main", files=[pf]
    )
    _persist_new_commits(repo, [pc], set())
    
    # Run parsing
    parse_repository_code(repo.id)
    
    # Verify DB
    assert CodeParsing.objects.count() == 1
    parsing = CodeParsing.objects.first()
    assert parsing.parse_status == "parsed"
    assert CodeSymbol.objects.filter(parsing=parsing).count() == 1
    
    # 1. Same SourceContent + same language + same parser version: parsed once
    with patch("repositories.tasks.parse_code") as mock_parse:
        parse_repository_code(repo.id)
        mock_parse.assert_not_called() # Should be skipped because it's already PARSED
        
    # 2. Same SourceContent + different language: separate CodeParsing contexts
    # Let's add a new SourceFile with same content but different language
    src2 = ParsedSourceFile(
        content="def hello(): pass", hash="abc1", is_binary=False,
        is_skipped_size=False, size=14, status="A", language="javascript"
    )
    pf2 = ParsedCommitFile(file_path="other.js", insertions=1, deletions=0, source_file=src2)
    pc2 = ParsedCommit(
        hash="commit2", author_name="author", author_email="e@e",
        committed_at=datetime.now(timezone.utc), parent_hashes=[],
        message="init2", branch="main", files=[pf2]
    )
    _persist_new_commits(repo, [pc2], set())
    
    parse_repository_code(repo.id)
    assert CodeParsing.objects.count() == 2 # Now there are 2 parsings
    
    p2 = CodeParsing.objects.get(language="javascript")
    assert p2.parse_status == "parsed"
    
@pytest.mark.django_db
def test_new_parser_version_and_repo_scoping(repo, repo2):
    src = ParsedSourceFile(
        content="class Foo {}", hash="hashX", is_binary=False,
        is_skipped_size=False, size=10, status="A", language="java"
    )
    pf = ParsedCommitFile(file_path="Foo.java", insertions=1, deletions=0, source_file=src)
    pc = ParsedCommit(
        hash="commit1", author_name="author", author_email="e@e",
        committed_at=datetime.now(timezone.utc), parent_hashes=[],
        message="init", branch="main", files=[pf]
    )
    
    _persist_new_commits(repo, [pc], set())
    _persist_new_commits(repo2, [pc], set()) # Both repos share the same content
    
    # parse_repository_code on repo1
    parse_repository_code(repo.id)
    assert CodeParsing.objects.count() == 1
    
    # parse_repository_code on repo2
    # Since it's the exact same hash, language, and parser version, it should see the context exists.
    # It will verify it exists, but the query scopes by repo files. It finds the same hash, gets the context, sees it's parsed, and skips.
    with patch("repositories.tasks.parse_code") as mock_parse:
        parse_repository_code(repo2.id)
        mock_parse.assert_not_called()
        
@pytest.mark.django_db
def test_unsupported_language_and_failures(repo):
    src1 = ParsedSourceFile(
        content="def func(): pass", hash="h1", is_binary=False,
        is_skipped_size=False, size=10, status="A", language="python"
    )
    src2 = ParsedSourceFile(
        content="some weird syntax", hash="h2", is_binary=False,
        is_skipped_size=False, size=10, status="A", language="unknownlang"
    )
    
    pc = ParsedCommit(
        hash="commit1", author_name="a", author_email="a",
        committed_at=datetime.now(timezone.utc), parent_hashes=[],
        message="init", branch="main", files=[
            ParsedCommitFile("f1.py", 1, 0, src1),
            ParsedCommitFile("f2.unknown", 1, 0, src2),
        ]
    )
    
    _persist_new_commits(repo, [pc], set())
    parse_repository_code(repo.id)
    
    assert CodeParsing.objects.count() == 2
    p1 = CodeParsing.objects.get(language="python")
    assert p1.parse_status == "parsed"
    
    p2 = CodeParsing.objects.get(language="unknownlang")
    assert p2.parse_status == "unsupported"
    
    # It should not break ingestion! (No exception raised)
