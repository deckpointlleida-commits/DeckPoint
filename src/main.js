import './style.css'
import { translations } from './translations.js'

const USD_TO_EUR = 0.93;

const state = {
  currentCards: [],
  currentGame: 'all',
  searchQuery: '',
  lang: localStorage.getItem('deckpoint_lang') || 
         (navigator.language.startsWith('ca') ? 'ca' : 
          navigator.language.startsWith('es') ? 'es' : 'en')
};

// DOM Elements
const searchInput = document.getElementById('card-search');
const searchBtn = document.getElementById('search-btn');
const gameFilter = document.getElementById('game-filter');
const priceSort = document.getElementById('price-sort');
const logoLink = document.getElementById('logo-link');
const resultsGrid = document.getElementById('results-grid');
const heroSection = document.getElementById('hero');
const langButtons = document.querySelectorAll('.lang-btn');
const cardModal = document.getElementById('card-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalOverlay = cardModal?.querySelector('.modal-overlay');

function init() {
  setLanguage(state.lang);

  // Deep-linking: Handle search from URL params (?q= or ?s=)
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q') || urlParams.get('s');
  if (query) {
    if (searchInput) searchInput.value = query;
    handleSearch(query);
  }

  searchBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    handleSearch();
  });

  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  });

  gameFilter?.addEventListener('change', (e) => {
    state.currentGame = e.target.value;
    if (state.searchQuery) handleSearch();
  });

  priceSort?.addEventListener('change', (e) => {
    handleSort(e.target.value);
  });

  logoLink?.addEventListener('click', (e) => {
    e.preventDefault();
    resetUI();
  });

  langButtons.forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  closeModalBtn?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  initTiltEffect();
}

async function handleSearch(manualQuery = null) {
  if (searchLock) return;
  const query = manualQuery || searchInput?.value.trim();
  if (!query) return;
  
  state.searchQuery = query;
  searchLock = true;
  showSkeleton();

  // Update URL without reloading (clean deep-linking)
  const newUrl = new URL(window.location);
  newUrl.searchParams.set('q', query);
  window.history.pushState({}, '', newUrl);

  // Track event in GA4
  if (typeof gtag === 'function') {
    gtag('event', 'search', {
      search_term: query,
      game: state.currentGame
    });
  }
  
  try {
    const cards = await fetchAllGames(query, state.currentGame);
    state.currentCards = cards;
    renderResults(cards);
  } catch (error) {
    console.error('Search error:', error);
    renderError('Error en la búsqueda.');
  } finally {
    hideLoading();
    // Prevent accidental clicks for 400ms after results appear
    setTimeout(() => { searchLock = false; }, 400);
  }
}

function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem('deckpoint_lang', lang);
  document.documentElement.lang = lang;
  langButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  updateContent();
  if (state.currentCards.length > 0) renderResults(state.currentCards);
  else if (state.searchQuery === '') resetUI();
}

function updateContent() {
  const dict = translations[state.lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      if (el.tagName === 'TITLE') {
        document.title = dict[key];
      } else if (el.tagName === 'META') {
        el.setAttribute('content', dict[key]);
      } else {
        el.innerHTML = dict[key];
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) el.placeholder = dict[key];
  });
}

function t(key, params = {}) {
  let text = translations[state.lang][key] || key;
  Object.keys(params).forEach(p => text = text.replace(`{${p}}`, params[p]));
  return text;
}

function resetUI() {
  state.searchQuery = '';
  state.currentCards = [];
  if (searchInput) searchInput.value = '';
  heroSection?.classList.remove('hidden');
  priceSort?.classList.add('hidden');
  if (resultsGrid) {
    resultsGrid.innerHTML = `<div class="empty-state"><p>${t('emptyState')}</p></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function parsePrice(value, sourceCurrency = 'USD') {
  if (!value || value === '0.00' || value === '0') return null;
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return null;
  return sourceCurrency === 'USD' ? numValue * USD_TO_EUR : numValue;
}

function formatPrice(eurValue) {
  if (eurValue === null) return 'N/A';
  return `€${eurValue.toFixed(2)}`;
}

let searchLock = false;

async function handleSearch() {
  if (searchLock) return;
  const query = searchInput?.value.trim();
  if (!query) return;
  
  state.searchQuery = query;
  searchLock = true;
  showSkeleton();
  
  try {
    const cards = await fetchAllGames(query, state.currentGame);
    state.currentCards = cards;
    renderResults(cards);
  } catch (error) {
    console.error('Search error:', error);
    renderError('Error en la búsqueda.');
  } finally {
    hideLoading();
    // Prevent accidental clicks for 400ms after results appear
    setTimeout(() => { searchLock = false; }, 400);
  }
}

async function fetchAllGames(query, game) {
  const tasks = [];
  if (game === 'mtg' || game === 'all') tasks.push(fetchMtg(query));
  if (game === 'pokemon' || game === 'all') tasks.push(fetchPokemon(query));
  if (game === 'yugioh' || game === 'all') tasks.push(fetchYugioh(query));
  const results = await Promise.all(tasks);
  return results.flat().slice(0, 30);
}

// MTG
async function fetchMtg(query) {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data.map(card => {
      const pEur = parsePrice(card.prices.usd, 'USD') || parsePrice(card.prices.eur, 'EUR');
      return {
        id: card.id,
        game: t('mtg'),
        name: card.name,
        set: card.set_name,
        image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
        text: card.oracle_text || '',
        stats: [{ label: t('rarity'), value: card.rarity }, { label: t('type'), value: card.type_line }],
        sortPrice: pEur,
        prices: [
          { store: 'TCGPlayer', price: formatPrice(parsePrice(card.prices.usd, 'USD')), url: card.purchase_uris?.tcgplayer },
          { store: 'Cardmarket', price: formatPrice(parsePrice(card.prices.eur, 'EUR')), url: card.purchase_uris?.cardmarket }
        ]
      };
    });
  } catch { return []; }
}

// Pokemon
async function fetchPokemon(query) {
  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"*${encodeURIComponent(query)}*"&pageSize=12`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data.map(card => {
      const pUsd = card.tcgplayer?.prices?.holofoil?.market || card.tcgplayer?.prices?.normal?.market;
      const pEur = parsePrice(pUsd, 'USD');
      return {
        id: card.id,
        game: t('pokemon'),
        name: card.name,
        set: card.set.name,
        image: card.images.large,
        text: card.flavorText || '',
        stats: [{ label: t('rarity'), value: card.rarity || 'N/A' }, { label: t('hp'), value: card.hp || 'N/A' }],
        sortPrice: pEur,
        prices: [
          { store: 'TCGPlayer', price: formatPrice(pEur), url: card.tcgplayer?.url },
          { store: 'Cardmarket', price: formatPrice(parsePrice(card.cardmarket?.prices?.averageSellPrice, 'EUR')), url: card.cardmarket?.url }
        ]
      };
    });
  } catch { return []; }
}

// Yugioh
async function fetchYugioh(query) {
  try {
    const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data.slice(0, 15).map(card => {
      const prices = card.card_prices?.[0];
      const pEur = parsePrice(prices?.tcgplayer_price, 'USD');
      return {
        id: card.id,
        game: t('yugioh'),
        name: card.name,
        set: card.card_sets?.[0]?.set_name || 'Varios',
        image: card.card_images?.[0]?.image_url,
        text: card.desc,
        stats: [{ label: t('type'), value: card.type }, { label: t('atkDef'), value: `${card.atk}/${card.def}` }],
        sortPrice: pEur,
        prices: [
          { store: 'TCGPlayer', price: formatPrice(pEur), url: `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(card.name)}` },
          { store: 'Cardmarket', price: formatPrice(parsePrice(prices?.cardmarket_price, 'EUR')), url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(card.name)}` }
        ]
      };
    });
  } catch { return []; }
}

function handleSort(criteria) {
  if (criteria === 'default') return;
  state.currentCards.sort((a, b) => {
    if (criteria === 'az') return a.name.localeCompare(b.name);
    if (criteria === 'za') return b.name.localeCompare(a.name);
    const pA = a.sortPrice || 999999;
    const pB = b.sortPrice || 999999;
    return criteria === 'asc' ? pA - pB : pB - pA;
  });
  renderResults(state.currentCards);
}

function renderResults(cards) {
  if (!resultsGrid) return;
  heroSection?.classList.add('hidden');
  priceSort?.classList.remove('hidden');
  resultsGrid.innerHTML = '';

  if (cards.length === 0) {
    resultsGrid.innerHTML = `<div class="empty-state"><p>${t('noResults', { query: state.searchQuery })}</p></div>`;
    priceSort?.classList.add('hidden');
    return;
  }

  const disclaimer = document.createElement('div');
  disclaimer.className = 'price-disclaimer';
  disclaimer.innerHTML = `<p>${t('disclaimer')}</p>`;
  resultsGrid.appendChild(disclaimer);

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    const gClass = card.game === t('pokemon') ? 'pokemon' : card.game === t('yugioh') ? 'yu-gi-oh' : 'magic';
    
    cardEl.innerHTML = `
      <div class="card-image"><span class="game-tag game-${gClass}">${card.game}</span><img src="${card.image}" loading="lazy" decoding="async" alt="${card.name}"></div>
      <div class="card-info"><h3>${card.name}</h3><p class="set-name">${card.set}</p>
      <table class="price-table">${card.prices.map(p => `<tr><td>${p.store}</td><td class="price-cell">${p.url && p.price !== 'N/A' ? `<a href="${p.url}" target="_blank" class="price-value" onclick="event.stopPropagation()" title="${t('buyLabel', { store: p.store })}">${p.price}</a>` : `<span>${p.price}</span>`}</td></tr>`).join('')}</table></div>
    `;

    cardEl.addEventListener('click', (e) => {
      if (searchLock) return;
      e.stopPropagation();
      openModal(card);
    });
    resultsGrid.appendChild(cardEl);
  });
}

function showSkeleton() {
  if (!resultsGrid) return;
  heroSection?.classList.add('hidden');
  priceSort?.classList.add('hidden');
  resultsGrid.innerHTML = Array(8).fill(0).map(() => `<div class="skeleton skeleton-card"></div>`).join('');
  if (searchBtn) searchBtn.disabled = true;
}

function hideLoading() {
  if (searchBtn) {
    searchBtn.disabled = false;
    searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  }
}

function openModal(card) {
  if (!cardModal) return;

  // Track card view in GA4
  if (typeof gtag === 'function') {
    gtag('event', 'view_item', {
      item_name: card.name,
      item_category: card.game,
      item_variant: card.set
    });
  }
  
  const img = document.getElementById('modal-card-img');
  if (img) img.src = card.image;
  
  const title = document.getElementById('modal-card-title');
  if (title) title.textContent = card.name;
  
  const set = document.getElementById('modal-card-set');
  if (set) set.textContent = card.set;
  
  const text = document.getElementById('modal-card-text');
  if (text) text.innerHTML = card.text.replace(/\n/g, '<br>');

  const stats = document.getElementById('modal-card-stats');
  if (stats) stats.innerHTML = card.stats.map(s => `<div class="detail-item"><span class="label">${s.label}</span><span class="value">${s.value}</span></div>`).join('');

  const prices = document.getElementById('modal-prices-list');
  if (prices) {
    prices.innerHTML = card.prices.map(p => p.price === 'N/A' ? '' : `<a href="${p.url || '#'}" target="_blank" class="purchase-link"><span>${p.store}</span><span class="price">${p.price}</span></a>`).join('') + `<p class="modal-disclaimer">${t('modalDisclaimer')}</p>`;
  }

  // Update title for social sharing context (though SPA, good for UX/Modern Bots)
  const baseTitle = translations[state.lang].title;
  document.title = `${card.name} | ${baseTitle}`;
  if (img) img.alt = card.name;

  // Top Tier: Dynamic Product Schema for Google Rich Results
  const schemaId = 'dynamic-product-schema';
  let schemaScript = document.getElementById(schemaId);
  if (!schemaScript) {
    schemaScript = document.createElement('script');
    schemaScript.id = schemaId;
    schemaScript.type = 'application/ld+json';
    document.head.appendChild(schemaScript);
  }

  const minPrice = Math.min(...card.prices.map(p => parseFloat(p.price.replace('€', ''))).filter(p => !isNaN(p)));
  const maxPrice = Math.max(...card.prices.map(p => parseFloat(p.price.replace('€', ''))).filter(p => !isNaN(p)));

  schemaScript.textContent = JSON.stringify({
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": card.name,
    "image": card.image,
    "description": card.text || `Carta TCG ${card.name} del set ${card.set}`,
    "brand": { "@type": "Brand", "name": card.game },
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "EUR",
      "lowPrice": isFinite(minPrice) ? minPrice : 0,
      "highPrice": isFinite(maxPrice) ? maxPrice : 0,
      "offerCount": card.prices.filter(p => p.price !== 'N/A').length
    }
  });

  cardModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  cardModal?.classList.add('hidden');
  document.body.style.overflow = '';
  // Restore original title
  document.title = translations[state.lang].title;

  // Remove dynamic schema
  const schemaScript = document.getElementById('dynamic-product-schema');
  if (schemaScript) schemaScript.remove();
}

function initTiltEffect() {
  const container = document.querySelector('.card-tilt-container');
  const inner = document.querySelector('.card-tilt-inner');
  const shine = document.querySelector('.foil-shine');

  container?.addEventListener('mousemove', (e) => {
    const { left, top, width, height } = container.getBoundingClientRect();
    const x = (e.clientX - left) / width;
    const y = (e.clientY - top) / height;
    const rx = (y - 0.5) * 20;
    const ry = (x - 0.5) * -20;
    if (inner) inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    if (shine) shine.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 80%)`;
  });

  container?.addEventListener('mouseleave', () => {
    if (inner) inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
    if (shine) shine.style.background = 'none';
  });
}

function renderError(message) {
  if (resultsGrid) resultsGrid.innerHTML = `<div class="error-state"><p>${message}</p></div>`;
}

init();

// Top Tier: Service Worker Registration for PWA Offline Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered', reg))
      .catch(err => console.log('SW Error', err));
  });
}
