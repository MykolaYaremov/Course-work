export interface Medicine {
  id: number;
  name: string;
  active_substance: string | null;
  description: string; // Нове поле
  price: number;
  manufacturer: string;
  category: string;
  image_url: string;
  in_stock: number;
  is_promo: number;
  old_price: number | null;
}

export interface Pharmacy {
  id: number;
  name: string;
  address: string;
  phone: string;
  stock?: number; // Зробив необов'язковим, бо при загальному списку аптек ми не знаємо залишки конкретного ліку
  lat?: number;   // Додано широту для карти
  lng?: number;   // Додано довготу для карти
}

export interface Order {
  customer_name: string;
  customer_phone: string;
  items: Medicine[];
  total_price: number;
}
