import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import json
import re
import time
import logging

BASE_URL = "https://www.masstamilan.dev"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# In-memory simple cache for performance
_CACHE = {}
CACHE_TTL = 300  # 5 minutes

def _fetch_url(url: str, referer: str = None) -> str:
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    else:
        headers["Referer"] = BASE_URL + "/"
        
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=12) as response:
        return response.read().decode("utf-8", errors="ignore")

def _get_cached(key: str):
    if key in _CACHE:
        val, ts = _CACHE[key]
        if time.time() - ts < CACHE_TTL:
            return val
    return None

def _set_cache(key: str, val):
    _CACHE[key] = (val, time.time())

def get_home_data():
    cached = _get_cached("home")
    if cached:
        return cached

    html = _fetch_url(BASE_URL + "/")
    soup = BeautifulSoup(html, "html.parser")
    
    albums = []
    seen_hrefs = set()

    # Find album cards / links with images
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if ("-songs" in href or "-bgm-" in href) and href not in seen_hrefs:
            img = a.find("img")
            if img:
                seen_hrefs.add(href)
                raw_text = a.get_text(separator="\n", strip=True)
                lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
                
                title = lines[0] if lines else img.get("alt", "Tamil Song")
                title = title.replace("movie poster", "").strip()
                
                starring = ""
                music = ""
                director = ""
                for line in lines[1:]:
                    if line.startswith("Starring:"):
                        starring = line.replace("Starring:", "").strip()
                    elif line.startswith("Music:"):
                        music = line.replace("Music:", "").strip()
                    elif line.startswith("Director:"):
                        director = line.replace("Director:", "").strip()

                img_src = img.get("src", "")
                if img_src and not img_src.startswith("http"):
                    img_src = BASE_URL + img_src

                clean_href = href if href.startswith("/") else "/" + href
                albums.append({
                    "title": title,
                    "href": clean_href,
                    "img": img_src,
                    "starring": starring,
                    "music": music,
                    "director": director
                })

    # Extract top composers list
    top_composers = [
        {"name": "Anirudh Ravichander", "slug": "anirudh-ravichander", "avatar": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&q=80"},
        {"name": "A. R. Rahman", "slug": "a.r.rahman", "avatar": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&q=80"},
        {"name": "Yuvan Shankar Raja", "slug": "yuvan-shankar-raja", "avatar": "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=150&q=80"},
        {"name": "Harris Jayaraj", "slug": "harris-jayaraj", "avatar": "https://images.unsplash.com/photo-1445985543470-41fdd6ce388d?w=150&q=80"},
        {"name": "G. V. Prakash Kumar", "slug": "g.-v.-prakash-kumar", "avatar": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&q=80"},
        {"name": "Ilaiyaraaja", "slug": "ilaiyaraaja", "avatar": "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=150&q=80"},
        {"name": "D. Imman", "slug": "d.imman", "avatar": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=150&q=80"},
        {"name": "Santhosh Narayanan", "slug": "santhosh-narayanan", "avatar": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&q=80"}
    ]

    result = {
        "featured": albums[:4] if len(albums) >= 4 else albums,
        "latest": albums,
        "composers": top_composers
    }
    _set_cache("home", result)
    return result

def get_latest_paginated(page: int = 1):
    cache_key = f"latest_{page}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/tamil-songs" if page == 1 else f"{BASE_URL}/tamil-songs?page={page}"
    html = _fetch_url(url)
    soup = BeautifulSoup(html, "html.parser")
    
    albums = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "-songs" in href and href not in seen:
            img = a.find("img")
            if img:
                seen.add(href)
                raw_text = a.get_text(separator="\n", strip=True)
                lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
                title = lines[0] if lines else img.get("alt", "Tamil Song")
                title = title.replace("movie poster", "").strip()
                
                starring = ""
                music = ""
                director = ""
                for line in lines[1:]:
                    if line.startswith("Starring:"):
                        starring = line.replace("Starring:", "").strip()
                    elif line.startswith("Music:"):
                        music = line.replace("Music:", "").strip()
                    elif line.startswith("Director:"):
                        director = line.replace("Director:", "").strip()

                img_src = img.get("src", "")
                if img_src and not img_src.startswith("http"):
                    img_src = BASE_URL + img_src

                clean_href = href if href.startswith("/") else "/" + href
                albums.append({
                    "title": title,
                    "href": clean_href,
                    "img": img_src,
                    "starring": starring,
                    "music": music,
                    "director": director
                })

    data = {
        "page": page,
        "albums": albums,
        "has_more": len(albums) > 0
    }
    _set_cache(cache_key, data)
    return data

def search_query(keyword: str):
    if not keyword:
        return {"results": []}

    cache_key = f"search_{keyword.lower().strip()}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    encoded = urllib.parse.quote(keyword.strip())
    url = f"{BASE_URL}/search?keyword={encoded}"
    html = _fetch_url(url)
    soup = BeautifulSoup(html, "html.parser")

    results = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href in seen:
            continue
        img = a.find("img")
        if img:
            seen.add(href)
            title = img.get("alt", a.get_text(strip=True))
            title = title.replace("movie poster", "").strip()
            img_src = img.get("src", "")
            if img_src and not img_src.startswith("http"):
                img_src = BASE_URL + img_src

            raw_text = a.get_text(separator="\n", strip=True)
            lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
            starring = ""
            music = ""
            for l in lines:
                if l.startswith("Starring:"):
                    starring = l.replace("Starring:", "").strip()
                elif l.startswith("Music:"):
                    music = l.replace("Music:", "").strip()

            clean_href = href if href.startswith("/") else "/" + href
            results.append({
                "title": title,
                "href": clean_href,
                "img": img_src,
                "starring": starring,
                "music": music
            })

    output = {"keyword": keyword, "results": results}
    _set_cache(cache_key, output)
    return output

def get_composer_albums(composer_slug: str):
    cache_key = f"composer_{composer_slug}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/music/{composer_slug}"
    html = _fetch_url(url)
    soup = BeautifulSoup(html, "html.parser")

    albums = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href in seen:
            continue
        img = a.find("img")
        if img:
            seen.add(href)
            title = img.get("alt", a.get_text(strip=True)).replace("movie poster", "").strip()
            img_src = img.get("src", "")
            if img_src and not img_src.startswith("http"):
                img_src = BASE_URL + img_src

            raw_text = a.get_text(separator="\n", strip=True)
            lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
            starring = ""
            for l in lines:
                if l.startswith("Starring:"):
                    starring = l.replace("Starring:", "").strip()

            clean_href = href if href.startswith("/") else "/" + href
            albums.append({
                "title": title,
                "href": clean_href,
                "img": img_src,
                "starring": starring
            })

    output = {"composer": composer_slug, "albums": albums}
    _set_cache(cache_key, output)
    return output

def get_album_details(path: str):
    if not path.startswith("/"):
        path = "/" + path
    
    clean_path = path.split("?")[0]
    full_url = BASE_URL + clean_path
    
    html = _fetch_url(full_url)
    soup = BeautifulSoup(html, "html.parser")

    # Extract Page title / Movie name
    title = ""
    title_tag = soup.find("h1")
    if title_tag:
        title = title_tag.get_text(strip=True).replace("Tamil Songs Download", "").replace("Songs Download", "").strip()
    if not title:
        title = soup.title.string.split("MassTamilan")[0].strip() if soup.title else "Tamil Album"

    # Extract metadata fields
    page_text = soup.get_text(separator="\n")
    starring = ""
    music_director = ""
    director = ""
    lyricists = ""
    year = ""

    for line in page_text.split("\n"):
        line = line.strip()
        if line.startswith("Starring:"):
            starring = line.replace("Starring:", "").strip()
        elif line.startswith("Music:"):
            music_director = line.replace("Music:", "").strip()
        elif line.startswith("Director:"):
            director = line.replace("Director:", "").strip()
        elif line.startswith("Lyricists:") or line.startswith("Lyricist:"):
            lyricists = line.split(":", 1)[1].strip()
        elif line.startswith("Year:") or "Release Year:" in line:
            year = line.split(":", 1)[1].strip()

    # Poster image
    poster = ""
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "/i/" in src:
            poster = BASE_URL + src if not src.startswith("http") else src
            break

    # Look for window.albumTracks javascript object
    raw_tracks = []
    tracks_match = re.search(r'window\.albumTracks\s*=\s*(\[.*?\]);', html, re.DOTALL)
    if tracks_match:
        try:
            raw_tracks = json.loads(tracks_match.group(1))
        except Exception:
            pass

    # Look for songs table with download links
    table = soup.find("table")
    table_tracks = []
    if table:
        for tr in table.find_all("tr"):
            row_text = tr.get_text(separator=" ", strip=True)
            if not row_text:
                continue

            links = tr.find_all("a", href=True)
            song_name = ""
            artists = ""
            duration = ""
            downloads = ""
            dl_128 = ""
            dl_320 = ""

            for a in links:
                href = a["href"]
                text = a.get_text(strip=True)
                if "-mp3-song" in href:
                    song_name = text
                elif "128kbps" in text or "d128_cdn" in href:
                    dl_128 = href
                elif "320kbps" in text or "d320_cdn" in href:
                    dl_320 = href

            # Parse artists, length, download count from row text
            if "Artists:" in row_text:
                try:
                    parts = row_text.split("Artists:")[1]
                    artists = parts.split("Length:")[0].strip()
                    if "Length:" in parts:
                        sub = parts.split("Length:")[1]
                        duration = sub.split("Downloads:")[0].strip()
                        if "Downloads:" in sub:
                            downloads = sub.split("Downloads:")[1].split()[0].strip()
                except Exception:
                    pass

            if song_name or dl_128 or dl_320:
                table_tracks.append({
                    "name": song_name,
                    "artists": artists,
                    "duration": duration,
                    "downloads": downloads,
                    "dl_128": dl_128,
                    "dl_320": dl_320
                })

    # Merge raw_tracks (which have verified working preview dl_paths) with table_tracks
    final_tracks = []
    total_tracks = max(len(raw_tracks), len(table_tracks))

    for idx in range(total_tracks):
        rt = raw_tracks[idx] if idx < len(raw_tracks) else {}
        tt = table_tracks[idx] if idx < len(table_tracks) else {}

        track_name = rt.get("name") or tt.get("name") or f"Track {idx+1}"
        track_artists = rt.get("artists") or tt.get("artists") or music_director or "Various Artists"
        track_movie = rt.get("m_name") or title
        track_id = rt.get("id") or (idx + 1)
        dl_path = rt.get("dl_path") or ""

        # If table track had download links, use them
        link_128 = tt.get("dl_128") or dl_path
        link_320 = tt.get("dl_320") or dl_path

        # Construct stream and download URLs for frontend
        stream_path = f"/api/stream?path={urllib.parse.quote(dl_path or link_128)}&referer={urllib.parse.quote(full_url)}"
        dl_128_url = f"/api/download?path={urllib.parse.quote(link_128)}&name={urllib.parse.quote(track_name)}&movie={urllib.parse.quote(track_movie)}&quality=128kbps&referer={urllib.parse.quote(full_url)}"
        dl_320_url = f"/api/download?path={urllib.parse.quote(link_320)}&name={urllib.parse.quote(track_name)}&movie={urllib.parse.quote(track_movie)}&quality=320kbps&referer={urllib.parse.quote(full_url)}"

        final_tracks.append({
            "id": track_id,
            "track_number": idx + 1,
            "name": track_name,
            "movie": track_movie,
            "artists": track_artists,
            "duration": tt.get("duration", "03:45"),
            "downloads": tt.get("downloads", ""),
            "poster": poster,
            "stream_url": stream_path,
            "download_128": dl_128_url,
            "download_320": dl_320_url
        })

    return {
        "title": title,
        "path": clean_path,
        "full_url": full_url,
        "poster": poster,
        "starring": starring,
        "music_director": music_director,
        "director": director,
        "lyricists": lyricists,
        "year": year,
        "track_count": len(final_tracks),
        "tracks": final_tracks
    }

def fetch_lyrics(track_name: str, artist_name: str = ""):
    """Fetch lyrics from LRCLIB API with plain and synced LRC support"""
    try:
        clean_name = re.sub(r'\(.*?\)|\[.*?\]', '', track_name).strip()
        clean_artist = re.sub(r'\(.*?\)|\[.*?\]', '', artist_name).split(',')[0].strip() if artist_name else ""
        
        q = urllib.parse.quote(clean_name)
        url = f"https://lrclib.net/api/search?q={q}"
        if clean_artist:
            url += f"&artist_name={urllib.parse.quote(clean_artist)}"
            
        req = urllib.request.Request(url, headers={"User-Agent": "MassTamilanMusicApp/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                item = data[0]
                return {
                    "found": True,
                    "title": item.get("trackName"),
                    "artist": item.get("artistName"),
                    "album": item.get("albumName"),
                    "plain_lyrics": item.get("plainLyrics", ""),
                    "synced_lyrics": item.get("syncedLyrics", "")
                }
    except Exception as e:
        logging.warning(f"Lyrics fetch error: {e}")

    return {
        "found": False,
        "plain_lyrics": f"Lyrics for '{track_name}' are currently not available.\nEnjoy the music!",
        "synced_lyrics": ""
    }
