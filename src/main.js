import './style.css'

// Configuration & Tasa de Cambio (Aprox)
const USD_TO_EUR = 0.93;

const state = {
  currentCards: [],
  currentGame: 'all',
  searchQuery: ''
};

// DOM Elements
const searchInput = document.getElementById('card-search');
const searchBtn = document.getElementById('search-btn');
const gameFilter = document.getElementById('game-filter');
const logoLink = document.getElementById('logo-link');
const resultsGrid = document.getElementById('results-grid');
const heroSection = document.getElementById('hero');

// Modal Elements
const cardModal = document.getElementById('card-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalOverlay = cardModal.querySelector('.modal-overlay');

// Initialize
function init() {
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  gameFilter.addEventListener('change', (e) => {
    state.currentGame = e.target.value;
    if (state.searchQuery) handleSearch();
  });
  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetUI();
  });

  closeModalBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function resetUI() {
  state.searchQuery = '';
  state.currentCards = [];
  searchInput.value = '';
  heroSection.classList.remove('hidden');
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <p>Empieza a buscar para ver resultados...</p>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper Conversión
function formatPriceToEur(value, sourceCurrency = 'USD') {
  if (!value || value === '0.00' || value === '0') return 'N/A';
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return 'N/A';
  const finalValue = sourceCurrency === 'USD' ? numValue * USD_TO_EUR : numValue;
  return `€${finalValue.toFixed(2)}`;
}

// Search Logic
async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  state.searchQuery = query;
  showLoading();
  try {
    const cards = await fetchAllGames(query, state.currentGame);
    state.currentCards = cards;
    renderResults(cards);
  } catch (error) {
    console.error('Search error:', error);
    renderError('Ocurrió un error al buscar las cartas.');
  } finally {
    hideLoading();
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

async function fetchMtg(query) {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return formatMtgCards(data.data || []);
  } catch { return []; }
}

async function fetchPokemon(query) {
  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"*${encodeURIComponent(query)}*"&pageSize=12`);
    if (!response.ok) return [];
    const data = await response.json();
    return formatPokemonCards(data.data || []);
  } catch { return []; }
}

async function fetchYugioh(query) {
  try {
    const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return formatYugiohCards(data.data || []);
  } catch { return []; }
}

// Formatters con "Más Info"
function formatMtgCards(cards) {
  return cards.map(card => ({
    id: card.id,
    game: 'Magic: The Gathering',
    name: card.name,
    set: card.set_name,
    image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
    text: card.oracle_text || '',
    stats: [
      { label: 'Rareza', value: card.rarity },
      { label: 'Tipo', value: card.type_line },
      { label: 'Costo', value: card.mana_cost || 'N/A' },
      { label: 'Artista', value: card.artist }
    ],
    prices: [
      { store: 'TCGPlayer', price: formatPriceToEur(card.prices.usd, 'USD'), url: card.purchase_uris?.tcgplayer },
      { store: 'Cardmarket', price: formatPriceToEur(card.prices.eur, 'EUR'), url: card.purchase_uris?.cardmarket }
    ]
  }));
}

function formatPokemonCards(cards) {
  return cards.map(card => ({
    id: card.id,
    game: 'Pokémon TCG',
    name: card.name,
    set: card.set.name,
    image: card.images.large,
    text: card.flavorText || card.abilities?.[0]?.text || card.attacks?.[0]?.text || '',
    stats: [
      { label: 'Rareza', value: card.rarity || 'N/A' },
      { label: 'Tipo', value: card.types?.join(', ') || 'N/A' },
      { label: 'HP', value: card.hp || 'N/A' },
      { label: 'Etapa', value: card.subtypes?.join(', ') || 'N/A' }
    ],
    prices: [
      { store: 'TCGPlayer', price: formatPriceToEur(card.tcgplayer?.prices?.holofoil?.market || card.tcgplayer?.prices?.normal?.market, 'USD'), url: card.tcgplayer?.url },
      { store: 'Cardmarket', price: formatPriceToEur(card.cardmarket?.prices?.averageSellPrice, 'EUR'), url: card.cardmarket?.url }
    ]
  }));
}

function formatYugiohCards(cards) {
  return cards.slice(0, 15).map(card => ({
    id: card.id,
    game: 'Yu-Gi-Oh!',
    name: card.name,
    set: card.card_sets?.[0]?.set_name || 'Varios',
    image: card.card_images?.[0]?.image_url,
    text: card.desc,
    stats: [
      { label: 'Tipo', value: card.type },
      { label: 'Atributo', value: card.attribute || 'N/A' },
      { label: 'Nivel/Rango', value: card.level || card.rank || 'N/A' },
      { label: 'ATK/DEF', value: card.atk !== undefined ? `${card.atk}/${card.def}` : 'N/A' }
    ],
    prices: [
      { store: 'TCGPlayer', price: formatPriceToEur(card.card_prices?.[0]?.tcgplayer_price, 'USD'), url: `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(card.name)}` },
      { store: 'Cardmarket', price: formatPriceToEur(card.card_prices?.[0]?.cardmarket_price, 'EUR'), url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(card.name)}` }
    ]
  }));
}

// Rendering
function renderResults(cards) {
  heroSection.classList.add('hidden');
  resultsGrid.innerHTML = '';
  if (cards.length === 0) {
    resultsGrid.innerHTML = `<div class="empty-state"><p>No se encontraron cartas.</p></div>`;
    return;
  }

  const disclaimer = document.createElement('div');
  disclaimer.className = 'price-disclaimer';
  disclaimer.innerHTML = '<p>* Precios convertidos a <strong>Euros (€)</strong>. Haz clic para el valor real.</p>';
  resultsGrid.appendChild(disclaimer);

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    cardEl.innerHTML = `
      <div class="card-image">
        <span class="game-tag game-${card.game.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[:!\s]+/)[0]}">${card.game}</span>
        <img src="${card.image}" alt="${card.name}" loading="lazy">
      </div>
      <div class="card-info">
        <h3>${card.name}</h3>
        <p class="set-name">${card.set}</p>
        <table class="price-table">
          ${card.prices.map(p => `
            <tr>
              <td class="store-name">${p.store}</td>
              <td class="price-cell">
                ${p.url && p.price !== 'N/A' ? `<a href="${p.url}" target="_blank" class="price-value">${p.price}</a>` : `<span class="price-value">${p.price}</span>`}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
    cardEl.addEventListener('click', (e) => { if (!e.target.closest('a')) openModal(card); });
    resultsGrid.appendChild(cardEl);
  });
}

function openModal(card) {
  document.getElementById('modal-card-img').src = card.image;
  document.getElementById('modal-card-title').textContent = card.name;
  document.getElementById('modal-card-set').textContent = card.set;
  document.getElementById('modal-card-text').innerHTML = card.text.replace(/\n/g, '<br>');

  const statsGrid = document.getElementById('modal-card-stats');
  statsGrid.innerHTML = card.stats.map(s => `
    <div class="detail-item">
      <span class="label">${s.label}</span>
      <span class="value">${s.value}</span>
    </div>
  `).join('');

  const pricesGrid = document.getElementById('modal-prices-list');
  pricesGrid.innerHTML = card.prices.map(p => {
    if (p.price === 'N/A') return '';
    return `<a href="${p.url || '#'}" target="_blank" class="purchase-link"><span class="store">${p.store}</span><span class="price">${p.price}</span></a>`;
  }).join('');

  cardModal.classList.remove('hidden');
  cardModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  cardModal.classList.add('hidden');
  cardModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showLoading() {
  searchBtn.innerHTML = '<svg class="spinner" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg>';
  searchBtn.disabled = true;
}

function hideLoading() {
  searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  searchBtn.disabled = false;
}

function renderError(message) { resultsGrid.innerHTML = `<div class="error-state"><p>${message}</p></div>`; }

init();
