"""Product knowledge base: upload checks, parsing, chunking, embeddings and web reading.

Pure modules (``files``, ``parsing``, ``chunking``, ``embeddings``, ``web``) know nothing
about the database; ``service`` (API side) and ``ingest`` (worker side) wire them to it.
"""
