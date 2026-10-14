/**
 * Spotify-Style Music Player Engine for Mobile
 * Features: Single Song Loop, Repeat All, Queue, Scrubber, MediaSession, Mini & Fullscreen Sync
 */

class SpotifyPlayer {
  constructor() {
    this.audio = document.getElementById('nativeAudio');
    this.queue = [];
    this.currentIndex = -1;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 0; // 0: Off, 1: Repeat All, 2: Loop Current Song

    this.initAudio();
    this.bindEvents();
  }

  initAudio() {
    const savedVol = StorageManager.getVolume();
    this.audio.volume = savedVol;

    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', (e) => this.onError(e));
  }

  bindEvents() {
    // Mini Player Play/Pause
    const miniPlayBtn = document.getElementById('miniPlayPauseBtn');
    if (miniPlayBtn) {
      miniPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlayPause();
      });
    }

    // Mini Player Like Button
    const miniLikeBtn = document.getElementById('miniLikeBtn');
    if (miniLikeBtn) {
      miniLikeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.currentTrack) {
          const isAdded = StorageManager.toggleFavorite(this.currentTrack);
          this.updateLikeButtons(isAdded);
          window.app && window.app.showToast(isAdded ? 'Added to Liked Songs ❤️' : 'Removed from Liked Songs');
        }
      });
    }

    // Fullscreen Play/Pause
    const fsPlayBtn = document.getElementById('fsPlayPauseBtn');
    if (fsPlayBtn) {
      fsPlayBtn.addEventListener('click', () => this.togglePlayPause());
    }

    // Fullscreen Prev / Next
    const fsPrevBtn = document.getElementById('fsPrevBtn');
    if (fsPrevBtn) {
      fsPrevBtn.addEventListener('click', () => this.playPrev());
    }

    const fsNextBtn = document.getElementById('fsNextBtn');
    if (fsNextBtn) {
      fsNextBtn.addEventListener('click', () => this.playNext());
    }

    // Fullscreen Shuffle
    const fsShuffleBtn = document.getElementById('fsShuffleBtn');
    if (fsShuffleBtn) {
      fsShuffleBtn.addEventListener('click', () => this.toggleShuffle());
    }

    // Fullscreen Repeat / Loop
    const fsRepeatBtn = document.getElementById('fsRepeatBtn');
    if (fsRepeatBtn) {
      fsRepeatBtn.addEventListener('click', () => this.toggleRepeat());
    }

    // Fullscreen Like Button
    const fsLikeBtn = document.getElementById('fsLikeBtn');
    if (fsLikeBtn) {
      fsLikeBtn.addEventListener('click', () => {
        if (this.currentTrack) {
          const isAdded = StorageManager.toggleFavorite(this.currentTrack);
          this.updateLikeButtons(isAdded);
          window.app && window.app.showToast(isAdded ? 'Added to Liked Songs ❤️' : 'Removed from Liked Songs');
        }
      });
    }

    // Scrubber seeking
    const scrubberTrack = document.getElementById('fsScrubberTrack');
    if (scrubberTrack) {
      let isSeeking = false;
      const seek = (e) => {
        const rect = scrubberTrack.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (this.audio.duration) {
          this.audio.currentTime = pos * this.audio.duration;
        }
      };

      scrubberTrack.addEventListener('mousedown', (e) => { isSeeking = true; seek(e); });
      scrubberTrack.addEventListener('touchstart', (e) => { isSeeking = true; seek(e); }, { passive: true });
      window.addEventListener('mousemove', (e) => { if (isSeeking) seek(e); });
      window.addEventListener('touchmove', (e) => { if (isSeeking) seek(e); }, { passive: true });
      window.addEventListener('mouseup', () => { isSeeking = false; });
      window.addEventListener('touchend', () => { isSeeking = false; });
    }

    // Quick download from Fullscreen
    const fsDlBtn = document.getElementById('fsDownloadBtn');
    if (fsDlBtn) {
      fsDlBtn.addEventListener('click', () => {
        if (!this.currentTrack) return;
        const dl = this.currentTrack.download_320 || this.currentTrack.stream_url;
        window.app && window.app.showToast(`Downloading: ${this.currentTrack.name} (320kbps)... 📥`);
        const a = document.createElement('a');
        a.href = dl;
        a.download = `${this.currentTrack.name} - ${this.currentTrack.movie}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }

    // Add to playlist from Fullscreen
    const fsAddPlBtn = document.getElementById('fsAddToPlaylistBtn');
    if (fsAddPlBtn) {
      fsAddPlBtn.addEventListener('click', () => {
        if (this.currentTrack && window.app) {
          window.app.openAddToPlaylistModal(this.currentTrack);
        }
      });
    }
  }

  loadAndPlay(track, queueList = null, index = 0) {
    if (queueList) {
      this.queue = [...queueList];
      this.currentIndex = index;
    } else if (this.currentIndex === -1 || !this.queue.some(t => t.id === track.id)) {
      this.queue = [track];
      this.currentIndex = 0;
    }

    this.currentTrack = track;
    this.updateUI(track);

    // Set audio source
    this.audio.src = track.stream_url;
    this.audio.load();

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Autoplay error / user interaction required:', err);
      });
    }

    this.updateMediaSession(track);
    window.dispatchEvent(new CustomEvent('trackChanged', { detail: { track } }));
  }

  togglePlayPause() {
    if (!this.currentTrack && this.queue.length > 0) {
      this.loadAndPlay(this.queue[0], this.queue, 0);
      return;
    }
    if (!this.currentTrack) return;

    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  playNext() {
    if (this.queue.length === 0) return;

    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    }

    const next = this.queue[this.currentIndex];
    this.loadAndPlay(next, this.queue, this.currentIndex);
  }

  playPrev() {
    if (this.queue.length === 0) return;

    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    const prev = this.queue[this.currentIndex];
    this.loadAndPlay(prev, this.queue, this.currentIndex);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    const btn = document.getElementById('fsShuffleBtn');
    if (btn) btn.classList.toggle('active', this.isShuffle);
    window.app && window.app.showToast(this.isShuffle ? 'Shuffle: ON 🔀' : 'Shuffle: OFF');
  }

  toggleRepeat() {
    // 0: Off -> 1: Repeat All -> 2: Loop Song
    this.repeatMode = (this.repeatMode + 1) % 3;
    this.updateRepeatUI();
  }

  setLoopSingle(enable = true) {
    this.repeatMode = enable ? 2 : 0;
    this.updateRepeatUI();
  }

  updateRepeatUI() {
    const btn = document.getElementById('fsRepeatBtn');
    const badge = document.getElementById('repeatBadgeOne');
    if (!btn) return;

    if (this.repeatMode === 0) {
      btn.classList.remove('active');
      if (badge) badge.style.display = 'none';
      window.app && window.app.showToast('Loop: OFF');
    } else if (this.repeatMode === 1) {
      btn.classList.add('active');
      if (badge) badge.style.display = 'none';
      window.app && window.app.showToast('Repeat All: ON 🔁');
    } else if (this.repeatMode === 2) {
      btn.classList.add('active');
      if (badge) badge.style.display = 'inline-block';
      window.app && window.app.showToast('Looping This Song 🔂');
    }
  }

  onPlay() {
    this.isPlaying = true;
    this.setPlayPauseIcons(true);
  }

  onPause() {
    this.isPlaying = false;
    this.setPlayPauseIcons(false);
  }

  setPlayPauseIcons(isPlaying) {
    // Mini Player
    const miniPlay = document.getElementById('miniIconPlay');
    const miniPause = document.getElementById('miniIconPause');
    if (miniPlay && miniPause) {
      miniPlay.style.display = isPlaying ? 'none' : 'block';
      miniPause.style.display = isPlaying ? 'block' : 'none';
    }

    // Fullscreen Player
    const fsPlay = document.getElementById('fsIconPlay');
    const fsPause = document.getElementById('fsIconPause');
    if (fsPlay && fsPause) {
      fsPlay.style.display = isPlaying ? 'none' : 'block';
      fsPause.style.display = isPlaying ? 'block' : 'none';
    }
  }

  onTimeUpdate() {
    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 0;

    // Mini Player progress line
    const miniProgress = document.getElementById('miniProgressBar');
    if (miniProgress && dur) {
      miniProgress.style.width = `${(cur / dur) * 100}%`;
    }

    // Fullscreen Scrubber
    const fsProgress = document.getElementById('fsScrubberProgress');
    const fsThumb = document.getElementById('fsScrubberThumb');
    const timeCur = document.getElementById('fsTimeCurrent');
    const timeRem = document.getElementById('fsTimeRemaining');

    if (timeCur) timeCur.textContent = this.formatTime(cur);

    if (dur) {
      if (timeRem) timeRem.textContent = this.formatTime(dur);
      const pct = (cur / dur) * 100;
      if (fsProgress) fsProgress.style.width = `${pct}%`;
      if (fsThumb) fsThumb.style.left = `${pct}%`;
    }
  }

  onEnded() {
    if (this.repeatMode === 2) {
      // Loop single song indefinitely
      this.audio.currentTime = 0;
      this.audio.play();
    } else if (this.repeatMode === 1 || this.currentIndex < this.queue.length - 1) {
      this.playNext();
    } else {
      this.onPause();
    }
  }

  onError(e) {
    console.error('Audio stream error', e);
  }

  updateUI(track) {
    const posterUrl = track.poster ? `/api/image?url=${encodeURIComponent(track.poster)}` : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23242424"/></svg>';

    // Show Mini Player container
    const miniPlayer = document.getElementById('miniPlayer');
    if (miniPlayer) miniPlayer.style.display = 'flex';

    // Mini Player
    const miniThumb = document.getElementById('miniArtwork');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    if (miniThumb) miniThumb.src = posterUrl;
    if (miniTitle) miniTitle.textContent = track.name;
    if (miniArtist) miniArtist.textContent = track.artists || track.movie;

    // Fullscreen Player
    const fsArt = document.getElementById('fsArtwork');
    const fsTitle = document.getElementById('fsTitle');
    const fsArtist = document.getElementById('fsArtist');
    const fsAlbumLabel = document.getElementById('fsPlayingFromLabel');

    if (fsArt) fsArt.src = posterUrl;
    if (fsTitle) fsTitle.textContent = track.name;
    if (fsArtist) fsArtist.textContent = track.artists || track.movie;
    if (fsAlbumLabel) fsAlbumLabel.textContent = track.movie ? `PLAYING FROM ALBUM: ${track.movie}` : 'SPOTIFY TAMIL';

    this.updateLikeButtons(StorageManager.isFavorite(track.id));
  }

  updateLikeButtons(isLiked) {
    const miniLike = document.getElementById('miniLikeBtn');
    const fsLike = document.getElementById('fsLikeBtn');

    [miniLike, fsLike].forEach(btn => {
      if (btn) {
        btn.classList.toggle('liked', isLiked);
        btn.querySelector('svg').setAttribute('fill', isLiked ? '#1db954' : 'none');
        btn.querySelector('svg').setAttribute('stroke', isLiked ? '#1db954' : '#b3b3b3');
      }
    });
  }

  updateMediaSession(track) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: track.artists,
        album: track.movie,
        artwork: [{ src: track.poster, sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
    }
  }

  formatTime(secs) {
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  }
}
