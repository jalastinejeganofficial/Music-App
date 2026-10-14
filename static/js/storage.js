/**
 * Storage Manager for Spotify-style TamilPulse Mobile App
 * Supports Unlimited Playlists, Favorites, and Player Preferences in localStorage
 */

const StorageManager = {
  PLAYLISTS_KEY: 'spotify_tamil_playlists',
  FAV_KEY: 'spotify_tamil_favorites',
  SETTINGS_KEY: 'spotify_tamil_settings',

  // ==========================================
  // Playlists (Unlimited custom playlists)
  // ==========================================
  getPlaylists() {
    try {
      const data = localStorage.getItem(this.PLAYLISTS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      // Initialize with a default playlist if none exists
      const defaultPlaylists = [
        {
          id: 'pl_favorites',
          name: 'Liked Songs',
          description: 'Your saved favorite tracks',
          isFavoriteList: true,
          cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
          createdAt: Date.now(),
          tracks: []
        }
      ];
      this.savePlaylists(defaultPlaylists);
      return defaultPlaylists;
    } catch (e) {
      console.error('Failed to get playlists', e);
      return [];
    }
  },

  savePlaylists(playlists) {
    try {
      localStorage.setItem(this.PLAYLISTS_KEY, JSON.stringify(playlists));
      window.dispatchEvent(new CustomEvent('playlistsUpdated', { detail: { playlists } }));
    } catch (e) {
      console.error('Failed to save playlists', e);
    }
  },

  createPlaylist(name, description = '') {
    const playlists = this.getPlaylists();
    const newPlaylist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim() || `My Playlist #${playlists.length + 1}`,
      description: description.trim(),
      isFavoriteList: false,
      cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
      createdAt: Date.now(),
      tracks: []
    };
    playlists.push(newPlaylist);
    this.savePlaylists(playlists);
    return newPlaylist;
  },

  getPlaylist(id) {
    const playlists = this.getPlaylists();
    return playlists.find(p => p.id === id) || null;
  },

  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    // Do not delete default favorites list
    playlists = playlists.filter(p => p.id !== id || p.isFavoriteList);
    this.savePlaylists(playlists);
  },

  addTrackToPlaylist(playlistId, track) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return false;

    // Check if track already in playlist
    const exists = pl.tracks.some(t => String(t.id) === String(track.id));
    if (!exists) {
      // Store full playable track metadata
      pl.tracks.push({
        id: track.id,
        name: track.name,
        movie: track.movie || 'Tamil Song',
        artists: track.artists || 'Various Artists',
        duration: track.duration || '03:45',
        poster: track.poster || '',
        stream_url: track.stream_url,
        download_320: track.download_320 || track.stream_url,
        download_128: track.download_128 || track.stream_url
      });
      // If playlist has no custom cover, update cover with the song's poster
      if (track.poster) {
        pl.cover = track.poster;
      }
      this.savePlaylists(playlists);
      return true;
    }
    return false; // Already in playlist
  },

  removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return false;

    pl.tracks = pl.tracks.filter(t => String(t.id) !== String(trackId));
    this.savePlaylists(playlists);
    return true;
  },

  // ==========================================
  // Favorites Helpers
  // ==========================================
  isFavorite(trackId) {
    const playlists = this.getPlaylists();
    const favPl = playlists.find(p => p.isFavoriteList);
    if (!favPl) return false;
    return favPl.tracks.some(t => String(t.id) === String(trackId));
  },

  toggleFavorite(track) {
    const playlists = this.getPlaylists();
    let favPl = playlists.find(p => p.isFavoriteList);
    if (!favPl) {
      favPl = {
        id: 'pl_favorites',
        name: 'Liked Songs',
        description: 'Your saved favorite tracks',
        isFavoriteList: true,
        cover: track.poster || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
        createdAt: Date.now(),
        tracks: []
      };
      playlists.unshift(favPl);
    }

    const existsIndex = favPl.tracks.findIndex(t => String(t.id) === String(track.id));
    let isAdded = false;

    if (existsIndex !== -1) {
      favPl.tracks.splice(existsIndex, 1);
      isAdded = false;
    } else {
      favPl.tracks.unshift({
        id: track.id,
        name: track.name,
        movie: track.movie || 'Tamil Song',
        artists: track.artists || 'Various Artists',
        duration: track.duration || '03:45',
        poster: track.poster || '',
        stream_url: track.stream_url,
        download_320: track.download_320 || track.stream_url,
        download_128: track.download_128 || track.stream_url
      });
      if (track.poster) favPl.cover = track.poster;
      isAdded = true;
    }

    this.savePlaylists(playlists);
    return isAdded;
  },

  // Volume
  getVolume() {
    const vol = localStorage.getItem('spotify_tamil_volume');
    return vol !== null ? parseFloat(vol) : 0.85;
  },

  setVolume(vol) {
    localStorage.setItem('spotify_tamil_volume', vol);
  }
};
