import httpx
import asyncio
import json

async def test_openai_stream():
    url = "http://localhost:8000/v1/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Hello!"}],
        "stream": True
    }
    # Note: testing this requires the proxy to actually hit openai which needs an API key.
    # Since we might not have an OPENAI_API_KEY, the API might return 401 Unauthorized.
    # But we can check if the proxy at least attempts to stream it and doesn't crash.
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("POST", url, json=payload) as response:
                print(f"Status Code: {response.status_code}")
                async for line in response.aiter_lines():
                    print(line)
        except Exception as e:
            print("Error connecting to proxy:", e)

if __name__ == "__main__":
    asyncio.run(test_openai_stream())
