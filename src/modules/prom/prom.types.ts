export interface PromGroup {
  id: number;
  name: string;
  description?: string;
  image?: string;
  parent_group_id?: number | null;
}

export interface PromProductPriceStockUpdate {
  id?: number | string;
  external_id?: string; // our tcod
  price?: number;
  presence?: 'available' | 'not_available' | 'order' | 'service';
  quantity_in_stock?: number;
}

export interface PromProductEditItem {
  id?: number;
  external_id?: string; // our tcod
  name?: string;
  price?: number;
  presence?: 'available' | 'not_available' | 'order';
  quantity_in_stock?: number;
  category_id?: number;
  description?: string;
  images?: string[];
  sku?: string;
}

export interface PromProductItem {
  id: number;
  external_id?: string;
  name: string;
  sku?: string;
  price?: number;
  minimum_order_quantity?: number;
  currency?: string;
  group?: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    caption: string;
  };
  main_image?: string;
  images?: Array<{
    id?: number;
    url: string;
    thumbnail_url?: string;
  }>;
  presence?: 'available' | 'not_available' | 'order' | 'service';
  quantity_in_stock?: number;
  description?: string;
  keywords?: string;
  status?: 'on_display' | 'draft' | 'deleted' | 'not_on_display';
}

export interface PromImportUrlOptions {
  url: string;
  force_update?: boolean;
  only_available?: boolean;
  only_update?: boolean;
  mark_missing_product_as?:
    | 'none'
    | 'not_available'
    | 'not_on_display'
    | 'deleted';
  updated_fields?: string[];
}

export interface PromImportStatusResponse {
  id: string | number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  total_items?: number;
  processed_items?: number;
  errors?: unknown;
}

export interface PromOrderProduct {
  id: number;
  external_id?: string;
  name?: string;
  sku?: string;
  quantity: number;
  price: string | number;
  total_price?: string | number;
  image?: string;
  url?: string;
}

export interface PromOrder {
  id: number;
  date_created: string;
  client_first_name?: string;
  client_second_name?: string;
  client_last_name?: string;
  client_id?: number;
  client_notes?: string;
  phone?: string;
  email?: string;
  price?: string | number;
  full_price?: string | number;
  delivery_address?: string;
  delivery_option?: {
    id?: number;
    name?: string;
  };
  delivery_provider_data?: any;
  delivery_cost?: number;
  payment_option?: {
    id?: number;
    name?: string;
  };
  status: string;
  status_name?: string;
  source?: string;
  products: PromOrderProduct[];
}
