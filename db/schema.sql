-- PLAYNEX Sports & Facility Management Platform
-- Production PostgreSQL Schema (Normalized 3NF, 20 Tables)
-- Compatible with PostgreSQL 15+ / Supabase / Cloud SQL

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Core Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('customer', 'trainer', 'facility_owner', 'admin')) DEFAULT 'customer',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Customer Profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_sports TEXT[] DEFAULT '{}',
  city TEXT,
  address TEXT,
  emergency_contact TEXT,
  notification_email BOOLEAN NOT NULL DEFAULT TRUE,
  notification_sms BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sports Categories
CREATE TABLE IF NOT EXISTS sports (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Facility Owners
CREATE TABLE IF NOT EXISTS facility_owners (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  gst_number TEXT,
  city TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Facilities
CREATE TABLE IF NOT EXISTS facilities (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  price_per_hour INTEGER NOT NULL CHECK (price_per_hour > 0),
  amenities TEXT[] DEFAULT '{}',
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  review_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Facility Images
CREATE TABLE IF NOT EXISTS facility_images (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 7. Facility Sports (M:N)
CREATE TABLE IF NOT EXISTS facility_sports (
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  PRIMARY KEY (facility_id, sport_id)
);

-- 8. Facility Operating Hours
CREATE TABLE IF NOT EXISTS facility_operating_hours (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (facility_id, day_of_week)
);

-- 9. Facility Time Slots
CREATE TABLE IF NOT EXISTS facility_time_slots (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  slot_label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  price_override INTEGER,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (facility_id, slot_label)
);

-- 10. Trainer Profiles
CREATE TABLE IF NOT EXISTS trainer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT NOT NULL,
  experience_years INTEGER NOT NULL CHECK (experience_years >= 0),
  certifications TEXT[] DEFAULT '{}',
  session_price INTEGER NOT NULL CHECK (session_price > 0),
  city TEXT NOT NULL,
  approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  review_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Trainers Directory View / Alias Table
CREATE TABLE IF NOT EXISTS trainers (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL UNIQUE REFERENCES trainer_profiles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  featured BOOLEAN NOT NULL DEFAULT FALSE
);

-- 12. Trainer Sports (M:N)
CREATE TABLE IF NOT EXISTS trainer_sports (
  trainer_id INTEGER NOT NULL REFERENCES trainer_profiles(id) ON DELETE CASCADE,
  sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  PRIMARY KEY (trainer_id, sport_id)
);

-- 13. Trainer Availability
CREATE TABLE IF NOT EXISTS trainer_availability (
  id SERIAL PRIMARY KEY,
  trainer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avail_date DATE NOT NULL,
  slot_label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (trainer_user_id, avail_date, slot_label)
);

-- 14. Facility Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  sport_id INTEGER NOT NULL REFERENCES sports(id),
  booking_date DATE NOT NULL,
  slot_label TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'failed', 'expired')),
  reservation_expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_no_double_book
  ON bookings(facility_id, booking_date, slot_label)
  WHERE status IN ('pending', 'payment_pending', 'confirmed', 'rescheduled');

-- 15. Trainer Sessions
CREATE TABLE IF NOT EXISTS trainer_sessions (
  id SERIAL PRIMARY KEY,
  session_ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport_id INTEGER NOT NULL REFERENCES sports(id),
  availability_id INTEGER REFERENCES trainer_availability(id),
  session_date DATE NOT NULL,
  slot_label TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'failed', 'expired')),
  reservation_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  payment_ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE SET NULL,
  gateway_order_id TEXT NOT NULL,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'debit_card')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('initiated', 'verified', 'failed', 'cancelled', 'refunded')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Cancellations
CREATE TABLE IF NOT EXISTS cancellations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE CASCADE,
  cancelled_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  refund_percentage INTEGER NOT NULL,
  refund_amount INTEGER NOT NULL,
  refund_status TEXT NOT NULL CHECK (refund_status IN ('processed', 'pending', 'not_applicable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Reviews & Ratings
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id INTEGER REFERENCES facilities(id) ON DELETE CASCADE,
  trainer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  moderation_status TEXT NOT NULL CHECK (moderation_status IN ('approved', 'flagged', 'removed')) DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Reported Issues
CREATE TABLE IF NOT EXISTS reported_issues (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('facility', 'trainer', 'booking', 'payment', 'other')),
  target_id INTEGER,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')) DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_facility_date ON bookings(facility_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
