export type UserRole = 'customer' | 'trainer' | 'facility_owner' | 'admin';

export type BookingStatus =
  | 'pending'
  | 'payment_pending'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'failed'
  | 'expired';

export type PaymentMethod = 'upi' | 'credit_card' | 'debit_card';

export interface AuthUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: number;
  preferred_sports: string[];
  city: string;
  address: string;
  emergency_contact: string;
  notification_email: boolean;
  notification_sms: boolean;
  created_at?: string;
}

export interface Sport {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon_name: string;
  image_url: string;
  is_active: number;
  facility_count?: number;
  trainer_count?: number;
}

export interface FacilitySummary {
  id: number;
  owner_id: number;
  owner_name?: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  city: string;
  price_per_hour: number;
  amenities: string[];
  rating_avg: number;
  review_count: number;
  is_active: number;
  image_url: string;
  sports: Array<{ id: number; name: string; slug: string }>;
  available_slots_count: number;
  total_slots_count: number;
}

export interface FacilitySlot {
  id: number;
  slot_label: string;
  start_time: string;
  end_time: string;
  price_override: number | null;
  is_blocked: number;
  price: number;
  state: 'available' | 'booked' | 'held' | 'blocked';
  is_available: boolean;
}

export interface ReviewItem {
  id: number;
  user_id: number;
  reviewer_name: string;
  reviewer_avatar?: string | null;
  rating: number;
  comment: string;
  moderation_status: string;
  created_at: string;
}

export interface FacilityDetail extends FacilitySummary {
  business_name?: string;
  images: Array<{ id: number; image_url: string; is_primary: number }>;
  operating_hours: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: number }>;
  reviews: ReviewItem[];
}

export interface TrainerSummary {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  avatar_url: string | null;
  bio: string;
  experience_years: number;
  certifications: string[];
  session_price: number;
  city: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  rating_avg: number;
  review_count: number;
  sports: Array<{ id: number; name: string; slug: string }>;
  available_slots_count: number;
}

export interface TrainerAvailabilitySlot {
  id: number;
  trainer_user_id: number;
  avail_date: string;
  slot_label: string;
  start_time: string;
  end_time: string;
  is_booked: number;
}

export interface TrainerDetail extends TrainerSummary {
  availability: TrainerAvailabilitySlot[];
  reviews: ReviewItem[];
}

export interface BookingRecord {
  id: number;
  booking_ref: string;
  booking_type: 'facility' | 'trainer';
  facility_id?: number;
  facility_name?: string;
  facility_city?: string;
  facility_address?: string;
  trainer_user_id?: number;
  trainer_name?: string;
  sport_id: number;
  sport_name: string;
  booking_date: string;
  slot_label: string;
  total_amount: number;
  status: BookingStatus;
  payment_ref?: string;
  payment_method?: PaymentMethod;
  payment_status?: string;
  refund_amount?: number;
  refund_percentage?: number;
  has_reviewed?: number;
  notes?: string;
  created_at: string;
}

export interface PaymentRecord {
  id: number;
  payment_ref: string;
  booking_id: number | null;
  trainer_session_id: number | null;
  booking_ref?: string | null;
  session_ref?: string | null;
  facility_name?: string | null;
  trainer_name?: string | null;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  method: PaymentMethod;
  method_detail: string;
  amount: number;
  currency: string;
  status: 'initiated' | 'verified' | 'failed' | 'cancelled' | 'refunded';
  failure_reason?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}
