import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from ingest import ingest_policy
from query import query_policy

load_dotenv()

app = Flask(__name__)
CORS(app)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'policy-engine'})


@app.route('/ingest', methods=['POST'])
def ingest():
    """Ingest a policy PDF into the vector store."""
    data = request.get_json()
    policy_id = data.get('policyId')
    file_path = data.get('filePath')

    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'filePath is required and must exist'}), 400

    try:
        chunk_count = ingest_policy(policy_id, file_path)
        return jsonify({
            'message': 'Policy ingested successfully',
            'policyId': policy_id,
            'chunksIndexed': chunk_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/query', methods=['POST'])
def query():
    """Query policy for relevant rules given expense context."""
    data = request.get_json()
    category = data.get('category', 'Other')
    amount_usd = data.get('amountUSD')
    location = data.get('location', 'default')
    business_purpose = data.get('businessPurpose', '')

    try:
        policy_chunks = query_policy(category, amount_usd, location, business_purpose)
        return jsonify({'policyChunks': policy_chunks})
    except Exception as e:
        return jsonify({'error': str(e), 'policyChunks': []}), 500


if __name__ == '__main__':
    port = int(os.environ.get('POLICY_ENGINE_PORT', 8000))
    print(f"🐍 Policy Engine running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
