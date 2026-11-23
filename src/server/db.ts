import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';

export interface DbStatementLike {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { lastInsertRowid: number | bigint; changes: number | bigint };
}

export interface DbLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => DbStatementLike;
}

export function resolveDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SQLITE_DB_PATH) {
    return env.SQLITE_DB_PATH;
  }
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'arena360.db');
  }
  return path.resolve(process.cwd(), 'data', 'arena360.db');
}

export async function createSqlJsDatabase(): Promise<DbLike> {
  const wasmPath = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
  let wasmBinary: ArrayBuffer | undefined;
  try {
    if (fs.existsSync(wasmPath)) {
      const buf = fs.readFileSync(wasmPath);
      wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
  } catch {
    // Let sql.js resolve wasm automatically if file read fails
  }

  const SQL = await initSqlJs(
    wasmBinary ? ({ wasmBinary } as Parameters<typeof initSqlJs>[0]) : undefined
  );
  const rawDb = new SQL.Database();
  rawDb.exec('PRAGMA foreign_keys = ON;');

  const norm = (params: unknown[]) =>
    params.map((p) => (p === undefined ? null : (p as string | number | null | Uint8Array)));

  return {
    exec(sql: string) {
      rawDb.exec(sql);
    },
    prepare(sql: string): DbStatementLike {
      return {
        get(...params: unknown[]) {
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length > 0) stmt.bind(norm(params));
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: unknown[]) {
          const stmt = rawDb.prepare(sql);
          const rows: Record<string, unknown>[] = [];
          try {
            if (params.length > 0) stmt.bind(norm(params));
            while (stmt.step()) {
              rows.push(stmt.getAsObject() as Record<string, unknown>);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: unknown[]) {
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length > 0) stmt.bind(norm(params));
            stmt.step();
          } finally {
            stmt.free();
          }
          const lastRes = rawDb.exec('SELECT last_insert_rowid() AS id');
          const lastInsertRowid = Number(lastRes[0]?.values[0]?.[0] ?? 0);
          const changes = rawDb.getRowsModified();
          return { lastInsertRowid, changes };
        },
      };
    },
  };
}

async function createDatabase(): Promise<DbLike> {
  if (process.env.USE_SQLJS !== '1') {
    try {
      const sqliteMod = (await import('node:sqlite')) as typeof import('node:sqlite');
      const dbPath = resolveDatabasePath();
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const nativeDb = new sqliteMod.DatabaseSync(dbPath);
      try {
        nativeDb.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // Ignore on filesystems that do not support WAL locking
      }
      nativeDb.exec('PRAGMA foreign_keys = ON;');
      return nativeDb as unknown as DbLike;
    } catch (err) {
      console.warn('[db] node:sqlite unavailable, using sql.js WASM fallback:', (err as Error).message);
    }
  }
  return createSqlJsDatabase();
}

export const db: DbLike = await createDatabase();

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('customer', 'trainer', 'facility_owner', 'admin')) DEFAULT 'customer',
      avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      preferred_sports TEXT NOT NULL DEFAULT '[]',
      city TEXT DEFAULT 'Bengaluru',
      address TEXT DEFAULT '',
      emergency_contact TEXT DEFAULT '',
      notification_email INTEGER NOT NULL DEFAULT 1,
      notification_sms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      icon_name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facility_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      gst_number TEXT,
      city TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      price_per_hour INTEGER NOT NULL CHECK (price_per_hour > 0),
      amenities TEXT NOT NULL DEFAULT '[]',
      rating_avg REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facility_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS facility_sports (
      facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
      PRIMARY KEY (facility_id, sport_id)
    );

    CREATE TABLE IF NOT EXISTS facility_operating_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      open_time TEXT NOT NULL,
      close_time TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      UNIQUE (facility_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS facility_time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      slot_label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      price_override INTEGER,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      UNIQUE (facility_id, slot_label)
    );

    CREATE TABLE IF NOT EXISTS trainer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 0,
      certifications TEXT NOT NULL DEFAULT '[]',
      session_price INTEGER NOT NULL CHECK (session_price > 0),
      city TEXT NOT NULL,
      approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      rating_avg REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trainers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL UNIQUE REFERENCES trainer_profiles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      featured INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trainer_sports (
      trainer_id INTEGER NOT NULL REFERENCES trainer_profiles(id) ON DELETE CASCADE,
      sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
      PRIMARY KEY (trainer_id, sport_id)
    );

    CREATE TABLE IF NOT EXISTS trainer_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      avail_date TEXT NOT NULL,
      slot_label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_booked INTEGER NOT NULL DEFAULT 0,
      UNIQUE (trainer_user_id, avail_date, slot_label)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      sport_id INTEGER NOT NULL REFERENCES sports(id),
      booking_date TEXT NOT NULL,
      slot_label TEXT NOT NULL,
      total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'failed', 'expired')),
      reservation_expires_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_no_double_book
      ON bookings(facility_id, booking_date, slot_label)
      WHERE status IN ('pending', 'confirmed', 'rescheduled');

    CREATE TABLE IF NOT EXISTS trainer_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_ref TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trainer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sport_id INTEGER NOT NULL REFERENCES sports(id),
      availability_id INTEGER REFERENCES trainer_availability(id),
      session_date TEXT NOT NULL,
      slot_label TEXT NOT NULL,
      total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'failed', 'expired')),
      reservation_expires_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_ref TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE SET NULL,
      gateway_order_id TEXT NOT NULL,
      gateway_payment_id TEXT,
      gateway_signature TEXT,
      method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'debit_card')),
      method_detail TEXT DEFAULT '',
      amount INTEGER NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL CHECK (status IN ('initiated', 'verified', 'failed', 'cancelled', 'refunded')),
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cancellations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE CASCADE,
      cancelled_by INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      refund_percentage INTEGER NOT NULL,
      refund_amount INTEGER NOT NULL,
      refund_status TEXT NOT NULL CHECK (refund_status IN ('processed', 'pending', 'not_applicable')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      facility_id INTEGER REFERENCES facilities(id) ON DELETE CASCADE,
      trainer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      trainer_session_id INTEGER REFERENCES trainer_sessions(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      moderation_status TEXT NOT NULL CHECK (moderation_status IN ('approved', 'flagged', 'removed')) DEFAULT 'approved',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reported_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('facility', 'trainer', 'booking', 'payment', 'other')),
      target_id INTEGER,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')) DEFAULT 'open',
      admin_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reset_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function seedDatabaseIfEmpty(): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (existingUsers.cnt > 0) return;

  const demoPassword = process.env.SEED_DEMO_PASSWORD || 'Arena360@2026';
  const pwHash = bcrypt.hashSync(demoPassword, 10);

  db.exec('BEGIN IMMEDIATE;');
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (uid, name, email, phone, password_hash, role, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const customerId = Number(
      insertUser.run(
        'demo-customer-01',
        'Aarav Mehta',
        'customer@arena360.in',
        '9876543210',
        pwHash,
        'customer',
        null
      ).lastInsertRowid
    );
    const customer2Id = Number(
      insertUser.run(
        'demo-customer-02',
        'Priya Nair',
        'priya.nair@arena360.in',
        '9876543211',
        pwHash,
        'customer',
        null
      ).lastInsertRowid
    );
    const trainer1Id = Number(
      insertUser.run(
        'demo-trainer-01',
        'Rohan Kulkarni',
        'trainer@arena360.in',
        '9876543220',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainer2Id = Number(
      insertUser.run(
        'demo-trainer-02',
        'Ananya Deshmukh',
        'ananya.coach@arena360.in',
        '9876543221',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainer3Id = Number(
      insertUser.run(
        'demo-trainer-03',
        'Vikramaditya Rao',
        'vikram.swim@arena360.in',
        '9876543222',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainer4Id = Number(
      insertUser.run(
        'demo-trainer-04',
        'Meera Subramanian',
        'meera.coach@arena360.in',
        '9876543224',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainer5Id = Number(
      insertUser.run(
        'demo-trainer-05',
        'Arjun Gowda',
        'arjun.coach@arena360.in',
        '9876543225',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainer6Id = Number(
      insertUser.run(
        'demo-trainer-06',
        'Nandini Hegde',
        'nandini.coach@arena360.in',
        '9876543226',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const trainerPendingId = Number(
      insertUser.run(
        'demo-trainer-07',
        'Kabir Malhotra',
        'kabir.pending@arena360.in',
        '9876543223',
        pwHash,
        'trainer',
        null
      ).lastInsertRowid
    );
    const owner1Id = Number(
      insertUser.run(
        'demo-owner-01',
        'Siddharth Verma',
        'owner@arena360.in',
        '9876543230',
        pwHash,
        'facility_owner',
        null
      ).lastInsertRowid
    );
    const adminId = Number(
      insertUser.run(
        'demo-admin-01',
        'Karthik Subramanian',
        'admin@arena360.in',
        '9876543240',
        pwHash,
        'admin',
        null
      ).lastInsertRowid
    );

    db.prepare(`
      INSERT INTO customer_profiles (user_id, preferred_sports, city, address, emergency_contact)
      VALUES (?, ?, ?, ?, ?)
    `).run(customerId, JSON.stringify(['Badminton', 'Cricket', 'Swimming']), 'Bengaluru', '12th Main, Indiranagar, Bengaluru', '9876500001');

    db.prepare(`
      INSERT INTO customer_profiles (user_id, preferred_sports, city, address, emergency_contact)
      VALUES (?, ?, ?, ?, ?)
    `).run(customer2Id, JSON.stringify(['Tennis', 'Gym/Fitness', 'Table Tennis']), 'Bengaluru', '15th Cross, Malleshwaram, Bengaluru', '9876500002');

    db.prepare(`
      INSERT INTO facility_owners (user_id, business_name, gst_number, city, verified)
      VALUES (?, ?, ?, ?, 1)
    `).run(owner1Id, 'Apex Athletic Venues Pvt Ltd', '29AABCU9603R1ZM', 'Bengaluru');

    const sportsSeed = [
      ['cricket', 'Cricket', 'Floodlit turf pitches, bowling-machine lanes, and leather-ball practice nets in Bengaluru.', 'Trophy', '/src/assets/images/sport_cricket_turf_1794838292791.jpg'],
      ['football', 'Football', 'FIFA-grade 5v5, 7v7, and full-size astro turf arenas with night floodlights.', 'Goal', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['badminton', 'Badminton', 'Indoor BWF-approved cushioned synthetic courts with anti-glare arena lighting.', 'Wind', '/src/assets/images/sport_badminton_court_1794838289668.jpg'],
      ['tennis', 'Tennis', 'All-weather acrylic hard courts and European red clay courts for singles and doubles.', 'CircleDot', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['basketball', 'Basketball', 'Indoor maple hardwood courts and FIBA-regulated full courts.', 'Dribbble', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['swimming', 'Swimming', 'Temperature-controlled indoor 25m and 50m Olympic lap pools with certified lifeguards.', 'Waves', '/src/assets/images/sport_swimming_pool_1794838290203.jpg'],
      ['gym-fitness', 'Gym/Fitness', 'Indoor strength conditioning bays, Olympic lifting platforms, and turf sled lanes.', 'Dumbbell', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['skating', 'Skating', 'Banked speed-skating tracks and smooth indoor artistic roller rinks.', 'Zap', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['table-tennis', 'Table Tennis', 'Indoor ITTF-approved Stag & Butterfly championship tables with anti-slip vinyl flooring.', 'CircleDot', '/src/assets/images/sport_badminton_court_1794838289668.jpg'],
      ['squash', 'Squash', 'Air-conditioned glass-back indoor squash courts with sprung maple floors.', 'Shield', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['volleyball', 'Volleyball', 'Indoor wooden and cushioned sand-free competition volleyball courts.', 'Trophy', '/src/assets/images/hero_sports_arena_1794838288174.jpg'],
      ['pickleball', 'Pickleball', 'Indoor & floodlit cushioned acrylic pickleball courts with pro competition nets.', 'Wind', '/src/assets/images/sport_badminton_court_1794838289668.jpg'],
    ];

    const sportIds: Record<string, number> = {};
    const insertSport = db.prepare(`
      INSERT INTO sports (slug, name, description, icon_name, image_url) VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of sportsSeed) {
      const id = Number(insertSport.run(s[0], s[1], s[2], s[3], s[4]).lastInsertRowid);
      sportIds[s[1]] = id;
    }

    const facilitiesSeed = [
      {
        name: 'Indiranagar Smash Pavilion',
        slug: 'indiranagar-smash-pavilion',
        description: 'Six BWF-certified indoor emerald synthetic badminton courts and ITTF table tennis bays with 11-meter clear ceiling height and non-glare LEDs.',
        address: '100 Feet Road, Indiranagar',
        city: 'Bengaluru',
        price: 650,
        amenities: ['BWF Synthetic Mats', 'Indoor AC Arena', 'Showers & Lockers', 'Drinking Water', 'Parking'],
        sports: ['Badminton', 'Table Tennis'],
        image: '/src/assets/images/sport_badminton_court_1794838289668.jpg',
        rating: 4.9,
        reviews: 2,
      },
      {
        name: 'Koramangala Turf & Cricket Bowl',
        slug: 'koramangala-turf-cricket-bowl',
        description: 'Enclosed 7v7 astro-turf pitch and 4 floodlit cricket practice nets equipped with dual-wheel bowling machines and video speed tracking.',
        address: '80 Feet Road, Koramangala 4th Block',
        city: 'Bengaluru',
        price: 1400,
        amenities: ['LED Floodlights', 'Bowling Machine', 'Dugout Seating', 'First Aid', 'Free Parking'],
        sports: ['Cricket', 'Football'],
        image: '/src/assets/images/sport_cricket_turf_1794838292791.jpg',
        rating: 4.8,
        reviews: 1,
      },
      {
        name: 'Whitefield Olympic Aquatics Center',
        slug: 'whitefield-olympic-aquatics',
        description: 'Heated 50-meter 8-lane indoor competition pool with ozone filtration, starting blocks, electronic pace clocks, and dedicated recovery deck.',
        address: 'ITPL Main Road, Whitefield',
        city: 'Bengaluru',
        price: 550,
        amenities: ['Heated 27°C Water', 'Ozone Filtration', 'Certified Lifeguards', 'Heated Showers', 'Locker Rooms'],
        sports: ['Swimming'],
        image: '/src/assets/images/sport_swimming_pool_1794838290203.jpg',
        rating: 4.9,
        reviews: 1,
      },
      {
        name: 'Jayanagar Multi-Sport Arena',
        slug: 'jayanagar-multi-sport-arena',
        description: 'Bengaluru architectural multi-sport complex featuring indoor FIBA maple basketball & volleyball courts, tennis hard courts, and conditioning bay.',
        address: '11th Main, 4th Block, Jayanagar',
        city: 'Bengaluru',
        price: 1100,
        amenities: ['Maple Hardwood', 'Air-Conditioned', 'Cafe & Hydration', 'Physio Bay', 'Parking'],
        sports: ['Basketball', 'Tennis', 'Gym/Fitness', 'Volleyball'],
        image: '/src/assets/images/hero_sports_arena_1794838288174.jpg',
        rating: 4.7,
        reviews: 0,
      },
      {
        name: 'HSR Lakeview Racquet Club',
        slug: 'hsr-lakeview-racquet-club',
        description: 'ITF-spec cushioned acrylic tennis & pickleball courts alongside four air-cooled indoor badminton courts in HSR Layout.',
        address: '27th Main, HSR Layout Sector 1',
        city: 'Bengaluru',
        price: 850,
        amenities: ['ITF Cushion Acrylic', 'Ball Machine', 'Pro Shop', 'Lounge', 'Parking'],
        sports: ['Tennis', 'Badminton', 'Pickleball'],
        image: '/src/assets/images/sport_badminton_court_1794838289668.jpg',
        rating: 4.8,
        reviews: 0,
      },
      {
        name: 'Sadashivanagar Velocity Rink & Gym',
        slug: 'sadashivanagar-velocity-rink',
        description: '200m banked speed-skating circuit paired with an indoor Olympic strength & functional fitness training floor in Sadashivanagar.',
        address: 'Sankey Tank Road, Sadashivanagar',
        city: 'Bengaluru',
        price: 700,
        amenities: ['Banked Track', 'Helmet Rental', 'Olympic Racks', 'Changing Rooms', 'Parking'],
        sports: ['Skating', 'Gym/Fitness'],
        image: '/src/assets/images/hero_sports_arena_1794838288174.jpg',
        rating: 4.6,
        reviews: 0,
      },
      {
        name: 'MG Road Indoor Sports Pavilion',
        slug: 'mg-road-indoor-pavilion',
        description: 'Climate-controlled central Bengaluru indoor sports hub with glass-back squash courts, ITTF table tennis, indoor pickleball, and volleyball.',
        address: 'Church Street Annex, MG Road',
        city: 'Bengaluru',
        price: 750,
        amenities: ['Glass-Back Squash', 'ITTF Tables', 'Climate Controlled', 'Locker Suites', 'Metro Access'],
        sports: ['Table Tennis', 'Squash', 'Pickleball', 'Volleyball', 'Badminton'],
        image: '/src/assets/images/hero_sports_arena_1794838288174.jpg',
        rating: 4.8,
        reviews: 0,
      },
    ];

    const standardSlots = [
      ['06:00 - 07:00', '06:00', '07:00'],
      ['07:00 - 08:00', '07:00', '08:00'],
      ['08:00 - 09:00', '08:00', '09:00'],
      ['09:00 - 10:00', '09:00', '10:00'],
      ['16:00 - 17:00', '16:00', '17:00'],
      ['17:00 - 18:00', '17:00', '18:00'],
      ['18:00 - 19:00', '18:00', '19:00'],
      ['19:00 - 20:00', '19:00', '20:00'],
      ['20:00 - 21:00', '20:00', '21:00'],
      ['21:00 - 22:00', '21:00', '22:00'],
    ];

    const facilityIds: number[] = [];
    const insertFacility = db.prepare(`
      INSERT INTO facilities (owner_id, name, slug, description, address, city, price_per_hour, amenities, rating_avg, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFacImg = db.prepare(`
      INSERT INTO facility_images (facility_id, image_url, is_primary, sort_order) VALUES (?, ?, 1, 0)
    `);
    const insertFacSport = db.prepare(`INSERT INTO facility_sports (facility_id, sport_id) VALUES (?, ?)`);
    const insertFacHours = db.prepare(`
      INSERT INTO facility_operating_hours (facility_id, day_of_week, open_time, close_time, is_closed)
      VALUES (?, ?, '06:00', '22:00', 0)
    `);
    const insertFacSlot = db.prepare(`
      INSERT INTO facility_time_slots (facility_id, slot_label, start_time, end_time)
      VALUES (?, ?, ?, ?)
    `);

    for (const f of facilitiesSeed) {
      const fId = Number(
        insertFacility.run(
          owner1Id,
          f.name,
          f.slug,
          f.description,
          f.address,
          f.city,
          f.price,
          JSON.stringify(f.amenities),
          f.rating,
          f.reviews
        ).lastInsertRowid
      );
      facilityIds.push(fId);
      insertFacImg.run(fId, f.image);
      for (const sName of f.sports) {
        if (sportIds[sName]) insertFacSport.run(fId, sportIds[sName]);
      }
      for (let d = 0; d < 7; d++) {
        insertFacHours.run(fId, d);
      }
      for (const slot of standardSlots) {
        insertFacSlot.run(fId, slot[0], slot[1], slot[2]);
      }
    }

    // Trainers: 6 approved Bengaluru coaches (every sport has 2 approved coaches) + 1 pending for admin workflow
    const insertTrainerProfile = db.prepare(`
      INSERT INTO trainer_profiles (user_id, bio, experience_years, certifications, session_price, city, approval_status, rating_avg, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTrainerRow = db.prepare(`INSERT INTO trainers (profile_id, user_id, featured) VALUES (?, ?, ?)`);
    const insertTrainerSport = db.prepare(`INSERT INTO trainer_sports (trainer_id, sport_id) VALUES (?, ?)`);

    const tp1 = Number(
      insertTrainerProfile.run(
        trainer1Id,
        'Former national-level racquet specialist in Bengaluru coaching footwork precision, deceptive net play, and indoor racquet match strategy.',
        9,
        JSON.stringify(['BWF Level 2 Coach', 'ITTF Level 1 Table Tennis', 'WSF Squash Level 1']),
        1200,
        'Bengaluru',
        'approved',
        4.9,
        1
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp1, trainer1Id, 1);
    for (const sp of ['Badminton', 'Tennis', 'Table Tennis', 'Squash']) {
      insertTrainerSport.run(tp1, sportIds[sp]);
    }

    const tp2 = Number(
      insertTrainerProfile.run(
        trainer2Id,
        'High-performance strength, conditioning, and field-sport biomechanics coach working with Bengaluru club and state-level athletes.',
        7,
        JSON.stringify(['NSCA-CSCS', 'ECB Level 2 Cricket', 'AIFF C License']),
        1500,
        'Bengaluru',
        'approved',
        4.8,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp2, trainer2Id, 1);
    for (const sp of ['Cricket', 'Football', 'Gym/Fitness', 'Volleyball']) {
      insertTrainerSport.run(tp2, sportIds[sp]);
    }

    const tp3 = Number(
      insertTrainerProfile.run(
        trainer3Id,
        'FINA-certified swim technique, skating agility, and court conditioning coach in Bengaluru specializing in endurance and athletic power.',
        11,
        JSON.stringify(['ASCA Level 3 Swim', 'FINA Lifesaving Instructor', 'RSFI Skating Coach']),
        1100,
        'Bengaluru',
        'approved',
        4.9,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp3, trainer3Id, 1);
    for (const sp of ['Swimming', 'Skating', 'Gym/Fitness', 'Basketball']) {
      insertTrainerSport.run(tp3, sportIds[sp]);
    }

    const tp4 = Number(
      insertTrainerProfile.run(
        trainer4Id,
        'Indoor racquet sports specialist coaching singles/doubles tactics across Badminton, Table Tennis, Squash, and Pickleball in Bengaluru.',
        8,
        JSON.stringify(['NIS Certified Badminton', 'ITTF Level 2 Coach', 'IPTPA Pickleball Pro']),
        1300,
        'Bengaluru',
        'approved',
        4.9,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp4, trainer4Id, 1);
    for (const sp of ['Badminton', 'Table Tennis', 'Squash', 'Pickleball']) {
      insertTrainerSport.run(tp4, sportIds[sp]);
    }

    const tp5 = Number(
      insertTrainerProfile.run(
        trainer5Id,
        'Bengaluru team-sports and tactical coach mentoring competitive Cricket, Football, Basketball, and indoor Volleyball squads.',
        6,
        JSON.stringify(['BCCI Level 1 Cricket', 'FIBA Level 1 Coach', 'VFI Volleyball Coach']),
        1050,
        'Bengaluru',
        'approved',
        4.7,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp5, trainer5Id, 1);
    for (const sp of ['Cricket', 'Football', 'Basketball', 'Volleyball']) {
      insertTrainerSport.run(tp5, sportIds[sp]);
    }

    const tp6 = Number(
      insertTrainerProfile.run(
        trainer6Id,
        'Certified Bengaluru court & aquatics coach delivering biomechanical stroke correction in Tennis, Pickleball, Swimming, and Speed Skating.',
        10,
        JSON.stringify(['AITA Level 4 Tennis', 'ASCA Level 2 Swim', 'IPTPA Certified Coach']),
        1250,
        'Bengaluru',
        'approved',
        4.8,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp6, trainer6Id, 1);
    for (const sp of ['Tennis', 'Swimming', 'Skating', 'Pickleball']) {
      insertTrainerSport.run(tp6, sportIds[sp]);
    }

    const tpPending = Number(
      insertTrainerProfile.run(
        trainerPendingId,
        'Youth football tactical & agility coach in Bengaluru focused on ball mastery and positional awareness.',
        4,
        JSON.stringify(['AIFF D License']),
        900,
        'Bengaluru',
        'pending',
        0,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tpPending, trainerPendingId, 0);
    insertTrainerSport.run(tpPending, sportIds['Football']);

    // Trainer availability for today + next 5 days for all 6 approved Bengaluru coaches
    const insertTrainerAvail = db.prepare(`
      INSERT INTO trainer_availability (trainer_user_id, avail_date, slot_label, start_time, end_time, is_booked)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tSlots = [
      ['07:00 - 08:00', '07:00', '08:00'],
      ['08:00 - 09:00', '08:00', '09:00'],
      ['17:00 - 18:00', '17:00', '18:00'],
      ['18:00 - 19:00', '18:00', '19:00'],
    ];
    for (const tUid of [trainer1Id, trainer2Id, trainer3Id, trainer4Id, trainer5Id, trainer6Id]) {
      for (let d = 0; d <= 5; d++) {
        const dt = futureDate(d);
        for (const sl of tSlots) {
          insertTrainerAvail.run(tUid, dt, sl[0], sl[1], sl[2], 0);
        }
      }
    }

    // Seed sample bookings (2 past completed for review demo, 2 upcoming confirmed)
    const past1 = pastDate(3);
    const past2 = pastDate(7);
    const upcoming1 = futureDate(1);
    const upcoming2 = futureDate(2);

    const b1 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Court 2 preferred')
      `).run('PNX-BK-261110-A1B2C3', customerId, facilityIds[0], sportIds['Badminton'], past1, '18:00 - 19:00', 650).lastInsertRowid
    );

    const b2 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Net lane 1 with bowling machine')
      `).run('PNX-BK-261106-D4E5F6', customerId, facilityIds[1], sportIds['Cricket'], past2, '19:00 - 20:00', 1400).lastInsertRowid
    );

    const b3 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Evening doubles match')
      `).run('PNX-BK-261117-G7H8I9', customerId, facilityIds[0], sportIds['Badminton'], upcoming1, '19:00 - 20:00', 650).lastInsertRowid
    );

    const b4 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Morning lap session')
      `).run('PNX-BK-261118-J1K2L3', customer2Id, facilityIds[2], sportIds['Swimming'], upcoming2, '07:00 - 08:00', 550).lastInsertRowid
    );

    // Sample trainer session
    const ts1 = Number(
      db.prepare(`
        INSERT INTO trainer_sessions (session_ref, customer_id, trainer_user_id, sport_id, session_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Footwork & backhand smash clinic')
      `).run('PNX-TR-261109-M4N5O6', customerId, trainer1Id, sportIds['Badminton'], past1, '08:00 - 09:00', 1200).lastInsertRowid
    );

    const ts2 = Number(
      db.prepare(`
        INSERT INTO trainer_sessions (session_ref, customer_id, trainer_user_id, sport_id, session_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Match tactics review')
      `).run('PNX-TR-261118-P7Q8R9', customerId, trainer1Id, sportIds['Badminton'], upcoming2, '17:00 - 18:00', 1200).lastInsertRowid
    );

    // Payments
    const insertPayment = db.prepare(`
      INSERT INTO payments (payment_ref, user_id, booking_id, trainer_session_id, gateway_order_id, gateway_payment_id, gateway_signature, method, method_detail, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified')
    `);
    insertPayment.run('PNX-PAY-261110-1001', customerId, b1, null, 'order_seed_001', 'pay_seed_001', 'verified_seed', 'upi', 'aarav@okhdfcbank', 650);
    insertPayment.run('PNX-PAY-261106-1002', customerId, b2, null, 'order_seed_002', 'pay_seed_002', 'verified_seed', 'credit_card', 'VISA •••• 4242', 1400);
    insertPayment.run('PNX-PAY-261117-1003', customerId, b3, null, 'order_seed_003', 'pay_seed_003', 'verified_seed', 'upi', 'aarav@okhdfcbank', 650);
    insertPayment.run('PNX-PAY-261118-1004', customer2Id, b4, null, 'order_seed_004', 'pay_seed_004', 'verified_seed', 'debit_card', 'RUPAY •••• 8819', 550);
    insertPayment.run('PNX-PAY-261109-1005', customerId, null, ts1, 'order_seed_005', 'pay_seed_005', 'verified_seed', 'upi', 'aarav@okhdfcbank', 1200);
    insertPayment.run('PNX-PAY-261118-1006', customerId, null, ts2, 'order_seed_006', 'pay_seed_006', 'verified_seed', 'credit_card', 'VISA •••• 4242', 1200);

    // Reviews
    db.prepare(`
      INSERT INTO reviews (user_id, facility_id, booking_id, rating, comment, moderation_status)
      VALUES (?, ?, ?, 5, 'Spotless emerald synthetic flooring, zero glare on high clears, and smooth check-in at reception.', 'approved')
    `).run(customerId, facilityIds[0], b1);

    db.prepare(`
      INSERT INTO reviews (user_id, facility_id, booking_id, rating, comment, moderation_status)
      VALUES (?, ?, ?, 5, 'True pace on the astro pitch and reliable bowling machine calibration.', 'approved')
    `).run(customerId, facilityIds[1], b2);

    db.prepare(`
      INSERT INTO reviews (user_id, trainer_user_id, trainer_session_id, rating, comment, moderation_status)
      VALUES (?, ?, ?, 5, 'Rohan broke down my split-step timing in 20 minutes—immediate improvement in net recovery.', 'approved')
    `).run(customerId, trainer1Id, ts1);

    // Notifications
    const insertNotif = db.prepare(`INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?)`);
    insertNotif.run(customerId, 'booking_confirmed', 'Booking Confirmed · Indiranagar Smash Pavilion', `Your badminton slot on ${upcoming1} (19:00 - 20:00) is confirmed. Ref: PNX-BK-261117-G7H8I9.`, 0);
    insertNotif.run(customerId, 'session_reminder', 'Upcoming Coaching Session', `Session with Coach Rohan Kulkarni scheduled for ${upcoming2} at 17:00 - 18:00.`, 0);
    insertNotif.run(trainer1Id, 'new_session', 'New Coaching Session Scheduled', `Aarav Mehta booked a Badminton coaching session for ${upcoming2} (17:00 - 18:00).`, 0);
    insertNotif.run(adminId, 'trainer_pending', 'Trainer Verification Pending', 'Kabir Malhotra submitted Football coaching credentials awaiting admin review.', 0);

    // Reported issue for admin moderation demo
    db.prepare(`
      INSERT INTO reported_issues (reporter_id, target_type, target_id, subject, description, status)
      VALUES (?, 'facility', ?, 'Locker #14 latch sticky', 'Locker 14 in the men changing room needed extra force to unlock after evening slot.', 'open')
    `).run(customerId, facilityIds[0]);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

initSchema();
seedDatabaseIfEmpty();
