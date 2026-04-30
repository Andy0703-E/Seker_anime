const API_BASE = 'https://www.sankavollerei.com/anime';

const app = document.getElementById('app');

// Cache untuk API responses
const apiCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit

// Global state untuk pagination
let homeState = {
    latestPage: 1,
    isLoading: false,
    hasMoreLatest: true,
    hasMoreRecommended: true
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
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const isLocal = window.location.protocol === 'file:';
    
    // Hash routing for local file://
    const hash = window.location.hash.slice(1) || '/';
    const activePath = isLocal ? hash.split('?')[0] : path;
    
    // Extract query params logically
    let bookId, epsUrl;
    if (isLocal && window.location.hash.includes('?')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        bookId = hashParams.get('id');
        epsUrl = hashParams.get('epsUrl'); // URL of chapter
    } else {
        bookId = searchParams.get('id');
        epsUrl = searchParams.get('epsUrl');
    }

    if (activePath === '/' || activePath === '/index.html') {
        homeState = { latestPage: 1, isLoading: false };
        renderHome();
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

async function fetchConfig(endpoint, retries = 3) {
    try {
        // Check cache dulu
        const cacheKey = endpoint;
        const cached = apiCache[cacheKey];
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('Cache hit for:', endpoint);
            return cached.data;
        }

        console.log('Fetching:', API_BASE + endpoint);
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(`${API_BASE}${endpoint}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    },
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (response.status === 429) {
                    // Rate limited - tunggu sebelum retry
                    const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    console.log(`Rate limited (429). Attempt ${attempt}/${retries}. Waiting ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }

                if (!response.ok) {
                    let errorData;
                    try {
                        errorData = await response.json();
                    } catch(e) {}
                    const serverMsg = errorData?.message || errorData?.error || response.statusText;
                    throw new Error(`HTTP ${response.status}: ${serverMsg}`);
                }
                
                const data = await response.json();
                
                // Store in cache
                apiCache[cacheKey] = {
                    data: data,
                    timestamp: Date.now()
                };
                
                console.log('Response from ' + endpoint + ':', data);
                return data;
            } catch (e) {
                if (attempt === retries) throw e;
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                console.log(`Error on attempt ${attempt}/${retries}. Retrying in ${waitTime}ms...`, e.message);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    } catch (e) {
        console.error('Fetch error for ' + endpoint + ':', e);
        throw new Error(`Gagal memuat dari ${endpoint}: ${e.message}`);
    }
}

// --- Render Home ---
async function renderHome() {
    if (homeState.latestPage === 1) {
        showLoading();
    } else {
        // Tampilkan loading bar untuk load more
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (loadMoreContainer) {
            loadMoreContainer.innerHTML = `
                <div style="width: 100%; text-align: center;">
                    <div class="loading-bar">
                        <div class="loading-bar-fill"></div>
                    </div>
                </div>
            `;
        }
    }
    
    try {
        let latestAnimes = [];
        let recAnimes = [];
        
        if (homeState.latestPage === 1) {
            const homeRes = await fetchConfig(`/home`);
            latestAnimes = homeRes?.data?.ongoing?.animeList || [];
            recAnimes = homeRes?.data?.completed?.animeList || [];
        } else {
            // For load more, we fetch ongoing and completed endpoints directly
            const [ongoingRes, completeRes] = await Promise.all([
                fetchConfig(`/ongoing-anime?page=${homeState.latestPage}`),
                fetchConfig(`/complete-anime?page=${homeState.latestPage}`)
            ]);
            latestAnimes = ongoingRes?.data?.animeList || [];
            recAnimes = completeRes?.data?.animeList || [];
        }

        // Deteksi apakah ada halaman berikutnya
        homeState.hasMoreLatest = latestAnimes.length > 0;
        homeState.hasMoreRecommended = recAnimes.length > 0;
        
        const renderCard = (item, isCompleted = false) => `
            <div class="anime-card" onclick="navigateTo('/detail', { id: '${item.animeId}' })">
                <img class="anime-poster" src="${item.poster}" alt="${item.title}" loading="lazy">
                <div class="anime-info">
                    <div class="anime-title">${item.title}</div>
                    <div class="anime-meta">
                        <span>${isCompleted ? '⭐ ' + (item.score || 'N/A') : (item.releaseDay || 'Ongoing')}</span>
                        <span class="badge">Eps ${item.episodes || '?'}</span>
                    </div>
                </div>
            </div>
        `;

        // Jika halaman pertama, render template utuh
        if (homeState.latestPage === 1) {
            let html = '';

            if (latestAnimes.length > 0) {
                html += `
                    <div class="section-title" style="margin-top: 20px;">🔥 Anime Ongoing</div>
                    <div class="anime-grid" id="latest-grid">
                        ${latestAnimes.map(item => renderCard(item)).join('')}
                    </div>
                `;
            }

            if (recAnimes.length > 0) {
                html += `
                    <div class="section-title" style="margin-top: 40px;">⭐ Anime Tamat (Completed)</div>
                    <div class="anime-grid" id="recommended-grid">
                        ${recAnimes.map(item => renderCard(item, true)).join('')}
                    </div>
                `;
            }

            if(html === '') {
                showError('Tidak ada data yang dapat ditampilkan.');
                return;
            } else {
                app.innerHTML = html;
            }
        } else {
            // Append ke grid yang sudah ada
            const latestGrid = document.getElementById('latest-grid');
            const recommendedGrid = document.getElementById('recommended-grid');

            if (latestAnimes.length > 0 && latestGrid) {
                latestGrid.innerHTML += latestAnimes.map(item => renderCard(item)).join('');
            }
            if (recAnimes.length > 0 && recommendedGrid) {
                recommendedGrid.innerHTML += recAnimes.map(item => renderCard(item, true)).join('');
            }
        }

        // Tambahkan tombol Load More
        if (homeState.hasMoreLatest || homeState.hasMoreRecommended) {
            const existingBtn = document.getElementById('loadMoreContainer');
            if (existingBtn) existingBtn.remove();
            
            const loadMoreContainer = document.createElement('div');
            loadMoreContainer.id = 'loadMoreContainer';
            loadMoreContainer.style.cssText = 'display: flex; justify-content: center; margin: 40px 0;';
            loadMoreContainer.innerHTML = `<button id="loadMoreBtn" class="play-main-btn" style="padding: 12px 32px;">Muat Lebih Banyak Anime</button>`;
            app.appendChild(loadMoreContainer);

            document.getElementById('loadMoreBtn').addEventListener('click', () => {
                homeState.latestPage++;
                renderHome();
            });
        }

    } catch(e) {
        console.error('renderHome error:', e);
        showError(`⚠️ ${e.message}<br><br>💡 Coba refresh halaman atau cek koneksi internet.`);
    }
}

// --- Render Detail ---
async function renderDetail(bookId) {
    showLoading();
    try {
        const detailRes = await fetchConfig(`/anime/${bookId}`);
        const detail = detailRes?.data;

        if (!detail) {
            return showError('Detail anime tidak ditemukan.');
        }

        // Reverse episode list to show Episode 1 first, optional depending on API, 
        // Otakudesu usually returns latest episode first. We can just render as is, but we want the play button to point to Ep 1.
        const episodes = detail.episodeList || [];
        
        // Let's attach global context for UI reuse in watch
        window.currentAnime = detail;
        window.currentAnimeId = bookId;

        const synopsis = detail.synopsis?.paragraphs?.join('<br><br>') || 'Tidak ada sinopsis tersedia.';
        const genres = detail.genreList?.map(g => g.title).join(', ') || detail.type || 'Anime';

        // Biasanya episode 1 ada di akhir array kalau urutannya desc, jadi ambil yang terakhir.
        const ep1 = episodes[episodes.length - 1];

        const html = `
            <div class="detail-hero">
                <img class="detail-backdrop" src="${detail.poster}" alt="backdrop">
                <div class="detail-content">
                    <img class="detail-poster" src="${detail.poster}">
                    <div class="detail-info">
                        <h1 class="detail-title">${detail.title}</h1>
                        <div class="detail-meta-list">
                            <div class="meta-item"><ion-icon name="star"></ion-icon> ${detail.score || 'N/A'}</div>
                            <div class="meta-item"><ion-icon name="folder"></ion-icon> ${genres}</div>
                            <div class="meta-item"><ion-icon name="time"></ion-icon> ${detail.status || 'Ongoing'}</div>
                        </div>
                        <p class="detail-desc">${synopsis}</p>
                        
                        ${ep1 ? `
                        <button class="play-main-btn" onclick="navigateTo('/watch', { id: '${bookId}', epsUrl: '${ep1.episodeId}' })">
                            <ion-icon name="play"></ion-icon> Mulai Tonton Eps Pertama
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="episodes-section">
                <div class="section-title">Daftar Episode</div>
                <div class="episodes-grid">
                    ${episodes.map(ep => `
                        <button class="eps-btn" onclick="navigateTo('/watch', { id: '${bookId}', epsUrl: '${ep.episodeId}' })">
                            Eps ${ep.eps}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        app.innerHTML = html;

    } catch (e) {
        console.error('renderDetail error:', e);
        showError(`⚠️ ${e.message}<br><br>Coba muat ulang halaman.`);
    }
}

// --- Render Watch ---
async function renderWatch(bookId, epsUrl) {
    showLoading();
    try {
        let detail = window.currentAnime;
        if (!detail || window.currentAnimeId !== bookId) {
            const detailRes = await fetchConfig(`/anime/${bookId}`);
            detail = detailRes?.data;
            window.currentAnime = detail;
            window.currentAnimeId = bookId;
        }

        const episodes = detail?.episodeList || [];
        const currentEp = episodes.find(e => e.episodeId === epsUrl) || { eps: 'Terpilih' };

        // Fetch the video Embed URL
        const videoRes = await fetchConfig(`/episode/${epsUrl}`);
        const streamUrl = videoRes?.data?.defaultStreamingUrl;

        if(!streamUrl) throw new Error('Video stream belum tersedia untuk episode ini.');

        const html = `
            <div class="watch-container">
                <div>
                    <div class="player-wrapper iframe-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; background: #000;">
                        <iframe id="videoPlayer" src="${streamUrl}" allowfullscreen frameborder="0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
                    </div>
                    <h2 class="watch-title">${detail?.title || 'Menonton Anime'}</h2>
                    <div class="watch-ep-name">Menonton: Episode ${currentEp.eps}</div>
                    
                    <div class="player-controls-hint">
                        💡 Gunakan tombol fullscreen di pojok kanan bawah pemutar video untuk menonton dalam layar penuh.
                    </div>
                </div>

                <div class="sidebar-eps">
                    <div style="font-weight: 600; margin-bottom: 12px;">Pilih Episode</div>
                    ${episodes.map(ep => `
                        <button class="eps-btn ${ep.episodeId === epsUrl ? 'active' : ''}" 
                                onclick="navigateTo('/watch', { id: '${bookId}', epsUrl: '${ep.episodeId}' })">
                            Episode ${ep.eps}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        app.innerHTML = html;

    } catch(e) {
        console.error('renderWatch error:', e);
        showError(`⚠️ ${e.message}<br><br>Coba muat ulang episode.`);
    }
}

// Search Logic
document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value;
    if(q) doSearch(q);
});

document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const q = e.target.value;
        if(q) doSearch(q);
    }
});

async function doSearch(query) {
    showLoading();
    try {
        const searchRes = await fetchConfig(`/search/${encodeURIComponent(query)}`);
        const animes = searchRes?.data?.animeList || [];

        if (!animes || animes.length === 0) {
            return showError('Tidak ditemukan hasil untuk pencarian tersebut.');
        }

        const html = `
            <div class="section-title">Hasil Pencarian: ${query}</div>
            <div class="anime-grid">
                ${animes.map(item => `
                    <div class="anime-card" onclick="navigateTo('/detail', { id: '${item.animeId}' })">
                        <img class="anime-poster" src="${item.poster}" alt="${item.title}" loading="lazy">
                        <div class="anime-info">
                            <div class="anime-title">${item.title}</div>
                            <div class="anime-meta">
                                <span>⭐ ${item.score || 'N/A'}</span>
                                <span class="badge">${item.status || ''}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        app.innerHTML = html;
        
    } catch(e) {
        console.error('doSearch error:', e);
        showError(`⚠️ ${e.message}<br><br>Coba cari dengan kata kunci yang berbeda.`);
    }
}

// Default init
window.addEventListener('DOMContentLoaded', () => {
    handleRoute();
});
