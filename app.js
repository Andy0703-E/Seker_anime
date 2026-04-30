let currentSource = localStorage.getItem('apiSource') || 'animasu';

const API_CONFIG = {
    animasu: {
        baseUrl: 'https://www.sankavollerei.com/anime/animasu',
        endpoints: {
            home: '/home',
            popular: '/popular',
            movies: '/movies',
            ongoing: '/ongoing',
            completed: '/completed',
            detail: '/detail',
            episode: '/episode',
            search: '/search'
        }
    },
    otakudesu: {
        baseUrl: 'https://www.sankavollerei.com/anime',
        endpoints: {
            home: '/home',
            ongoing: '/ongoing-anime',
            completed: '/complete-anime',
            detail: '/anime',
            episode: '/episode',
            search: '/search'
        }
    }
};

const app = document.getElementById('app');
const CACHE_PREFIX = 'anime_cache_';
const CACHE_DURATION = 15 * 60 * 1000;

let paginationState = {
    page: 1,
    isLoading: false,
    hasMore: true,
    currentType: ''
};

// Utilities
const showLoading = () => {
    const tmpl = document.getElementById('tmpl-loading').content.cloneNode(true);
    app.innerHTML = '';
    app.appendChild(tmpl);
};

const showError = (msg) => {
    app.innerHTML = `<div class="error-msg"><ion-icon name="alert-circle-outline"></ion-icon> ${msg}</div>`;
};

// Source Switcher
const sourceSelect = document.getElementById('sourceSelect');
if(sourceSelect) {
    sourceSelect.value = currentSource;
    sourceSelect.addEventListener('change', (e) => {
        currentSource = e.target.value;
        localStorage.setItem('apiSource', currentSource);
        updateNavVisibility();
        navigateTo('/');
    });
}

const updateNavVisibility = () => {
    const isOtakudesu = currentSource === 'otakudesu';
    document.querySelectorAll('.main-nav a').forEach(el => {
        const href = el.getAttribute('onclick');
        if (href.includes('/popular') || href.includes('/movies')) {
            el.style.display = isOtakudesu ? 'none' : 'block';
        }
    });
};

const updateActiveNav = (path) => {
    document.querySelectorAll('.main-nav a').forEach(el => {
        el.classList.remove('active');
        const href = el.getAttribute('onclick');
        if (path === '/' && href.includes("navigate('/')")) {
            el.classList.add('active');
        } else if (path !== '/' && href.includes(`navigate('${path}')`)) {
            el.classList.add('active');
        }
    });
};

// Router
const router = {
    navigate: (path) => {
        window.history.pushState({}, '', path);
        handleRoute();
    }
};
window.router = router;

window.addEventListener('popstate', handleRoute);

function handleRoute() {
    updateNavVisibility();
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const isLocal = window.location.protocol === 'file:';
    
    const hash = window.location.hash.slice(1) || '/';
    const activePath = isLocal ? hash.split('?')[0] : path;
    
    let bookId, epsUrl, keyword;
    if (isLocal && window.location.hash.includes('?')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        bookId = hashParams.get('id');
        epsUrl = hashParams.get('epsUrl'); 
        keyword = hashParams.get('q');
    } else {
        bookId = searchParams.get('id');
        epsUrl = searchParams.get('epsUrl');
        keyword = searchParams.get('q');
    }

    updateActiveNav(activePath);

    if (activePath === '/' || activePath === '/index.html') {
        renderHome();
    } else if (activePath === '/popular' && currentSource === 'animasu') {
        renderCategory(API_CONFIG.animasu.endpoints.popular, 'Anime Populer');
    } else if (activePath === '/movies' && currentSource === 'animasu') {
        renderCategory(API_CONFIG.animasu.endpoints.movies, 'Anime Movies');
    } else if (activePath === '/ongoing') {
        renderCategory(API_CONFIG[currentSource].endpoints.ongoing, 'Sedang Tayang');
    } else if (activePath === '/completed') {
        renderCategory(API_CONFIG[currentSource].endpoints.completed, 'Anime Tamat');
    } else if (activePath === '/search') {
        if(keyword) doSearch(keyword);
        else renderHome();
    } else if (activePath.startsWith('/detail')) {
        if(bookId) renderDetail(bookId);
        else renderHome();
    } else if (activePath.startsWith('/watch')) {
        if(bookId && epsUrl) renderWatch(bookId, epsUrl);
        else renderHome();
    } else {
        renderHome();
    }
}

function navigateTo(routePath, params = {}) {
    const isLocal = window.location.protocol === 'file:';
    const qs = new URLSearchParams(params).toString();
    
    if (isLocal) {
        window.location.hash = `${routePath}${qs ? '?' + qs : ''}`;
    } else {
        window.history.pushState({}, '', `${routePath}${qs ? '?' + qs : ''}`);
        handleRoute();
    }
}

// Persisted Caching Fetch
async function fetchApi(endpoint, forceRefresh = false) {
    const baseUrl = API_CONFIG[currentSource].baseUrl;
    const url = baseUrl + endpoint;
    const cacheKey = CACHE_PREFIX + currentSource + '_' + endpoint;

    try {
        if (!forceRefresh) {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.timestamp < CACHE_DURATION) return parsed.data;
                } catch(e) {}
            }
        }

        let attempt = 0;
        while (attempt < 3) {
            try {
                const response = await fetch(url);
                if (response.status === 429) {
                    attempt++;
                    await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
                    continue;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
                } catch(e) {
                    sessionStorage.clear();
                }
                return data;
            } catch (e) {
                attempt++;
                if (attempt >= 3) throw e;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (e) {
        throw new Error(`Gagal memuat data dari ${currentSource.toUpperCase()}.`);
    }
}

// Data Normalizers
const normalizeCard = (item) => {
    if (currentSource === 'animasu') {
        return {
            id: item.slug,
            title: item.title,
            poster: item.poster,
            meta1: item.episode || item.status_or_day || 'Unknown',
            type: item.type
        };
    } else {
        return {
            id: item.animeId,
            title: item.title,
            poster: item.poster,
            meta1: item.releaseDay || (item.score ? `⭐ ${item.score}` : 'Unknown'),
            type: item.episodes ? `Eps ${item.episodes}` : 'TV' // Otakudesu doesn't provide type in list, fallback to eps
        };
    }
};

const getBadgeClass = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('tv') || t.includes('eps')) return 'tv';
    if (t.includes('movie')) return 'movie';
    if (t.includes('ona') || t.includes('ova')) return 'ona';
    return '';
};

const renderCardHTML = (item) => `
    <div class="anime-card" onclick="navigateTo('/detail', { id: '${item.id}' })">
        <img class="anime-poster" src="${item.poster}" alt="${item.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/220x330?text=No+Image'">
        <div class="anime-info">
            <div class="anime-title">${item.title}</div>
            <div class="anime-meta">
                <span>${item.meta1}</span>
                ${item.type ? `<span class="badge ${getBadgeClass(item.type)}">${item.type}</span>` : ''}
            </div>
        </div>
    </div>
`;

// --- Render Home ---
async function renderHome() {
    showLoading();
    try {
        const res = await fetchApi(API_CONFIG[currentSource].endpoints.home);
        
        let ongoingRaw = [];
        let recentRaw = [];

        if (currentSource === 'animasu') {
            ongoingRaw = res.ongoing || [];
            recentRaw = res.recent || [];
        } else {
            ongoingRaw = res.data?.ongoing?.animeList || [];
            recentRaw = res.data?.completed?.animeList || [];
        }

        const ongoing = ongoingRaw.map(normalizeCard);
        const recent = recentRaw.map(normalizeCard);

        let html = '';
        if (ongoing.length > 0) {
            html += `
                <div class="section-title" style="margin-top: 20px;">Sedang Tayang (Ongoing)</div>
                <div class="anime-grid">
                    ${ongoing.map(item => renderCardHTML(item)).join('')}
                </div>
            `;
        }

        if (recent.length > 0) {
            html += `
                <div class="section-title" style="margin-top: 40px;">Update Terbaru</div>
                <div class="anime-grid">
                    ${recent.map(item => renderCardHTML(item)).join('')}
                </div>
            `;
        }

        app.innerHTML = html || showError('Tidak ada data yang tersedia.');
    } catch(e) {
        showError(`⚠️ ${e.message}`);
    }
}

// --- Render Category ---
async function renderCategory(endpoint, title) {
    if (paginationState.currentType !== endpoint) {
        paginationState = { page: 1, isLoading: false, hasMore: true, currentType: endpoint };
        showLoading();
    } else {
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (loadMoreContainer) {
            loadMoreContainer.innerHTML = `<div style="width: 100%; text-align: center;"><div class="loading-bar"><div class="loading-bar-fill"></div></div></div>`;
        }
    }

    try {
        const res = await fetchApi(`${endpoint}?page=${paginationState.page}`);
        
        let rawList = [];
        if (currentSource === 'animasu') {
            rawList = res.animes || [];
            paginationState.hasMore = res.pagination ? res.pagination.hasNext : rawList.length > 0;
        } else {
            rawList = res.data?.animeList || [];
            paginationState.hasMore = rawList.length > 0;
        }

        const list = rawList.map(normalizeCard);

        if (paginationState.page === 1) {
            let html = `
                <div class="section-title" style="margin-top: 20px;">${title}</div>
                <div class="anime-grid" id="category-grid">
                    ${list.map(item => renderCardHTML(item)).join('')}
                </div>
            `;
            if (list.length === 0) html = showError('Tidak ada anime yang ditemukan.');
            app.innerHTML = html;
        } else {
            const grid = document.getElementById('category-grid');
            if (grid) grid.innerHTML += list.map(item => renderCardHTML(item)).join('');
        }

        if (paginationState.hasMore && list.length > 0) {
            const existingBtn = document.getElementById('loadMoreContainer');
            if (existingBtn) existingBtn.remove();
            
            const loadMoreContainer = document.createElement('div');
            loadMoreContainer.id = 'loadMoreContainer';
            loadMoreContainer.style.cssText = 'display: flex; justify-content: center; margin: 40px 0;';
            loadMoreContainer.innerHTML = `<button id="loadMoreBtn" class="play-main-btn" style="padding: 12px 32px;">Muat Lebih Banyak</button>`;
            app.appendChild(loadMoreContainer);

            document.getElementById('loadMoreBtn').addEventListener('click', () => {
                paginationState.page++;
                renderCategory(endpoint, title);
            });
        }
    } catch(e) {
        if(paginationState.page === 1) showError(`⚠️ ${e.message}`);
    }
}

// --- Render Detail ---
async function renderDetail(id) {
    showLoading();
    try {
        const res = await fetchApi(`${API_CONFIG[currentSource].endpoints.detail}/${id}`);
        
        let detail = {};
        if (currentSource === 'animasu') {
            const d = res?.detail;
            if(!d) throw new Error();
            detail = {
                id: id,
                title: d.title,
                poster: d.poster,
                rating: d.rating,
                genres: d.genres?.map(g => g.name).join(', ') || 'Anime',
                status: d.status,
                type: d.type,
                synopsis: d.synopsis,
                episodes: d.episodes?.map(e => ({ name: e.name, id: e.slug })) || []
            };
        } else {
            const d = res?.data;
            if(!d) throw new Error();
            detail = {
                id: id,
                title: d.title,
                poster: d.poster,
                rating: d.score,
                genres: d.genreList?.map(g => g.title).join(', ') || d.type || 'Anime',
                status: d.status,
                type: d.type || 'TV',
                synopsis: d.synopsis?.paragraphs?.join('<br><br>'),
                episodes: d.episodeList?.map(e => ({ name: `Episode ${e.eps}`, id: e.episodeId })) || []
            };
        }

        window.currentAnimeDetail = detail;

        // Animasu eps are usually descending (ep 1 at bottom), Otakudesu also mostly descending
        // Let's just find "Episode 1" or fallback to last item
        const ep1 = detail.episodes.slice().reverse().find(e => e.name.includes('1')) || detail.episodes[detail.episodes.length - 1];

        const html = `
            <div class="detail-hero">
                <img class="detail-backdrop" src="${detail.poster}" alt="backdrop" onerror="this.src='https://via.placeholder.com/800x400?text=No+Image'">
                <div class="detail-content">
                    <img class="detail-poster" src="${detail.poster}" onerror="this.src='https://via.placeholder.com/260x390?text=No+Image'">
                    <div class="detail-info">
                        <h1 class="detail-title">${detail.title}</h1>
                        <div class="detail-meta-list">
                            <div class="meta-item"><ion-icon name="star"></ion-icon> ${detail.rating || 'N/A'}</div>
                            <div class="meta-item"><ion-icon name="folder"></ion-icon> ${detail.genres}</div>
                            <div class="meta-item"><ion-icon name="time"></ion-icon> ${detail.status || 'Ongoing'}</div>
                            <div class="meta-item"><ion-icon name="videocam"></ion-icon> ${detail.type || 'N/A'}</div>
                        </div>
                        <p class="detail-desc">${detail.synopsis || 'Tidak ada sinopsis tersedia.'}</p>
                        
                        ${ep1 ? `
                        <button class="play-main-btn" onclick="navigateTo('/watch', { id: '${id}', epsUrl: '${ep1.id}' })">
                            <ion-icon name="play"></ion-icon> Mulai Tonton
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="episodes-section">
                <div class="section-title">Daftar Episode</div>
                <div class="episodes-grid">
                    ${detail.episodes.map(ep => `
                        <button class="eps-btn" onclick="navigateTo('/watch', { id: '${id}', epsUrl: '${ep.id}' })">
                            ${ep.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        app.innerHTML = html;

    } catch (e) {
        showError(`⚠️ Detail anime tidak ditemukan atau terjadi kesalahan.`);
    }
}

// --- Render Watch ---
async function renderWatch(animeId, epsId) {
    showLoading();
    try {
        let detail = window.currentAnimeDetail;
        if (!detail || detail.id !== animeId) {
            // Need to mock fetch again because we need episode list
            await renderDetail(animeId);
            detail = window.currentAnimeDetail;
            // Clear app innerHTML and continue watch
        }

        const episodes = detail?.episodes || [];
        const currentEp = episodes.find(e => e.id === epsId) || { name: 'Terpilih' };

        // Fetch Episode Data
        const epRes = await fetchApi(`${API_CONFIG[currentSource].endpoints.episode}/${epsId}`);
        
        let streams = [];
        let epTitle = detail?.title;

        if (currentSource === 'animasu') {
            streams = epRes?.streams || [];
            epTitle = epRes?.title || epTitle;
        } else {
            const defaultUrl = epRes?.data?.defaultStreamingUrl;
            if (defaultUrl) streams = [{ name: 'Default', url: defaultUrl }];
        }
        
        if(streams.length === 0) throw new Error('Video stream belum tersedia untuk episode ini.');

        const defaultStream = streams[0].url;

        const html = `
            <div class="watch-container">
                <div>
                    <div class="player-wrapper iframe-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; background: #000;">
                        <iframe id="videoPlayer" src="${defaultStream}" allowfullscreen frameborder="0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
                    </div>
                    
                    ${streams.length > 1 ? `
                    <div style="margin-top: 16px; display: flex; gap: 10px; overflow-x: auto;">
                        ${streams.map((s, i) => `
                            <button class="eps-btn ${i === 0 ? 'active' : ''}" style="padding: 8px 16px; font-size: 13px;" onclick="document.getElementById('videoPlayer').src='${s.url}'; document.querySelectorAll('.server-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active');" class="server-btn">
                                Server ${s.name}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}

                    <h2 class="watch-title">${epTitle}</h2>
                    <div class="watch-ep-name" style="color: var(--color-primary); margin-top: 10px; font-weight: 500;">Sedang Menonton: ${currentEp.name}</div>
                    
                    <div class="player-controls-hint">
                        💡 Gunakan tombol fullscreen di pojok kanan bawah pemutar video untuk menonton dalam layar penuh. Jika video lambat, coba ganti server atau sumber API.
                    </div>
                </div>

                <div class="sidebar-eps">
                    <div style="font-weight: 600; margin-bottom: 12px;">Pilih Episode</div>
                    ${episodes.map(ep => `
                        <button class="eps-btn ${ep.id === epsId ? 'active' : ''}" 
                                onclick="navigateTo('/watch', { id: '${animeId}', epsUrl: '${ep.id}' })">
                            ${ep.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        app.innerHTML = html;

    } catch(e) {
        showError(`⚠️ ${e.message}`);
    }
}

// Search Logic
document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value;
    if(q) navigateTo('/search', { q });
});

document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const q = e.target.value;
        if(q) navigateTo('/search', { q });
    }
});

async function doSearch(query) {
    showLoading();
    try {
        const res = await fetchApi(`${API_CONFIG[currentSource].endpoints.search}/${encodeURIComponent(query)}`);
        
        let rawList = [];
        if (currentSource === 'animasu') {
            rawList = res.animes || [];
        } else {
            rawList = res.data?.animeList || [];
        }

        const animes = rawList.map(normalizeCard);

        if (animes.length === 0) {
            return showError('Tidak ditemukan hasil untuk pencarian tersebut.');
        }

        const html = `
            <div class="section-title">Hasil Pencarian: ${query}</div>
            <div class="anime-grid">
                ${animes.map(item => renderCardHTML(item)).join('')}
            </div>
        `;
        app.innerHTML = html;
        
    } catch(e) {
        showError(`⚠️ ${e.message}`);
    }
}

// Default init
window.addEventListener('DOMContentLoaded', () => {
    handleRoute();
});
