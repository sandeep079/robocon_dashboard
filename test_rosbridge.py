import websockets
import asyncio

async def test():
    try:
        async with websockets.connect('ws://localhost:9090') as ws:
            print("Successfully connected to ROS Bridge!")
    except Exception as e:
        print(f"Connection failed: {e}")

asyncio.run(test())
