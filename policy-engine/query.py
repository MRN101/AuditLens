import os
from ingest import get_vector_store, embed_query
from dotenv import load_dotenv

load_dotenv()


def query_policy(category: str, amount_usd: float, location: str, business_purpose: str, top_k: int = 5) -> list[str]:
    """
    Queries ChromaDB for policy rules relevant to the given expense context.
    Returns a list of policy text chunks (strings).
    """
    # Build a rich query string for semantic search
    query = f"""
    Expense category: {category}
    Amount: ${amount_usd} USD
    Employee location: {location}
    Business purpose: {business_purpose}
    What are the reimbursement limits, prohibitions, and requirements for this type of expense?
    """.strip()

    try:
        query_embedding = embed_query(query)

        _, collection = get_vector_store()

        # Check if collection has any documents
        count = collection.count()
        if count == 0:
            print("[query] Warning: No policy documents in vector store.")
            return [
                "No policy document has been uploaded yet. Please upload the company expense policy PDF.",
                f"General guidance: Apply standard corporate expense policy for {category} in {location}."
            ]

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, count),
            include=['documents', 'distances'],
        )

        documents = results.get('documents', [[]])[0]
        distances = results.get('distances', [[]])[0]

        # Filter by relevance threshold (cosine distance < 0.5 means >50% similar)
        relevant = [
            doc for doc, dist in zip(documents, distances)
            if dist < 0.5
        ]

        return relevant if relevant else documents[:3]  # fallback: return top 3

    except Exception as e:
        print(f"[query] Error: {e}")
        return [f"Policy query failed: {str(e)}. Manual review recommended."]
