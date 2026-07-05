import httpx
import asyncio
from datetime import datetime, timezone
import os

UID = "OT2tw7SLpnfuvHbyccbbS7y4tOq1"
PROJECT = "ai-token-5be33"

async def insert_dummy_log():
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/users/{UID}/api_usage_logs"
    payload = {
        "fields": {
            "provider": {"stringValue": "gemini"},
            "model": {"stringValue": "gemini-1.5-pro-latest"},
            "source": {"stringValue": "terminal"},
            "prompt_tokens": {"integerValue": 1000000}, # 1M tokens ($3.50)
            "completion_tokens": {"integerValue": 500000}, # 500k tokens ($5.25)
            "timestamp": {"timestampValue": datetime.now(timezone.utc).isoformat()}
        }
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload)
        print(resp.status_code, resp.text)

asyncio.run(insert_dummy_log())
