import os
import chromadb
import google.generativeai as genai
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv

load_dotenv()

CHROMA_PATH = os.environ.get('CHROMA_PATH', './chroma_db')
COLLECTION_NAME = 'policy_docs'
EMBED_MODEL = 'models/gemini-embedding-001'

# Configure Gemini
genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))


def get_vector_store():
    """Returns the ChromaDB client and collection."""
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={'hnsw:space': 'cosine'}
    )
    return client, collection


def embed_texts(texts):
    """Embed a list of texts using Gemini embedding API directly."""
    results = []
    # Process in batches of 20 to avoid rate limits
    batch_size = 20
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        for text in batch:
            try:
                result = genai.embed_content(
                    model=EMBED_MODEL,
                    content=text
                )
                results.append(result['embedding'])
            except Exception as e:
                print(f"[embed] Warning: {e}, using zero vector")
                results.append([0.0] * 768)
    return results


def embed_query(text):
    """Embed a single query text."""
    result = genai.embed_content(
        model=EMBED_MODEL,
        content=text
    )
    return result['embedding']


def ingest_policy(policy_id: str, file_path: str) -> int:
    """
    Loads a PDF, chunks it, embeds chunks, and stores in ChromaDB.
    Returns the number of chunks indexed.
    """
    print(f"[ingest] Loading policy from: {file_path}")

    # Load PDF
    loader = PyPDFLoader(file_path)
    pages = loader.load()

    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        separators=['\n\n', '\n', '.', ' '],
    )
    chunks = splitter.split_documents(pages)
    print(f"[ingest] Created {len(chunks)} chunks")

    # Store in ChromaDB
    _, collection = get_vector_store()

    # Remove old chunks for this policy if re-ingesting
    try:
        existing = collection.get(where={'policy_id': policy_id})
        if existing['ids']:
            collection.delete(ids=existing['ids'])
            print(f"[ingest] Deleted {len(existing['ids'])} old chunks for policy {policy_id}")
    except Exception:
        pass

    # Batch embed and insert
    texts = [c.page_content for c in chunks]
    print(f"[ingest] Embedding {len(texts)} chunks...")
    embeddings = embed_texts(texts)

    metadatas = [
        {
            'policy_id': policy_id or 'default',
            'page': c.metadata.get('page', 0),
            'source': file_path,
        }
        for c in chunks
    ]
    ids = [f"{policy_id or 'default'}_{j}" for j in range(len(chunks))]

    collection.add(documents=texts, embeddings=embeddings, metadatas=metadatas, ids=ids)

    print(f"[ingest] Indexed {len(chunks)} chunks into ChromaDB")
    return len(chunks)
