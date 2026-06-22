export type Role           = 'admin' | 'team_lead' | 'agent'
export type ProfileStatus  = 'pending' | 'active'
export type PhoneStatus    = 'in_stock' | 'assigned' | 'sold' | 'returned' | 'damaged'
export type ReturnStatus   = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ReturnReason   = 'Defective' | 'Wrong Item' | 'Customer Refusal' | 'Other'

export type ActivityActionType =
  | 'PHONE_ASSIGNED'
  | 'PHONE_UNASSIGNED'
  | 'SALE_RECORDED'
  | 'SALE_RETURNED'
  | 'STOCK_ADDED'
  | 'STOCK_ADJUSTED'
  | 'USER_CREATED'
  | 'USER_DEACTIVATED'
  | 'RECEIPT_GENERATED'
  | 'SCAN_EVENT'
  | 'PAYROLL_CONFIG_SAVED'
  | 'PAYROLL_CONFIG_DELETED'
  | 'PAYROLL_RUN_GENERATED'

export interface Profile {
  id:           string
  full_name:    string
  phone_number: string | null
  role:         Role
  team_lead_id: string | null
  status:       ProfileStatus
  created_at:   string
  team_lead?:   Profile
}

export interface Phone {
  id:            string
  model:         string
  barcode:       string | null
  imei:          string | null
  serial_number: string
  status:        PhoneStatus
  assigned_to:   string | null
  assigned_at:   string | null
  sold_at:       string | null
  created_at:    string
  assigned_profile?: Profile
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'POS'

export interface Sale {
  id:             string
  phone_id:       string
  sold_by:        string
  sold_at:        string
  buyer_name:     string | null
  buyer_phone:    string | null
  agreed_price:   number | null
  payment_method: PaymentMethod | null
}

export interface Receipt {
  id:             string
  sale_id:        string
  receipt_number: string
  phone_id:       string
  agent_id:       string
  buyer_name:     string
  buyer_phone:    string
  selling_price:  number
  payment_method: PaymentMethod
  generated_at:   string
  pdf_url:        string | null
  voided:         boolean
  phone?:         Phone
  agent?:         Profile
}

export interface Notification {
  id:           string
  recipient_id: string
  type:         string
  title:        string
  body:         string
  sale_id:      string | null
  read:         boolean
  created_at:   string
}

export interface SaleFormData {
  buyerName:     string
  buyerPhone:    string
  agreedPrice:   string
  paymentMethod: PaymentMethod
}

export interface PhoneReturn {
  id:               string
  phone_id:         string
  original_sale_id: string | null
  returned_by:      string
  approved_by:      string | null
  return_reason:    ReturnReason
  return_status:    ReturnStatus
  created_at:       string
  resolved_at:      string | null
  notes:            string | null
  rejection_note:   string | null
  phone?:           Phone
  requester?:       Profile
  approver?:        Profile
}

export interface ActivityLogEntry {
  id:           string
  created_at:   string
  actor_id:     string
  actor_name:   string
  role:         string
  action_type:  ActivityActionType
  entity_type:  string
  entity_id:    string | null
  entity_label: string
  meta:         Record<string, unknown> | null
  team_lead_id: string | null
  agent_id:     string | null
}

export interface AdminDashboardStats {
  total:    number
  in_stock: number
  in_field: number
  sold:     number
  returned: number
  damaged:  number
}

export interface AgentStats {
  assigned:  number
  sold:      number
  remaining: number
}
