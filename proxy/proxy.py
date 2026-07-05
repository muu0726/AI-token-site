import os
import json
import httpx
import asyncio
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "ai-token-5be33")
UID = os.getenv("USER_UID", "test_user_uid")

async def log_api_usage(provider: str, model: str, prompt_tokens: int, completion_tokens: int):
    # Ensure we don't log empty usage
    if prompt_tokens == 0 and completion_tokens == 0:
        return

    url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents/users/{UID}/api_usage_logs"
    payload = {
        "fields": {
            "provider": {"stringValue": provider},
            "model": {"stringValue": model},
            "source": {"stringValue": "terminal"},
            "prompt_tokens": {"integerValue": prompt_tokens},
            "completion_tokens": {"integerValue": completion_tokens},
            "timestamp": {"timestampValue": datetime.now(timezone.utc).isoformat()}
        }
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            print(f"Logged API usage: {provider} ({model}) - In: {prompt_tokens}, Out: {completion_tokens}")
        except Exception as e:
            print(f"Failed to log API usage to Firestore: {e}")

@app.post("/v1/messages")
async def proxy_claude(request: Request):
    target_url = "https://api.anthropic.com/v1/messages"
    body_bytes = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    
    # Extract model from request body
    model = "claude-unknown"
    try:
        body_json = json.loads(body_bytes)
        model = body_json.get("model", model)
    except:
        pass

    async def stream_and_parse():
        prompt_tokens = 0
        completion_tokens = 0
        
        async with httpx.AsyncClient() as client:
            proxy_req = client.build_request(request.method, target_url, headers=headers, content=body_bytes)
            resp = await client.send(proxy_req, stream=True)
            
            async for chunk in resp.aiter_lines():
                if chunk.startswith("data: "):
                    try:
                        data = json.loads(chunk[6:])
                        if data.get("type") == "message_start":
                            usage = data.get("message", {}).get("usage", {})
                            prompt_tokens = usage.get("input_tokens", 0)
                        elif data.get("type") == "message_delta":
                            usage = data.get("usage", {})
                            completion_tokens += usage.get("output_tokens", 0)
                    except json.JSONDecodeError:
                        pass
                
                # yield exactly what we received (including the newline since aiter_lines strips them by default, wait, we must be careful with SSE formatting)
                # Actually, aiter_lines() yields lines WITHOUT the trailing newline by default, or with it depending on the setting.
                # To be safe and not break SSE, it's better to read raw bytes and parse lines from it, or just add \n back.
                yield chunk + "\n"

        # Log after stream completes
        asyncio.create_task(log_api_usage("claude", model, prompt_tokens, completion_tokens))

    return StreamingResponse(stream_and_parse(), media_type="text/event-stream")

@app.post("/v1beta/models/{model_param}:streamGenerateContent")
async def proxy_gemini_stream(model_param: str, request: Request):
    target_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_param}:streamGenerateContent"
    body_bytes = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)

    async def stream_and_parse():
        prompt_tokens = 0
        completion_tokens = 0
        
        async with httpx.AsyncClient() as client:
            proxy_req = client.build_request(request.method, target_url, headers=headers, content=body_bytes, params=request.query_params)
            resp = await client.send(proxy_req, stream=True)
            
            async for chunk in resp.aiter_raw():
                # For Gemini, the stream format varies (sometimes JSON array, sometimes SSE)
                # We do a simple string search for usageMetadata as it's less fragile for varying stream types
                chunk_str = chunk.decode('utf-8', errors='ignore')
                if "usageMetadata" in chunk_str:
                    try:
                        # Extract the JSON block roughly or parse line if SSE
                        # It's safer to accumulate and parse if it's pure JSON array stream
                        pass
                    except:
                        pass
                yield chunk
                
    # A better approach for Gemini is to just accumulate the whole response in memory if it's small, 
    # or parse the chunks with a regex since we just need promptTokenCount and candidatesTokenCount.
    return StreamingResponse(stream_and_parse())

# Re-implement stream parsing more robustly for Gemini using aiter_raw
@app.post("/v1beta/models/{model}:streamGenerateContent", include_in_schema=False)
@app.post("/v1beta/models/{model}:generateContent", include_in_schema=False)
async def proxy_gemini(model: str, request: Request):
    target_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}"
    if ":streamGenerateContent" in str(request.url):
        target_url += ":streamGenerateContent"
    else:
        target_url += ":generateContent"

    body_bytes = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)

    import re

    async def stream_and_parse():
        prompt_tokens = 0
        completion_tokens = 0
        response_body = ""
        
        async with httpx.AsyncClient() as client:
            proxy_req = client.build_request(request.method, target_url, headers=headers, content=body_bytes, params=request.query_params)
            resp = await client.send(proxy_req, stream=True)
            
            async for chunk in resp.aiter_raw():
                chunk_str = chunk.decode('utf-8', errors='ignore')
                response_body += chunk_str
                yield chunk
                
        # Parse usage metadata after the full response is collected using Regex (works for both SSE and JSON arrays)
        prompt_match = re.search(r'"promptTokenCount"\s*:\s*(\d+)', response_body)
        completion_match = re.search(r'"candidatesTokenCount"\s*:\s*(\d+)', response_body)
        
        if prompt_match:
            prompt_tokens = int(prompt_match.group(1))
        if completion_match:
            completion_tokens = int(completion_match.group(1))

        # Only log if we found usage metadata
        if prompt_tokens > 0 or completion_tokens > 0:
            asyncio.create_task(log_api_usage("gemini", model, prompt_tokens, completion_tokens))

    return StreamingResponse(stream_and_parse(), media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
