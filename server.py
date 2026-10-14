import os
import urllib.parse
import urllib.request
import re
from fastapi import FastAPI, Query, Request, Response, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import scraper

app = FastAPI(title="TamilPulse - MassTamilan Music App", version="1.0.0")

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://www.masstamilan.dev"
REQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "*/*",
}

@app.get("/api/home")
def api_home():
    try:
        return scraper.get_home_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/latest")
def api_latest(page: int = Query(1, ge=1)):
    try:
        return scraper.get_latest_paginated(page)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
def api_search(q: str = Query("", min_length=1)):
    try:
        return scraper.search_query(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/album")
def api_album(path: str = Query(..., min_length=1)):
    try:
        return scraper.get_album_details(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/composer")
def api_composer(name: str = Query(..., min_length=1)):
    try:
        return scraper.get_composer_albums(name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/lyrics")
def api_lyrics(track: str = Query(..., min_length=1), artist: str = Query("", min_length=0)):
    try:
        return scraper.fetch_lyrics(track, artist)
    except Exception as e:
        return {"found": False, "plain_lyrics": f"Lyrics currently unavailable for {track}."}

@app.get("/api/image")
def api_image(url: str = Query(..., min_length=1)):
    """Proxy image to bypass hotlinking protection and CORS"""
    target_url = url
    if not target_url.startswith("http"):
        if not target_url.startswith("/"):
            target_url = "/" + target_url
        target_url = BASE_URL + target_url

    headers = dict(REQ_HEADERS)
    headers["Referer"] = BASE_URL + "/"
    req = urllib.request.Request(target_url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        data = resp.read()
        return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except Exception as e:
        # Fallback to an elegant SVG placeholder
        svg = """<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
            <rect width="300" height="300" fill="#1e1e2f"/>
            <circle cx="150" cy="150" r="60" fill="#3b3b5c"/>
            <path d="M140 120 L170 150 L140 180 Z" fill="#6366f1"/>
            <text x="150" y="240" fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle">Tamil Music</text>
        </svg>"""
        return Response(content=svg, media_type="image/svg+xml")

@app.get("/api/stream")
def api_stream(request: Request, path: str = Query(..., min_length=1), referer: str = Query(None)):
    """Streaming audio proxy with HTTP 206 Partial Content (Range) support"""
    target_url = path
    if not target_url.startswith("http"):
        if not target_url.startswith("/"):
            target_url = "/" + target_url
        target_url = BASE_URL + target_url

    headers = dict(REQ_HEADERS)
    headers["Referer"] = referer if referer else BASE_URL + "/"

    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    req = urllib.request.Request(target_url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        status_code = resp.status
        content_type = resp.headers.get("Content-Type", "audio/mpeg")
        content_length = resp.headers.get("Content-Length")
        content_range = resp.headers.get("Content-Range")
        accept_ranges = resp.headers.get("Accept-Ranges", "bytes")

        def iterfile():
            try:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                resp.close()

        response_headers = {
            "Content-Type": content_type,
            "Accept-Ranges": accept_ranges,
            "Cache-Control": "public, max-age=14400"
        }
        if content_length:
            response_headers["Content-Length"] = content_length
        if content_range:
            response_headers["Content-Range"] = content_range

        return StreamingResponse(iterfile(), status_code=status_code, headers=response_headers)

    except urllib.error.HTTPError as he:
        # If upstream returned 404 or expired token, try to re-resolve fresh page or return error
        raise HTTPException(status_code=he.code, detail=f"Audio stream error: {he.reason}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download")
def api_download(
    path: str = Query(..., min_length=1),
    name: str = Query("song"),
    movie: str = Query("album"),
    quality: str = Query("320kbps"),
    referer: str = Query(None)
):
    """Download audio file proxy with custom attachment filename"""
    target_url = path
    if not target_url.startswith("http"):
        if not target_url.startswith("/"):
            target_url = "/" + target_url
        target_url = BASE_URL + target_url

    headers = dict(REQ_HEADERS)
    headers["Referer"] = referer if referer else BASE_URL + "/"

    req = urllib.request.Request(target_url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        clean_name = re.sub(r'[\\/*?:"<>|]', "", f"{name} - {movie} ({quality}).mp3")
        safe_filename = urllib.parse.quote(clean_name)

        def iterfile():
            try:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                resp.close()

        content_length = resp.headers.get("Content-Length")
        response_headers = {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": f'attachment; filename="{clean_name}"; filename*=UTF-8\'\'{safe_filename}'
        }
        if content_length:
            response_headers["Content-Length"] = content_length

        return StreamingResponse(iterfile(), headers=response_headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

# Mount static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import sys
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass
    print("=" * 60)
    print("TamilPulse - MassTamilan Music Web App is running!")
    print("Open in your browser: http://localhost:8000")
    print("=" * 60)
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
