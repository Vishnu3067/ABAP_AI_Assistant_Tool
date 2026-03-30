from openai import OpenAI
from dotenv import load_dotenv
from pathlib import Path
import os
import truststore

truststore.inject_into_ssl()

# .env lives in the project root (one level above this tests/ folder)
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
api_key = os.environ.get("NVIDIA_API_KEY", "")

client = OpenAI(
    base_url=base_url,
    api_key=api_key,
)

completion = client.chat.completions.create(
    model=os.environ.get("OPENAI_MODEL", "openai/gpt-oss-120b"),
    messages=[{"role": "user", "content": "What is MCP (Model Context Protocol)?"}],
    temperature=1,
    top_p=1,
    max_tokens=4096,
    stream=True,
)

for chunk in completion:
    if not getattr(chunk, "choices", None):
        continue
    content = getattr(chunk.choices[0].delta, "content", None)
    if content:
        print(content, end="", flush=True)

print()  # newline at end
