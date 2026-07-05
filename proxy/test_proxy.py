import httpx
import asyncio

async def test():
    # Make a dummy request to the proxy to simulate a Claude prompt
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post("http://localhost:8000/v1/messages", json={"dummy": "data"})
            print("Proxy Response Code:", resp.status_code)
        except Exception as e:
            print("Error connecting to proxy:", e)

asyncio.run(test())
