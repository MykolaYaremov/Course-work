import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Medicine } from './medicine.model';

@Injectable({
  providedIn: 'root'
})
export class MedicineService {

  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  searchMedicines(
    query: string,
    category: string = '',
    sort: string = 'relevance',
    minPrice: number = 0,
    maxPrice: number = 5000,
    manufacturer: string = '',
    promo: boolean = false,
    city: string = '' // НОВИЙ ПАРАМЕТР ДЛЯ МІСТА
  ): Observable<Medicine[]> {
    // Додано &city=${city} в кінці запиту
    return this.http.get<Medicine[]>(
      `${this.apiUrl}/search?q=${query}&cat=${category}&sort=${sort}&minPrice=${minPrice}&maxPrice=${maxPrice}&manufacturer=${manufacturer}&promo=${promo}&city=${city}`
    );
  }

  getAnalogs(id: number): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/medicines/${id}/analogs`
    );
  }

  getPharmacies(id: number): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/medicines/${id}/pharmacies`
    );
  }

  createOrder(orderData: any): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/orders`,
      orderData
    );
  }

  getMedicineById(id: number): Observable<Medicine> {
    return this.http.get<Medicine>(`${this.apiUrl}/medicines/${id}`);
  }

  // Отримання повного списку всіх аптек мережі (тепер з фільтрацією по місту!)
  getAllPharmacies(city: string = ''): Observable<any[]> {
    const url = city ? `${this.apiUrl}/pharmacies?city=${city}` : `${this.apiUrl}/pharmacies`;
    return this.http.get<any[]>(url);
  }

  getPopularMedicines(): Observable<Medicine[]> {
    return this.http.get<Medicine[]>(`${this.apiUrl}/medicines/popular`);
  }

  // Отримати підказки для пошуку
  getAutocomplete(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/autocomplete?q=${query}`);
  }

  // Отримати всі замовлення для адміна/аптекаря
  getAdminOrders(): Observable<any[]> {
    return this.http.get<any[]>('http://localhost:3000/api/admin/orders');
  }

  // Оновити статус замовлення
  updateOrderStatus(orderId: number, status: string): Observable<any> {
    return this.http.put(`http://localhost:3000/api/orders/${orderId}/status`, { status });
  }

  // Додати препарат
  addMedicine(medicine: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/medicines', medicine);
  }

  // Додати аптеку
  addPharmacy(pharmacy: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/pharmacies', pharmacy);
  }

  // Поповнення залишків існуючого препарату
  restockMedicine(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/inventory/restock`, data);
  }

  // Оновлення ціни та статусу акції
  updateMedicinePrice(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/medicines/update-price`, data);
  }

  // Видалити замовлення
  deleteOrder(orderId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/orders/${orderId}`);
  }

}
