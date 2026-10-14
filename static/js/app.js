/**
 * Spotify Mobile App Controller for TamilPulse
 * Focused strictly on: Search, Unlimited Playlists, Loop Mode, and Mobile-Width UX
 */

class SpotifyMobileApp {
  constructor() {
    this.currentView = 'search';
    this.currentAlbum = null;
    this.selectedPlaylist = null;
    this.trackToAddToPlaylist = null;
    this.homeData = null;

    this.init();
  }

  async init() {
    window.player = new SpotifyPlayer();

    this.bindNavigation();
    this.bindSearch();
    this.bindPlaylists();
    this.bindFullscreen();
    this.bindSheets();

    // Listen to storage changes
    window.addEventListener('playlistsUpdated', () => {
      this.renderPlaylists();
      this.updatePillCounts();
      if (this.selectedPlaylist) {
        const fresh = StorageManager.getPlaylist(this.selectedPlaylist.id);
        if (fresh) {
          this.selectedPlaylist = fresh;
          this.renderPlaylistDetail(fresh);
        }
      }
    });

    window.addEventListener('trackChanged', (e) => {
      this.onTrackChanged(e.detail.track);
    });

    // Load initial discovery data
    await this.loadDiscovery();
    this.renderPlaylists();
    this.updatePillCounts();
  }

  // ==========================================
  // Navigation
  // ==========================================
  bindNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const nav = tab.getAttribute('data-nav');
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (nav === 'search') {
          this.showScreen('search');
        } else if (nav === 'library') {
          this.showScreen('library');
          this.renderPlaylists();
        }
      });
    });

    // Back from Playlist Detail
    document.getElementById('btnBackFromPlaylist').addEventListener('click', () => {
      this.showScreen('library');
    });

    // Back from Album Detail
    document.getElementById('btnBackFromAlbum').addEventListener('click', () => {
      this.showScreen('search');
    });
  }

  showScreen(screenId) {
    this.currentView = screenId;
    document.querySelectorAll('.view-screen').forEach(s => s.style.display = 'none');

    const target = document.getElementById(`view-${screenId}`);
    if (target) {
      target.style.display = 'block';
      const container = document.getElementById('mobileContent');
      if (container) container.scrollTop = 0;
    }
  }

  // ==========================================
  // Search & Discovery
  // ==========================================
  async loadDiscovery() {
    try {
      const res = await fetch('/api/home');
      if (!res.ok) throw new Error('Home API failed');
      this.homeData = await res.json();

      const grid = document.getElementById('discoveryAlbumsGrid');
      if (grid && this.homeData.latest) {
        grid.innerHTML = this.homeData.latest.map(album => {
          const imgUrl = album.img ? `/api/image?url=${encodeURIComponent(album.img)}` : '';
          return `
            <div class="album-tile" data-href="${album.href}">
              <img src="${imgUrl}" alt="${album.title}" class="album-tile-img" loading="lazy">
              <div class="album-tile-title">${album.title}</div>
              <div class="album-tile-sub">${album.starring || album.music || 'Tamil Release'}</div>
            </div>
          `;
        }).join('');

        grid.querySelectorAll('.album-tile').forEach(tile => {
          tile.addEventListener('click', () => {
            const href = tile.getAttribute('data-href');
            this.openAlbum(href);
          });
        });
      }
    } catch (e) {
      console.warn('Discovery load error', e);
    }
  }

  bindSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClearBtn');
    const resultsSection = document.getElementById('searchResultsSection');
    const discoverySection = document.getElementById('searchDiscoverySection');
    let debounceTimer = null;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      searchClear.style.display = query ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (query.length >= 2) {
        debounceTimer = setTimeout(() => {
          this.executeSearch(query);
        }, 300);
      } else if (query.length === 0) {
        resultsSection.style.display = 'none';
        discoverySection.style.display = 'block';
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      resultsSection.style.display = 'none';
      discoverySection.style.display = 'block';
    });

    // Quick Category cards
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const query = card.getAttribute('data-query');
        searchInput.value = query;
        searchClear.style.display = 'block';
        this.executeSearch(query);
      });
    });
  }

  async executeSearch(query) {
    const resultsSection = document.getElementById('searchResultsSection');
    const discoverySection = document.getElementById('searchDiscoverySection');
    const resultsList = document.getElementById('searchResultsList');

    resultsSection.style.display = 'block';
    discoverySection.style.display = 'none';
    resultsList.innerHTML = '<div style="color:#b3b3b3; padding:16px; font-size:13px;">Searching MassTamilan...</div>';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        resultsList.innerHTML = '<div style="color:#b3b3b3; padding:20px; font-size:13px; text-align:center;">No songs found for "' + query + '"</div>';
        return;
      }

      resultsList.innerHTML = data.results.map((item, i) => {
        const img = item.img ? `/api/image?url=${encodeURIComponent(item.img)}` : '';
        return `
          <div class="track-item" data-href="${item.href}">
            <img src="${img}" alt="Cover" class="track-thumb">
            <div class="track-info-col">
              <div class="track-name">${item.title}</div>
              <div class="track-meta">${item.starring || item.music || 'Tamil Soundtrack'}</div>
            </div>
            <div class="track-actions">
              <button class="track-btn-action" data-action="explore" title="Open Album">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      resultsList.querySelectorAll('.track-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const href = itemEl.getAttribute('data-href');
          this.openAlbum(href);
        });
      });

    } catch (e) {
      resultsList.innerHTML = '<div style="color:#ef4444; padding:16px;">Search failed. Try again.</div>';
    }
  }

  // ==========================================
  // Album Detail View
  // ==========================================
  async openAlbum(albumPath) {
    this.showToast('Loading album tracks... 🎵');
    try {
      const res = await fetch(`/api/album?path=${encodeURIComponent(albumPath)}`);
      if (!res.ok) throw new Error('Album fetch error');
      const album = await res.json();
      this.currentAlbum = album;

      // Update Album Header
      const cover = document.getElementById('albumDetailCover');
      cover.src = album.poster ? `/api/image?url=${encodeURIComponent(album.poster)}` : '';
      document.getElementById('albumDetailTitle').textContent = album.title;
      document.getElementById('albumDetailMeta').textContent = `${album.starring || 'Tamil Movie'} • ${album.music_director || ''}`;
      document.getElementById('albumDetailCount').textContent = `${album.track_count || album.tracks.length} songs • ${album.year || '2025/2026'}`;

      // Play All Button
      document.getElementById('albumPlayAllBtn').onclick = () => {
        if (album.tracks && album.tracks.length > 0) {
          window.player.loadAndPlay(album.tracks[0], album.tracks, 0);
          this.showToast(`Playing "${album.title}" 🎶`);
        }
      };

      // Render Tracks List
      const listEl = document.getElementById('albumTracksList');
      if (album.tracks && album.tracks.length > 0) {
        listEl.innerHTML = album.tracks.map((track, i) => {
          const img = album.poster ? `/api/image?url=${encodeURIComponent(album.poster)}` : '';
          const isCurrent = window.player.currentTrack && String(window.player.currentTrack.id) === String(track.id);

          return `
            <div class="track-item ${isCurrent ? 'playing' : ''}" data-track-index="${i}">
              <img src="${img ? `/api/image?url=${encodeURIComponent(img)}` : ''}" alt="Cover" class="track-thumb">
              <div class="track-info-col">
                <div class="track-name">${track.name}</div>
                <div class="track-meta">${track.artists || album.title} • ${track.duration || '03:45'}</div>
              </div>
              <div class="track-actions">
                <button class="track-btn-action" data-action="add-pl" title="Add to Playlist">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <a href="${track.download_320 || track.stream_url}" class="track-btn-action" download title="Download 320k MP3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </a>
              </div>
            </div>
          `;
        }).join('');

        // Bind clicks
        listEl.querySelectorAll('.track-item').forEach(itemEl => {
          const idx = parseInt(itemEl.getAttribute('data-track-index'));
          const track = album.tracks[idx];

          itemEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="add-pl"]') || e.target.closest('a')) return;
            window.player.loadAndPlay(track, album.tracks, idx);
          });

          const addPlBtn = itemEl.querySelector('[data-action="add-pl"]');
          if (addPlBtn) {
            addPlBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.openAddToPlaylistModal(track);
            });
          }
        });
      } else {
        listEl.innerHTML = '<div style="color:#b3b3b3; padding:20px; text-align:center;">No playable tracks found.</div>';
      }

      this.showScreen('album-detail');
    } catch (e) {
      console.error('Error opening album', e);
      this.showToast('Could not load album ⚠️');
    }
  }

  // ==========================================
  // Unlimited Playlists Management
  // ==========================================
  bindPlaylists() {
    // Open Create Playlist Dialog
    document.getElementById('btnOpenCreatePlaylist').addEventListener('click', () => {
      this.openCreatePlaylistDialog();
    });

    document.getElementById('sheetNewPlaylistBtn').addEventListener('click', () => {
      this.closeSheets();
      this.openCreatePlaylistDialog();
    });

    // Confirm Create Playlist
    document.getElementById('btnConfirmCreatePlaylist').addEventListener('click', () => {
      this.createPlaylistFromInput();
    });

    document.getElementById('newPlaylistInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.createPlaylistFromInput();
    });

    // Cancel Create Playlist
    document.getElementById('btnCancelCreatePlaylist').addEventListener('click', () => {
      document.getElementById('dialogCreatePlaylist').classList.remove('open');
    });

    // Delete Playlist Button in Playlist Detail
    document.getElementById('btnDeletePlaylist').addEventListener('click', () => {
      if (!this.selectedPlaylist) return;
      if (this.selectedPlaylist.isFavoriteList) {
        this.showToast('Liked Songs cannot be deleted');
        return;
      }
      if (confirm(`Delete playlist "${this.selectedPlaylist.name}"?`)) {
        StorageManager.deletePlaylist(this.selectedPlaylist.id);
        this.showToast('Playlist deleted');
        this.showScreen('library');
      }
    });
  }

  openCreatePlaylistDialog() {
    const dialog = document.getElementById('dialogCreatePlaylist');
    const input = document.getElementById('newPlaylistInput');
    const playlists = StorageManager.getPlaylists();
    input.value = `My Playlist #${playlists.length}`;
    dialog.classList.add('open');
    input.focus();
    input.select();
  }

  createPlaylistFromInput() {
    const input = document.getElementById('newPlaylistInput');
    const name = input.value.trim();
    if (name) {
      const created = StorageManager.createPlaylist(name);
      document.getElementById('dialogCreatePlaylist').classList.remove('open');
      this.showToast(`Created playlist "${created.name}" 🎉`);

      // If we had a track waiting to be added, add it!
      if (this.trackToAddToPlaylist) {
        StorageManager.addTrackToPlaylist(created.id, this.trackToAddToPlaylist);
        this.showToast(`Added to "${created.name}"`);
        this.trackToAddToPlaylist = null;
      }

      this.openPlaylistDetail(created.id);
    }
  }

  renderPlaylists() {
    const listContainer = document.getElementById('playlistsList');
    if (!listContainer) return;

    const playlists = StorageManager.getPlaylists();
    listContainer.innerHTML = playlists.map(pl => {
      const isFav = pl.isFavoriteList;
      const count = pl.tracks ? pl.tracks.length : 0;
      const cover = pl.cover ? (pl.cover.startsWith('http') && pl.cover.includes('masstamilan') ? `/api/image?url=${encodeURIComponent(pl.cover)}` : pl.cover) : '';

      return `
        <div class="playlist-row" data-id="${pl.id}">
          ${isFav ? `
            <div class="playlist-thumb-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
            </div>
          ` : `
            <img src="${cover || 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'58\' height=\'58\'><rect width=\'58\' height=\'58\' fill=\'%23282828\'/></svg>'}" alt="Cover" class="playlist-thumb">
          `}
          <div class="playlist-row-info">
            <div class="playlist-row-title">${pl.name}</div>
            <div class="playlist-row-sub">Playlist • ${count} ${count === 1 ? 'song' : 'songs'}</div>
          </div>
          <button class="track-btn-action" title="Open Playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.playlist-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        this.openPlaylistDetail(id);
      });
    });
  }

  openPlaylistDetail(playlistId) {
    const pl = StorageManager.getPlaylist(playlistId);
    if (!pl) return;
    this.selectedPlaylist = pl;

    this.renderPlaylistDetail(pl);
    this.showScreen('playlist-detail');
  }

  renderPlaylistDetail(pl) {
    const coverEl = document.getElementById('plDetailCover');
    const isFav = pl.isFavoriteList;
    const coverUrl = pl.cover ? (pl.cover.startsWith('http') && pl.cover.includes('masstamilan') ? `/api/image?url=${encodeURIComponent(pl.cover)}` : pl.cover) : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
    coverEl.src = coverUrl;

    document.getElementById('plDetailTitle').textContent = pl.name;
    document.getElementById('plDetailDesc').textContent = pl.description || 'Created by You';
    document.getElementById('plDetailCount').textContent = `${pl.tracks.length} ${pl.tracks.length === 1 ? 'song' : 'songs'}`;

    // Hide delete button for Liked Songs
    const delBtn = document.getElementById('btnDeletePlaylist');
    if (delBtn) delBtn.style.display = isFav ? 'none' : 'block';

    // Play All
    document.getElementById('plPlayAllBtn').onclick = () => {
      if (pl.tracks.length > 0) {
        window.player.loadAndPlay(pl.tracks[0], pl.tracks, 0);
        this.showToast(`Playing "${pl.name}" 🎶`);
      } else {
        this.showToast('Playlist is empty. Add songs from Search! 🔍');
      }
    };

    // Shuffle All
    document.getElementById('plShuffleBtn').onclick = () => {
      if (pl.tracks.length > 0) {
        const randIdx = Math.floor(Math.random() * pl.tracks.length);
        window.player.isShuffle = true;
        const shufBtn = document.getElementById('fsShuffleBtn');
        if (shufBtn) shufBtn.classList.add('active');
        window.player.loadAndPlay(pl.tracks[randIdx], pl.tracks, randIdx);
        this.showToast(`Shuffling "${pl.name}" 🔀`);
      }
    };

    // Render Track List
    const listEl = document.getElementById('plTracksList');
    if (!pl.tracks || pl.tracks.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:36px 16px; color:#b3b3b3;">
          <p style="font-size:14px; margin-bottom:12px;">This playlist is empty.</p>
          <button class="pill active" id="btnGoSearchEmptyPl" style="margin:0 auto; cursor:pointer;">Search Tamil Songs</button>
        </div>
      `;
      const btn = document.getElementById('btnGoSearchEmptyPl');
      if (btn) btn.onclick = () => this.showScreen('search');
      return;
    }

    listEl.innerHTML = pl.tracks.map((track, i) => {
      const img = track.poster ? `/api/image?url=${encodeURIComponent(track.poster)}` : '';
      const isCurrent = window.player.currentTrack && String(window.player.currentTrack.id) === String(track.id);

      return `
        <div class="track-item ${isCurrent ? 'playing' : ''}" data-track-index="${i}">
          <img src="${img}" alt="Cover" class="track-thumb">
          <div class="track-info-col">
            <div class="track-name">${track.name}</div>
            <div class="track-meta">${track.artists || track.movie} • ${track.duration || '03:45'}</div>
          </div>
          <div class="track-actions">
            <button class="track-btn-action" data-action="remove" title="Remove from Playlist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#727272" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <a href="${track.download_320 || track.stream_url}" class="track-btn-action" download title="Download MP3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.track-item').forEach(itemEl => {
      const idx = parseInt(itemEl.getAttribute('data-track-index'));
      const track = pl.tracks[idx];

      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="remove"]') || e.target.closest('a')) return;
        window.player.loadAndPlay(track, pl.tracks, idx);
      });

      const removeBtn = itemEl.querySelector('[data-action="remove"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          StorageManager.removeTrackFromPlaylist(pl.id, track.id);
          this.showToast(`Removed "${track.name}" from playlist`);
        });
      }
    });
  }

  updatePillCounts() {
    const playlists = StorageManager.getPlaylists();
    const favPl = playlists.find(p => p.isFavoriteList);
    const count = favPl ? favPl.tracks.length : 0;
    const badge = document.getElementById('pillFavCount');
    if (badge) badge.textContent = `${count} Liked`;
  }

  // ==========================================
  // Fullscreen Player Transitions
  // ==========================================
  bindFullscreen() {
    const miniExpand = document.getElementById('miniPlayerExpandZone');
    const fsPlayer = document.getElementById('fullscreenPlayer');
    const btnCloseFs = document.getElementById('btnCloseFullscreen');

    miniExpand.addEventListener('click', () => {
      fsPlayer.classList.add('open');
    });

    btnCloseFs.addEventListener('click', () => {
      fsPlayer.classList.remove('open');
    });

    // Single Song Loop Pill
    const loopPill = document.getElementById('fsToggleLoopSingleBtn');
    if (loopPill) {
      loopPill.addEventListener('click', () => {
        if (window.player.repeatMode === 2) {
          window.player.setLoopSingle(false);
          loopPill.style.borderColor = 'var(--border-subtle)';
          loopPill.style.color = '#fff';
        } else {
          window.player.setLoopSingle(true);
          loopPill.style.borderColor = 'var(--sp-green)';
          loopPill.style.color = 'var(--sp-green)';
        }
      });
    }

    // Lyrics Button
    document.getElementById('fsLyricsBtn').addEventListener('click', () => {
      this.openLyricsSheet();
    });
  }

  // ==========================================
  // Modals & Bottom Sheets
  // ==========================================
  bindSheets() {
    const backdrop = document.getElementById('sheetBackdrop');
    const closeAddToPl = document.getElementById('btnCloseSheet');
    const closeLyrics = document.getElementById('btnCloseLyrics');

    backdrop.addEventListener('click', () => this.closeSheets());
    if (closeAddToPl) closeAddToPl.addEventListener('click', () => this.closeSheets());
    if (closeLyrics) closeLyrics.addEventListener('click', () => this.closeSheets());
  }

  closeSheets() {
    document.getElementById('sheetBackdrop').classList.remove('open');
    document.getElementById('addToPlaylistSheet').classList.remove('open');
    document.getElementById('lyricsSheet').classList.remove('open');
  }

  openAddToPlaylistModal(track) {
    this.trackToAddToPlaylist = track;
    const sheet = document.getElementById('addToPlaylistSheet');
    const backdrop = document.getElementById('sheetBackdrop');
    const listEl = document.getElementById('sheetPlaylistsList');

    const playlists = StorageManager.getPlaylists();
    listEl.innerHTML = playlists.map(pl => {
      const hasTrack = pl.tracks && pl.tracks.some(t => String(t.id) === String(track.id));
      return `
        <div class="playlist-row" data-sheet-pl-id="${pl.id}">
          <div class="playlist-row-info">
            <div class="playlist-row-title">${pl.name}</div>
            <div class="playlist-row-sub">${pl.tracks.length} songs</div>
          </div>
          ${hasTrack ? `
            <span style="color:var(--sp-green); font-size:12px; font-weight:700;">Added ✓</span>
          ` : `
            <span style="color:#b3b3b3; font-size:20px; font-weight:700;">+</span>
          `}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-sheet-pl-id]').forEach(row => {
      row.addEventListener('click', () => {
        const plId = row.getAttribute('data-sheet-pl-id');
        const pl = StorageManager.getPlaylist(plId);
        const added = StorageManager.addTrackToPlaylist(plId, track);
        this.closeSheets();
        if (added) {
          this.showToast(`Added to "${pl.name}" 🎶`);
        } else {
          this.showToast(`Already in "${pl.name}"`);
        }
      });
    });

    backdrop.classList.add('open');
    sheet.classList.add('open');
  }

  async openLyricsSheet() {
    const sheet = document.getElementById('lyricsSheet');
    const backdrop = document.getElementById('sheetBackdrop');
    const bodyEl = document.getElementById('lyricsBody');
    const titleEl = document.getElementById('lyricsTitle');

    const track = window.player.currentTrack;
    if (!track) return;

    titleEl.textContent = `${track.name} — Lyrics`;
    bodyEl.textContent = 'Searching LRCLIB synchronized lyrics...';

    backdrop.classList.add('open');
    sheet.classList.add('open');

    try {
      const res = await fetch(`/api/lyrics?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artists || '')}`);
      const data = await res.json();
      if (data.plain_lyrics) {
        bodyEl.textContent = data.plain_lyrics;
      } else if (data.synced_lyrics) {
        bodyEl.textContent = data.synced_lyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '');
      } else {
        bodyEl.textContent = `Lyrics for "${track.name}" are not available. Enjoy the music!`;
      }
    } catch (e) {
      bodyEl.textContent = 'Lyrics currently unavailable.';
    }
  }

  onTrackChanged(track) {
    // Highlight active track item in active lists
    document.querySelectorAll('.track-item').forEach(el => el.classList.remove('playing'));
    // Dynamic backdrop shift
    const backdrop = document.getElementById('ambientBackdrop');
    if (backdrop) {
      const colors = ['#1db954', '#6366f1', '#ec4899', '#3b82f6', '#f59e0b'];
      const col = colors[Math.floor(Math.random() * colors.length)];
      backdrop.style.background = `radial-gradient(circle at 50% 30%, ${col}20 0%, transparent 60%)`;
    }
  }

  showToast(message) {
    const toast = document.getElementById('spotifyToast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2800);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new SpotifyMobileApp();
});
