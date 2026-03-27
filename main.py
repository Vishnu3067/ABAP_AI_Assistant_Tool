from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from routes import home, tr_analysis, chat_analysis, ts_finalization, code_review, retrofit, reusable_artifacts, impact_analysis, drad, naming_conv

app = FastAPI(title="ABAP AI Assistant Tool")

app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).parent / "static"),
    name="static",
)

app.include_router(home.router)
app.include_router(tr_analysis.router)
app.include_router(chat_analysis.router)
app.include_router(ts_finalization.router)
app.include_router(code_review.router)
app.include_router(retrofit.router)
app.include_router(reusable_artifacts.router)
app.include_router(impact_analysis.router)
app.include_router(drad.router)
app.include_router(naming_conv.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
