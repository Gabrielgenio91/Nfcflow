export type UserRole = 'admin' | 'reseller';
export type ResellerStatus = 'ATIVO' | 'BLOQUEADO';
export type ProductStatus = 'ATIVO' | 'INATIVO';
export type PlaqueStatus = 'DISPONIVEL' | 'ATIVA' | 'INATIVA';
export type MovementType = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE' | 'ATIVACAO' | 'RESERVA' | 'LIBERACAO';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reseller {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  document: string | null;
  address: string | null;
  status: ResellerStatus;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  reseller_id: string;
  establishment_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  product_type: string;
  width: number | null;
  height: number | null;
  unit: string | null;
  status: ProductStatus;
  min_order_qty?: number | null;
  max_order_qty?: number | null;
  sold_out?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductPriceTier {
  id: string;
  product_id: string;
  min_quantity: number;
  max_quantity: number | null;
  unit_price: number;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  reseller_id: string | null;
  quantity: number;
  movement_type: MovementType;
  origin: string | null;
  destination: string | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
  product?: Product;
}

export interface ResellerInventory {
  id: string;
  reseller_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  product?: Product;
}

export interface Plaque {
  id: string;
  product_id: string;
  reseller_id: string | null;
  customer_id: string | null;
  status: PlaqueStatus;
  public_token: string;
  created_at: string;
  activated_at: string | null;
  sale_value: number | string | null;
  sold_at: string | null;
  scan_count: number;
  updated_at: string;
  product?: Product;
  reseller?: Reseller;
  customer?: Customer;
  qr_destinations?: QrDestination[];
  qr_scans?: QrScan[];
}

export interface QrDestination {
  id: string;
  plaque_id: string;
  destination_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QrScan {
  id: string;
  plaque_id: string;
  user_agent: string | null;
  referer: string | null;
  ip_hash: string | null;
  scanned_at: string;
}

export interface Address {
  id: string;
  reseller_id: string;
  recipient_name: string;
  phone: string;
  zip_code: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  reseller_id: string;
  status: import('@/lib/orders').OrderStatus;
  subtotal: number;
  shipping_amount: number;
  discount_amount: number;
  total: number;
  payment_method: string;
  shipping_carrier: string;
  shipping_service: string | null;
  shipping_days: number | null;
  shipping_is_estimate: boolean;
  ship_recipient_name: string;
  ship_phone: string;
  ship_zip_code: string;
  ship_state: string;
  ship_city: string;
  ship_neighborhood: string;
  ship_street: string;
  ship_number: string;
  ship_complement: string | null;
  tracking_code: string | null;
  reservation_expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  payments?: Payment[];
  reseller?: Pick<Reseller, 'id' | 'full_name' | 'email'>;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string;
  amount: number;
  status: string;
  payment_method: string;
  raw_status: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  expires_at: string | null;
  needs_review: boolean;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shipment {
  id: string;
  order_id: string;
  carrier: string;
  tracking_code: string | null;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

export type TicketStatus = 'ABERTO' | 'EM_ATENDIMENTO' | 'RESOLVIDO' | 'FECHADO';

export interface SupportTicket {
  id: string;
  reseller_id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  reseller?: Pick<Reseller, 'id' | 'full_name' | 'email'>;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: 'reseller' | 'admin';
  body: string;
  created_at: string;
}

export interface StoreProduct {
  product_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  product_type: string;
  width: number | null;
  height: number | null;
  unit: string | null;
  available: number;
  tiers: { id: string; min_quantity: number; max_quantity: number | null; unit_price: number }[];
  min_order_qty?: number | null;
  max_order_qty?: number | null;
  sold_out?: boolean;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  position: number;
  created_at: string;
}
