# GitPulse Roadmap & Project Status

GitPulse is a comprehensive system designed to parse, ingest, and semantically analyze Git repositories. This project has evolved significantly through 4 primary steps, paving the way for future AI-driven and ML capabilities.

## What We've Accomplished So Far

### Step 1: Incremental Non-Destructive Git Ingestion
- **Idempotency & Safety**: Replaced the destructive, full-deletion repository ingestion mechanism with an incremental workflow that preserves historical data and commits.
- **Data Persistence**: Safely tracks commits, pull requests, and file ownership without resetting the backend on failure.
- **Fail-Safe Processing**: Ensured that failing network clones, timeouts, and unexpected repository states do not trigger data loss.

### Step 2: Source Code & PR Diff Data Foundation
- **Deduplicated Content Storage**: Implemented `SourceContent` mapped strictly by deterministic SHA-256 hashes, ensuring overlapping identical files across branches or commits do not duplicate storage.
- **Versioning**: Developed a mapping for `SourceFile` tracking the repository + commit + file path, pointing robustly back to `SourceContent`.
- **Configurable Limits**: Ensured massive files and pull requests don't swamp the pipeline by explicitly handling boundaries (`MAX_SOURCE_FILE_SIZE` = 1MB, `MAX_PR_PATCH_SIZE` = 500KB) and accurately marking overflows.

### Step 3: AST & Code Symbol Extraction
- **Structural Analysis Engine**: Built the capability to read code strictly by logic rather than plaintext lines using abstract syntax trees.
- **CodeParsing Layer**: Introduced `CodeParsing` as a unique parsing context preventing duplicated parsing loops across identical content but different grammar parser combinations.
- **Extracted Metadata**: Populated `CodeSymbol` tables encompassing explicit tracking of functions, classes, and methods, alongside metadata mapping metrics like lines of code (LOC).

### Step 4: Vector Search & Code Embeddings
- **Semantic Mapping (Chunking)**: Assembled contextual "chunks" representing specific structural blocks (methods, classes, and whole-file fallbacks) containing descriptive headers (File name, Symbol Name).
- **PostgreSQL pgvector Integration**: Prepared models (`CodeChunk`) utilizing the `vector` extension and explicitly integrating the HNSW index (`vector_cosine_ops`) for ultra-fast scaling of similarity searches.
- **OpenAI Batch Embedding**: Connected OpenAI's `text-embedding-3-small` dynamically using Celery queuing logic to compute embeddings reliably via `process_pending_embeddings` row locking.
- **Semantic Retrieval**: Added `/api/repositories/{id}/semantic-search/?q=...` API that vectorizes the inbound query and fetches conceptually related symbols or file paths.

## Future Roadmap (Next Steps)
With the fundamental AI-readiness layer achieved, the architecture is ready to adopt direct LLM interfaces. Future features may include:
- **Retrieval Augmented Generation (RAG)**: Leveraging the `semantic-search` endpoints to answer arbitrary questions over arbitrary repositories using an AI agent.
- **Automated PR Reviews**: Injecting context-aware code diff embeddings directly into generative LLMs to critique or approve Pull Requests autonomously.
- **Advanced Graph Connections**: Linking `CodeImport` and dependencies across the vector store to resolve broader codebase structural changes and detect security risks.
- **Cross-Repository Searching**: Expanding the semantic layer to easily find overlapping code patterns, duplication, and usage implementations globally across the GitPulse ecosystem.
