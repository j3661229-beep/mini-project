import logging
from typing import List, Tuple
from django.conf import settings
import openai
from openai import OpenAI

logger = logging.getLogger(__name__)

# Using module level client caching if possible, but instantiated safely
_client = None

def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a batch of texts using the configured provider.
    Currently uses OpenAI natively.
    Returns a list of vectors matching the dimension of the configured model.
    """
    if not texts:
        return []
        
    provider = getattr(settings, "EMBEDDING_PROVIDER", "openai").lower()
    model = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
    
    if provider != "openai":
        raise NotImplementedError(f"Embedding provider '{provider}' is not supported yet.")
        
    client = get_openai_client()
    
    try:
        # OpenAI API allows batching multiple texts
        response = client.embeddings.create(
            input=texts,
            model=model
        )
        
        # Sort by index to ensure correct mapping
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [d.embedding for d in sorted_data]
        
    except Exception as e:
        logger.error(f"Failed to generate embeddings from OpenAI: {e}")
        raise
