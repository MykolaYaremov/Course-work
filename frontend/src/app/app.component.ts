import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MedicineService } from './medicine.service';
import { Medicine, Pharmacy } from './medicine.model';
import * as L from 'leaflet';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  // ==========================
  // ВИБІР МІСТА
  // ==========================
  showCityMenu: boolean = false;
  availableCities = [
    { name: 'Київ', lat: 50.4501, lng: 30.5234, zoom: 11 },
    { name: 'Львів', lat: 49.8397, lng: 24.0297, zoom: 11 },
    { name: 'Одеса', lat: 46.4825, lng: 30.7233, zoom: 11 },
    { name: 'Дніпро', lat: 48.4647, lng: 35.0462, zoom: 11 },
    { name: 'Харків', lat: 49.9935, lng: 36.2304, zoom: 11 },
    { name: 'Запоріжжя', lat: 47.8388, lng: 35.1396, zoom: 11 },
    { name: 'Вся Україна', lat: 48.3794, lng: 31.1656, zoom: 6 }
  ];
  currentCity: any = this.availableCities[6]; // За замовчуванням Київ

  // ==========================
  // ПОШУК ТА АВТОДОПОВНЕННЯ
  // ==========================
  searchQuery: string = '';
  selectedCategory: string = '';
  currentSort: string = 'relevance';
  minPrice: number = 0;
  maxPrice: number = 5000;
  selectedManufacturer: string = '';
  isPromoOnly: boolean = false;

  searchHistory: string[] = [];
  suggestions: any[] = [];
  showSearchDropdown: boolean = false;
  searchTimeout: any;

  // ==========================
  // СТАН ТА НАВІГАЦІЯ
  // ==========================
  private _currentView: string = 'home';

  get currentView(): string {
    return this._currentView;
  }

  set currentView(value: string) {
    this._currentView = value;
    sessionStorage.setItem('savedView', value);
  }

  results: Medicine[] = [];
  popularMedicines: Medicine[] = [];
  hasSearched: boolean = false;
  isLoading: boolean = false;
  isDetailLoading: boolean = false;
  errorMessage: string = '';

  // ==========================================
  // ЛОГІКА ДЛЯ КАСТОМНОЇ МОДАЛКИ
  // ==========================================
  customModal = {
    isVisible: false,
    title: '',
    message: '',
    type: 'success' // 'success' | 'error' | 'info'
  };

  showCustomModal(title: string, message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.customModal = {
      isVisible: true,
      title,
      message,
      type
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeCustomModal(): void {
    this.customModal.isVisible = false;
  }

  // ==========================================
  // ЛОГІКА ДЛЯ МОДАЛКИ ПІДТВЕРДЖЕННЯ (ЗАМІНА CONFIRM)
  // ==========================================
  confirmModal = {
    isVisible: false,
    title: '',
    message: '',
    onConfirm: () => {} // Тут зберігатимемо дію, яку треба виконати при згоді
  };

  openConfirmModal(title: string, message: string, onConfirm: () => void): void {
    this.confirmModal = {
      isVisible: true,
      title,
      message,
      onConfirm
    };
  }

  closeConfirmModal(): void {
    this.confirmModal.isVisible = false;
  }

  executeConfirm(): void {
    if (this.confirmModal.onConfirm) {
      this.confirmModal.onConfirm(); // Виконуємо збережену дію
    }
    this.closeConfirmModal();
  }

  // ==========================
  // КОШИК
  // ==========================
  cartCount: number = 0;
  cartItems: any[] = [];
  cart: any[] = [];
  showCartModal: boolean = false;

  // ==========================
  // ДЕТАЛІ ПРЕПАРАТУ
  // ==========================
  private _selectedMedicine: Medicine | null = null;

  get selectedMedicine(): Medicine | null {
    return this._selectedMedicine;
  }

  set selectedMedicine(value: Medicine | null) {
    this._selectedMedicine = value;
    if (value) {
      sessionStorage.setItem('savedMedicine', JSON.stringify(value));
    } else {
      sessionStorage.removeItem('savedMedicine');
    }
  }

  pharmacies: Pharmacy[] = [];
  analogs: Medicine[] = [];

  // ==========================
  // СПИСОК УСІХ АПТЕК
  // ==========================
  allPharmacies: Pharmacy[] = [];
  allPharmaciesList: any[] = [];

  // ===================================================
  // ПАНЕЛЬ ФАРМАЦЕВТА: ФІЛЬТРАЦІЯ
  // ===================================================
  pharmacistPharmacies: any[] = [];
  selectedPharmacyId: number | '' = '';

  // ==========================
  // ЗАМОВЛЕННЯ
  // ==========================
  showOrderModal: boolean = false;
  orderName: string = '';
  orderPhone: string = '';
  orderPharmacyId: number | null = null;
  orderSuccess: boolean = false;
  generatedOrderId: string = '';
  showErrorModal: boolean = false;
  missingItemsList: string[] = [];
  orderSearchQuery: string = '';

  checkoutForm: { customer_name: string; customer_phone: string; pharmacy_id: number | null } = {
    customer_name: '',
    customer_phone: '',
    pharmacy_id: null
  };

  // ==========================
  // КАТЕГОРІЇ
  // ==========================
  categories = [
    {icon: '💊', name: 'Знеболюючі'},
    {icon: '🤧', name: 'Застуда та кашель'},
    {icon: '❤️', name: 'Серце та судини'},
    {icon: '🍏', name: 'Травлення'},
    {icon: '🧘', name: 'Заспокійливі'},
    {icon: '🤧', name: 'Алергія'},
    {icon: '✨', name: 'Вітаміни'},
    {icon: '👶', name: 'Товари для дітей'}
  ];

  constructor(private medicineService: MedicineService) {
    // =========================================================
    // ГЛОБАЛЬНЕ ВІДНОВЛЕННЯ БУДЬ-ЯКОГО ЕКРАНА ПІСЛЯ ОНОВЛЕННЯ (F5)
    // =========================================================
    const savedView = sessionStorage.getItem('savedView');
    const savedMedString = sessionStorage.getItem('savedMedicine');

    if (savedView) {
      this._currentView = savedView;

      // 1. Якщо це сторінка детальної картки ліків
      if (savedView === 'medicine-detail' && savedMedString) {
        try {
          const med = JSON.parse(savedMedString);
          this._selectedMedicine = med;
          if (med && med.id) {
            this.medicineService.getAnalogs(med.id).subscribe(data => this.analogs = data);
            this.medicineService.getPharmacies(med.id).subscribe(data => this.pharmacies = data);
          }
        } catch (e) { this._currentView = 'home'; }
      }

      // 2. Якщо це Кабінет Фармацевта
      if (savedView === 'pharmacist') {
        this.openPharmacistPanel(); // Тепер таймер запуститься навіть після F5!
      }

      // 3. Якщо це Панель Адміністратора
      if (savedView === 'admin') {
        this.medicineService.getAllPharmacies('').subscribe(data => this.allPharmaciesList = data);
      }

      // 4. Якщо це Карта Аптек (Leaflet Map)
      if (savedView === 'pharmacies') {
        setTimeout(() => {
          this.initMap();
        }, 200);
      }
    }

    // =========================================================
    // ВІДНОВЛЕННЯ КОШИКА ТА ІСТОРІЇ
    // =========================================================
    try {
      const savedCart = JSON.parse(localStorage.getItem('cart') || '[]');
      this.cart = savedCart;
      this.cartItems = savedCart;
      this.cartCount = this.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    } catch {
      this.cart = []; this.cartItems = []; this.cartCount = 0;
    }

    try {
      const savedHistory = localStorage.getItem('searchHistory');
      if (savedHistory) this.searchHistory = JSON.parse(savedHistory);
    } catch {}
  }

  // ==========================
  // ІНІЦІАЛІЗАЦІЯ
  // ==========================
  ngOnInit(): void {
    this.loadPopularMedicines();
    this.loadPharmaciesForCity();
    this.medicineService.getAllPharmacies('').subscribe({
      next: (data) => this.allPharmaciesList = data
    });
  }

  // ==========================
  // ЗАВАНТАЖЕННЯ АПТЕК
  // ==========================
  loadPharmaciesForCity(callback?: () => void): void {
    const cityQuery = this.currentCity.name === 'Вся Україна' ? '' : this.currentCity.name;
    this.medicineService.getAllPharmacies(cityQuery).subscribe({
      next: (data) => {
        this.allPharmacies = data;
        if (callback) callback();
      },
      error: (err) => console.error('Помилка завантаження аптек:', err)
    });
  }

  selectCity(city: any): void {
    this.currentCity = city;
    this.showCityMenu = false;
    this.checkoutForm.pharmacy_id = null;
    this.loadPharmaciesForCity(() => {
      if (this.currentView === 'pharmacies') {
        setTimeout(() => this.initMap(), 100);
      }
    });
  }

  loadPopularMedicines(): void {
    this.medicineService.getPopularMedicines().subscribe({
      next: (data) => this.popularMedicines = data,
      error: (err) => console.error(err)
    });
  }

  onSearchFocus(): void {
    this.showSearchDropdown = true;
    if (this.searchQuery.trim().length > 0) this.fetchSuggestions();
  }

  onSearchBlur(): void {
    setTimeout(() => { this.showSearchDropdown = false; }, 200);
  }

  onSearchInput(): void {
    this.showSearchDropdown = true;
    clearTimeout(this.searchTimeout);

    if (this.searchQuery.trim().length === 0) {
      this.suggestions = [];
      this.hasSearched = false;
      this.results = [];
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.fetchSuggestions();
    }, 300);
  }

  fetchSuggestions(): void {
    this.medicineService.getAutocomplete(this.searchQuery.trim()).subscribe(data => {
      this.suggestions = data;
    });
  }

  selectSearch(term: string): void {
    this.searchQuery = term;
    this.showSearchDropdown = false;
    this.onSearch();
  }

  saveToHistory(term: string): void {
    const cleanTerm = term.trim();
    if (!cleanTerm) return;
    this.searchHistory = this.searchHistory.filter(h => h !== cleanTerm);
    this.searchHistory.unshift(cleanTerm);
    if (this.searchHistory.length > 5) this.searchHistory.pop();
    localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
  }

  clearHistory(): void {
    this.searchHistory = [];
    localStorage.removeItem('searchHistory');
  }

  onSearch() {
    const query = this.searchQuery.trim();
    this.isLoading = true;
    this.showSearchDropdown = false;

    if (query) this.saveToHistory(query);

    this.medicineService.searchMedicines(
      query, this.selectedCategory, this.currentSort, this.minPrice, this.maxPrice, this.selectedManufacturer, this.isPromoOnly
    ).subscribe({
      next: (data) => {
        this.results = data;
        this.hasSearched = true;
        this.isLoading = false;
        window.scrollTo({top: 0, behavior: 'smooth'});
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  searchByCategory(text: string): void {
    this.showCatalogMenu = false;
    const isMainCategory = this.categories.some(cat => cat.name === text);

    if (isMainCategory) {
      this.selectedCategory = text;
      this.searchQuery = '';
    } else {
      this.selectedCategory = '';
      this.searchQuery = text;
    }
    this.onSearch();
  }

  onInputChange(): void {
    if (this.searchQuery.trim() === '') {
      this.hasSearched = false;
      this.results = [];
    }
  }

  setSort(sortType: string): void {
    this.currentSort = sortType;
    this.onSearch();
  }

  // ==========================
  // ВІДКРИТИ КАРТКУ
  // ==========================
  viewMedicine(id: number): void {
    this.isDetailLoading = true;
    this.errorMessage = '';
    this.selectedMedicine = null;
    this.pharmacies = [];
    this.analogs = [];

    this.medicineService.getMedicineById(id).subscribe({
      next: (med) => {
        this.selectedMedicine = med;
        this.currentView = 'medicine-detail';
        this.isDetailLoading = false;
        window.scrollTo({top: 0, behavior: 'smooth'});

        this.medicineService.getAnalogs(id).subscribe({
          next: (data) => this.analogs = data,
          error: () => this.analogs = []
        });

        this.medicineService.getPharmacies(id).subscribe({
          next: (data) => this.pharmacies = data,
          error: () => this.pharmacies = []
        });
      },
      error: (err) => {
        this.isDetailLoading = false;
        this.errorMessage = `Не вдалося завантажити дані препарату.`;
      }
    });
  }

  closeMedicine(): void {
    this.selectedMedicine = null;
    this.currentView = 'home';
    this.pharmacies = [];
    this.analogs = [];
    this.errorMessage = '';
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  // ==========================
  // КОШИК ТА КІЛЬКІСТЬ
  // ==========================
  addToCart(item: any, event?: Event): void {
    if (event) event.stopPropagation();
    const existingItem = this.cart.find(i => i.id === item.id);
    if (existingItem) {
      existingItem.quantity = (existingItem.quantity || 1) + 1;
    } else {
      const newItem = { ...item, quantity: 1 };
      this.cart.push(newItem);
    }
    this.cartItems = [...this.cart];
    this.saveCart();
  }

  increaseQuantity(index: number): void {
    this.cart[index].quantity++;
    this.saveCart();
  }

  decreaseQuantity(index: number): void {
    if (this.cart[index].quantity > 1) {
      this.cart[index].quantity--;
    } else {
      this.removeFromCart(index);
      return;
    }
    this.saveCart();
  }

  removeFromCart(index: number): void {
    this.cart.splice(index, 1);
    this.cartItems = [...this.cart];
    this.saveCart();
  }

  private saveCart(): void {
    try { localStorage.setItem('cart', JSON.stringify(this.cart)); } catch (e) {}
    this.cartCount = this.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }

  get cartTotal(): number { return this.getCartTotal(); }
  getCartTotal(): number {
    return this.cart.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
  }

  openCart(): void {
    this.currentView = 'cart';
    this.showCartModal = true;
    this.orderSuccess = false;
    window.scrollTo({top: 0, behavior: 'smooth'});
    this.loadPharmaciesForCity();
  }

  closeCart(): void {
    this.showCartModal = false;
    if(this.currentView === 'cart') this.currentView = 'home';
  }

  // ==========================
  // ЗАМОВЛЕННЯ ТА МОДАЛКИ
  // ==========================
  openOrderModal(): void {
    this.showCartModal = false;
    this.showOrderModal = true;
    this.orderSuccess = false;
    this.orderName = '';
    this.orderPhone = '';
    this.orderPharmacyId = null;
  }

  closeOrderModal(): void { this.showOrderModal = false; }
  closeErrorModal(): void { this.showErrorModal = false; this.missingItemsList = []; }

  submitOrder(): void {
    if (!this.checkoutForm.customer_name.trim() || !this.checkoutForm.customer_phone.trim() || !this.checkoutForm.pharmacy_id) {
      this.showCustomModal('Увага!', 'Будь ласка, заповніть всі поля та оберіть аптеку', 'error');
      return;
    }

    const phoneRegex = /^(\+380|380|0)\d{9}$/;
    const cleanPhone = this.checkoutForm.customer_phone.trim().replace(/\s|-/g, '');

    if (!phoneRegex.test(cleanPhone)) {
      this.showCustomModal('Увага!', 'Будь ласка, введіть коректний український номер телефону (наприклад: 0971234567)', 'error');
      return;
    }

    // 1. ГЕНЕРУЄМО НОМЕР ДО ВІДПРАВКИ
    const generatedNum = Math.floor(100000 + Math.random() * 900000).toString();

    const orderData = {
      customer_name: this.checkoutForm.customer_name,
      customer_phone: cleanPhone,
      pharmacy_id: this.checkoutForm.pharmacy_id,
      items: this.cart,
      total_price: this.getCartTotal(),
      order_number: generatedNum // 2. ПЕРЕДАЄМО ЙОГО НА СЕРВЕР
    };

    this.medicineService.createOrder(orderData).subscribe({
      next: () => {
        this.orderSuccess = true;
        this.generatedOrderId = generatedNum; // Використовуємо згенерований номер для модалки успіху
        this.cart = [];
        this.cartItems = [];
        this.cartCount = 0;
        try { localStorage.removeItem('cart'); } catch {}
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err) => {
        if (err.status === 400 && err.error && err.error.missingItems) {
          this.missingItemsList = err.error.missingItems;
          this.showErrorModal = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          this.showCustomModal('Помилка', 'Помилка при оформленні замовлення. Спробуйте ще раз.', 'error');
        }
      }
    });
  }

  resetCartAndGoHome(): void {
    this.orderSuccess = false;
    this.checkoutForm = { customer_name: '', customer_phone: '', pharmacy_id: null };
    this.currentView = 'home';
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  private randomMedImages = [
    'https://images.unsplash.com/photo-1576671081837-49000212a370?q=80&w=1098&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://plus.unsplash.com/premium_photo-1668487826871-2f2cac23ad56?q=80&w=1112&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?q=80&w=1240&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://images.unsplash.com/photo-1555633514-abcee6ab92e1?q=80&w=880&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://images.unsplash.com/photo-1563213126-a4273aed2016?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://plus.unsplash.com/premium_photo-1676325101744-ce4a45a331c7?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://images.unsplash.com/photo-1577401132921-cb39bb0adcff?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    'https://images.unsplash.com/photo-1622227922682-56c92e523e58?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
  ];

  getMedicineImage(item: any): string {
    const isBadUrl = !item.image_url || item.image_url === 'NULL' || item.image_url.includes('placeholder.com') || item.image_url.includes('loremflickr');
    if (isBadUrl) {
      const index = Number(item.id || 0) % this.randomMedImages.length;
      return this.randomMedImages[index];
    }
    return item.image_url;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.img-placeholder')) {
      const span = document.createElement('span');
      span.className = 'img-placeholder';
      span.textContent = '💊';
      parent.appendChild(span);
    }
  }

  goHome(): void {
    this.currentView = 'home';
    this.selectedMedicine = null;
    this.resetSearch();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  openCatalog(): void {
    this.currentView = 'home';
    this.selectedMedicine = null;
    this.hasSearched = false;
    this.searchQuery = '';
    setTimeout(() => {
      const el = document.querySelector('.categories-section');
      el?.scrollIntoView({behavior: 'smooth'});
    }, 100);
  }

  openPharmacies() {
    this.currentView = 'pharmacies';
    window.scrollTo({top: 0, behavior: 'smooth'});
    this.loadPharmaciesForCity(() => {
      setTimeout(() => { this.initMap(); }, 100);
    });
  }

  initMap() {
    const mapContainer = L.DomUtil.get('map');
    if (mapContainer != null) {
      (mapContainer as any)._leaflet_id = null;
    }
    const map = L.map('map').setView([this.currentCity.lat, this.currentCity.lng], this.currentCity.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 200);

    const customIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    this.allPharmacies.forEach(pharm => {
      if (pharm.lat && pharm.lng) {
        const marker = L.marker([pharm.lat, pharm.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-size: 14px;">
            <b style="color: #27ae60;">${pharm.name}</b><br>
            📍 ${pharm.address}<br>
            📞 ${pharm.phone || 'Номер не вказано'}
          </div>
        `);
      }
    });
  }

  openSales(): void {
    this.currentView = 'home';
    this.searchQuery = '';
    this.selectedCategory = '';
    this.isPromoOnly = true;
    this.onSearch();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  resetSearch(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.isPromoOnly = false;
    this.hasSearched = false;
    this.results = [];
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  showCatalogMenu: boolean = false;
  activeMegaMenu: string = 'meds';

  toggleCatalog(): void {
    this.showCatalogMenu = !this.showCatalogMenu;
    if(this.showCatalogMenu) this.activeMegaMenu = 'meds';
  }

  setMegaMenu(category: string): void {
    this.activeMegaMenu = category;
  }

  // ===================================================
  // НОВИЙ БЛОК: КЕРУВАННЯ ПАНЕЛЯМИ АПТЕКАРЯ ТА АДМІНІСТРАТОРА
  // ===================================================
  pharmacistOrders: any[] = [];
  pharmacistRefreshInterval: any;

  newMedicine = {
    name: '',
    manufacturer: '',
    active_substance: '',
    price: null as number | null,
    category: 'Знеболюючі',
    description: '',
    image_url: '',
    is_promo: 0
  };

  newPharmacy = {
    name: '',
    address: '',
    phone: '',
    lat: 50.4501,
    lng: 30.5234
  };

  showAuthModal: boolean = false;
  authRole: 'admin' | 'pharmacist' | null = null;
  authPassword: string = '';
  authError: boolean = false;

  requestAccess(role: 'admin' | 'pharmacist'): void {
    this.authRole = role;
    this.authPassword = '';
    this.authError = false;
    this.showAuthModal = true;
  }

  verifyAccess(): void {
    const ADMIN_PASSWORD = 'admin';
    const PHARMACIST_PASSWORD = 'pharm';

    if (this.authRole === 'admin' && this.authPassword === ADMIN_PASSWORD) {
      this.currentView = 'admin';
      this.showAuthModal = false;
      this.scrollToTop();
    }
    else if (this.authRole === 'pharmacist' && this.authPassword === PHARMACIST_PASSWORD) {
      this.openPharmacistPanel();
      this.showAuthModal = false;
    }
    else {
      this.authError = true;
    }
  }

  closeAuthModal(): void {
    this.showAuthModal = false;
    this.authRole = null;
  }

  openPharmacistPanel(): void {
    this.currentView = 'pharmacist';
    this.loadPharmacistOrders(); // Перше завантаження

    // Вмикаємо "тихе" фонове оновлення кожні 10 секунд
    if (this.pharmacistRefreshInterval) {
      clearInterval(this.pharmacistRefreshInterval);
    }
    this.pharmacistRefreshInterval = setInterval(() => {
      if (this.currentView === 'pharmacist') {
        this.loadPharmacistOrders();
      } else {
        clearInterval(this.pharmacistRefreshInterval);
      }
    }, 10000);

    this.medicineService.getAllPharmacies('').subscribe(res => {
      this.pharmacistPharmacies = res;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ОНОВЛЕНИЙ ГЕТТЕР ДЛЯ ПАНЕЛІ ПРОВІЗОРА (Фільтр по аптеці + Пошук по номеру/телефону)
  get filteredPharmacistOrders() {
    return this.pharmacistOrders.filter(order => {
      // 1. Прибираємо виконані
      if (order.status === 'completed') return false;

      // 2. Фільтруємо за аптекою (якщо обрано)
      if (this.selectedPharmacyId !== '' && order.pharmacy_id !== Number(this.selectedPharmacyId)) {
        return false;
      }

      // 3. ПОШУК (за номером або телефоном)
      if (this.orderSearchQuery.trim()) {
        const query = this.orderSearchQuery.toLowerCase().trim();
        const orderNum = order.order_number ? order.order_number.toString() : '';
        const phone = order.customer_phone ? order.customer_phone.toString() : '';

        if (!orderNum.includes(query) && !phone.includes(query)) {
          return false; // Якщо не знайдено ні в номері, ні в телефоні
        }
      }

      return true; // Якщо пройшло всі фільтри
    });
  }

  deleteOrder(order: any): void {
    const confirmMsg = `Ви впевнені, що хочете скасувати замовлення <b>#${order.order_number || order.id}</b>?<br><br>Всі товари з цього замовлення автоматично повернуться на баланс вашої аптеки.`;

    this.openConfirmModal('🗑️ Скасування замовлення', confirmMsg, () => {
      // Цей код виконається ТІЛЬКИ якщо користувач натисне "Підтвердити"
      this.medicineService.deleteOrder(order.id).subscribe({
        next: () => {
          this.showCustomModal('🗑️ Замовлення скасовано', 'Замовлення успішно видалено, а товари повернуто на склад.', 'success');
          // Видаляємо замовлення з локального масиву
          this.pharmacistOrders = this.pharmacistOrders.filter(o => o.id !== order.id);
        },
        error: () => {
          this.showCustomModal('❌ Помилка', 'Не вдалося видалити замовлення. Спробуйте пізніше.', 'error');
        }
      });
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  markOrderCompleted(order: any): void {
    const confirmMsg = `Підтверджуєте, що замовлення <b>#${order.order_number || order.id}</b> було успішно зібрано та видано клієнту?`;

    this.openConfirmModal('✅ Підтвердження видачі', confirmMsg, () => {
      this.medicineService.updateOrderStatus(order.id, 'completed').subscribe({
        next: () => {
          order.status = 'completed';
          this.showCustomModal('Успіх!', 'Замовлення успішно видано та закрито.', 'success');
        },
        error: (err) => {
          this.showCustomModal('❌ Помилка', 'Помилка при оновленні статусу на сервері.', 'error');
        }
      });
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadPharmacistOrders(): void {
    this.medicineService.getAdminOrders().subscribe({
      next: (orders) => {
        this.pharmacistOrders = orders.map(order => {
          try {
            order.items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
          } catch (e) {
            order.items = [];
          }
          return order;
        });
      },
      error: (err) => console.error('Помилка завантаження замовлень для аптекаря:', err)
    });
  }

  markOrderReady(order: any): void {
    this.medicineService.updateOrderStatus(order.id, 'ready').subscribe({
      next: () => {
        order.status = 'ready';
      },
      error: (err) => alert('Не вдалося оновити статус замовлення.')
    });
  }

  addMedicine(): void {
    if (!this.newMedicine.name || !this.newMedicine.price) {
      this.showCustomModal('Увага!', 'Будь ласка, заповніть хоча б назву та ціну препарату!', 'error');
      return;
    }
    this.medicineService.addMedicine(this.newMedicine).subscribe({
      next: () => {
        this.showCustomModal('Успіх!', `Препарат "${this.newMedicine.name}" успішно додано до бази даних!`, 'success');
        this.newMedicine = {
          name: '', manufacturer: '', active_substance: '', price: null, category: 'Знеболюючі', description: '', image_url: '', is_promo: 0
        };
        this.loadPopularMedicines();
      },
      error: (err) => {
        this.showCustomModal('Помилка', 'Не вдалося додати препарат. Перевірте з\'єднання з сервером.', 'error');
      }
    });
  }

  restockForm = {
    medicine_id: null as number | null,
    medicine_name: '',
    pharmacy_id: '',
    stock: null as number | null
  };

  // ===================================================
  // ФОРМА ЗМІНИ ЦІНИ ТА ЗНИЖОК (АДМІН)
  // ===================================================
  discountForm = {
    medicine_id: null as number | null,
    medicine_name: '',
    new_price: null as number | null,
    old_price: null as number | null, // Додали стару ціну
    is_promo: false
  };

  discountSearchQuery: string = '';
  discountSuggestions: any[] = [];
  showDiscountSearchDropdown: boolean = false;
  discountSearchTimeout: any;

  onDiscountSearchInput(): void {
    this.showDiscountSearchDropdown = true;
    clearTimeout(this.discountSearchTimeout);

    if (this.discountSearchQuery.trim().length === 0) {
      this.discountSuggestions = [];
      return;
    }

    this.discountSearchTimeout = setTimeout(() => {
      this.medicineService.getAutocomplete(this.discountSearchQuery.trim()).subscribe(data => {
        this.discountSuggestions = data;
      });
    }, 300);
  }

  selectDiscountSearch(item: any): void {
    this.discountForm.medicine_id = item.id;
    this.discountForm.medicine_name = item.name;
    this.discountSearchQuery = item.name;
    this.showDiscountSearchDropdown = false;
  }

  hideDiscountSearch(): void {
    setTimeout(() => { this.showDiscountSearchDropdown = false; }, 200);
  }

  submitDiscount(): void {
    if (!this.discountForm.medicine_id || !this.discountForm.new_price) {
      this.showCustomModal('Увага!', 'Будь ласка, оберіть препарат зі списку та вкажіть актуальну ціну!', 'error');
      return;
    }

    const payload = {
      id: this.discountForm.medicine_id,
      price: this.discountForm.new_price,
      old_price: this.discountForm.old_price, // Передаємо стару ціну на сервер
    };

    this.medicineService.updateMedicinePrice(payload).subscribe({
      next: () => {
        this.showCustomModal('Успіх!', `Ціну для препарату "${this.discountForm.medicine_name}" успішно оновлено!`, 'success');
        this.discountForm = { medicine_id: null, medicine_name: '', new_price: null, old_price: null, is_promo: false };
        this.discountSearchQuery = '';
        this.loadPopularMedicines();
      },
      error: (err) => {
        this.showCustomModal('Помилка', 'Не вдалося оновити ціну. Перевірте з\'єднання з сервером.', 'error');
      }
    });
  }

  adminSearchQuery: string = '';
  adminSuggestions: any[] = [];
  showAdminSearchDropdown: boolean = false;
  adminSearchTimeout: any;

  onAdminSearchInput(): void {
    this.showAdminSearchDropdown = true;
    clearTimeout(this.adminSearchTimeout);
    if (this.adminSearchQuery.trim().length === 0) {
      this.adminSuggestions = [];
      return;
    }
    this.adminSearchTimeout = setTimeout(() => {
      this.medicineService.getAutocomplete(this.adminSearchQuery.trim()).subscribe(data => {
        this.adminSuggestions = data;
      });
    }, 300);
  }

  selectAdminSearch(item: any): void {
    this.restockForm.medicine_id = item.id;
    this.restockForm.medicine_name = item.name;
    this.adminSearchQuery = item.name;
    this.showAdminSearchDropdown = false;
  }

  hideAdminSearch(): void {
    setTimeout(() => { this.showAdminSearchDropdown = false; }, 200);
  }

  submitRestock(): void {
    if (!this.restockForm.medicine_id || !this.restockForm.pharmacy_id || !this.restockForm.stock) {
      this.showCustomModal('Увага!', 'Будь ласка, оберіть препарат зі списку, вкажіть аптеку та кількість!', 'error');
      return;
    }

    this.medicineService.restockMedicine(this.restockForm).subscribe({
      next: () => {
        this.showCustomModal('Успіх!', `Залишки препарату "${this.restockForm.medicine_name}" успішно поповнено на ${this.restockForm.stock} шт!`, 'success');
        this.restockForm = { medicine_id: null, medicine_name: '', pharmacy_id: '', stock: null };
        this.adminSearchQuery = '';
      },
      error: (err) => {
        this.showCustomModal('Помилка', 'Не вдалося поповнити залишки. Перевірте з\'єднання.', 'error');
      }
    });
  }

  addPharmacy(): void {
    if (!this.newPharmacy.name || !this.newPharmacy.address) {
      this.showCustomModal('Увага!', 'Будь ласка, вкажіть назву та точну адресу аптеки!', 'error');
      return;
    }
    this.medicineService.addPharmacy(this.newPharmacy).subscribe({
      next: () => {
        this.showCustomModal('Успіх!', `Аптеку "${this.newPharmacy.name}" успішно зареєстровано!`, 'success');
        this.newPharmacy = { name: '', address: '', phone: '', lat: 50.4501, lng: 30.5234 };
        this.medicineService.getAllPharmacies('').subscribe(data => this.allPharmaciesList = data);
        this.loadPharmaciesForCity();
      },
      error: (err) => {
        this.showCustomModal('Помилка', 'Помилка при реєстрації аптеки.', 'error');
      }
    });
  }

  // ===================================================
  // ІНФОРМАЦІЙНІ МОДАЛКИ (ДОСТАВКА ТА ПОВЕРНЕННЯ)
  // ===================================================
  openDeliveryInfo(): void {
    const title = '🚚 Доставка та оплата';
    const message = `
      <b>Умови доставки:</b><br>
      • <b>Самовивіз з аптеки:</b> Безкоштовно з будь-якої нашої аптеки. Ваше замовлення буде зібрано протягом 15-30 хвилин. Бронювання діє 48 годин.<br>

      <i>⚠️ Зверніть увагу: Рецептурні препарати відпускаються виключно за наявності рецепта і доступні тільки для самовивозу!</i><br><br>
      <b>Способи оплати:</b><br>
      • Готівкою або карткою будь-якого банку (Visa / MasterCard), Apple Pay або Google Pay при отриманні в аптеці.<br>
          `;
    this.showCustomModal(title, message, 'info');
  }

  openReturnTerms(): void {
    const title = '🔄 Умови повернення';
    const message = `
      Відповідно до чинного законодавства України (Постанова Кабінету Міністрів України №172), <b>лікарські засоби, медичні препарати та предмети гігієни належної якості поверненню та обміну не підлягають</b>.<br><br>
      <b>Коли повернення або обмін все ж можливі?</b><br>
      • Якщо товар виявився <b>неналежної якості</b> (виробничий брак, пошкоджено цілісність флакона чи блістера, або якщо вам випадково видали протермінований товар).<br>
      • Якщо виданий товар <b>не відповідає вашому замовленню</b> (помилка комплектації фармацевта).<br><br>
      <b>Що робити при виявленні браку чи помилки:</b><br>
      Будь ласка, завжди перевіряйте вміст замовлення безпосередньо при отриманні в аптеці. У разі невідповідності ви маєте право одразу відмовитися від позиції. Для вирішення спірних питань зв'яжіться з підтримкою: <br> <b> 0 800 111 22 33</br>
    `;
    this.showCustomModal(title, message, 'info');
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
