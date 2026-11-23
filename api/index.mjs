// src/server/vercel.ts
import express2 from "express";

// src/server/app.ts
import express from "express";

// src/server/routes.ts
import crypto3 from "node:crypto";
import { Router } from "express";
import bcrypt2 from "bcryptjs";
import { z } from "zod";

// src/server/db.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import initSqlJs from "sql.js";
function resolveDatabasePath(env = process.env) {
  if (env.SQLITE_DB_PATH) {
    return env.SQLITE_DB_PATH;
  }
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "arena360.db");
  }
  return path.resolve(process.cwd(), "data", "arena360.db");
}
async function createSqlJsDatabase() {
  const wasmPath = path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");
  let wasmBinary;
  try {
    if (fs.existsSync(wasmPath)) {
      const buf = fs.readFileSync(wasmPath);
      wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
  } catch {
  }
  const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : void 0);
  const rawDb = new SQL.Database();
  rawDb.exec("PRAGMA foreign_keys = ON;");
  const norm = (params) => params.map((p) => p === void 0 ? null : p);
  return {
    exec(sql) {
      rawDb.exec(sql);
    },
    prepare(sql) {
      return {
        get(...params) {
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length > 0) stmt.bind(norm(params));
            return stmt.step() ? stmt.getAsObject() : void 0;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = rawDb.prepare(sql);
          const rows = [];
          try {
            if (params.length > 0) stmt.bind(norm(params));
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params) {
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length > 0) stmt.bind(norm(params));
            stmt.step();
          } finally {
            stmt.free();
          }
          const lastRes = rawDb.exec("SELECT last_insert_rowid() AS id");
          const lastInsertRowid = Number(lastRes[0]?.values[0]?.[0] ?? 0);
          const changes = rawDb.getRowsModified();
          return { lastInsertRowid, changes };
        }
      };
    }
  };
}
async function createDatabase() {
  if (process.env.USE_SQLJS !== "1") {
    try {
      const sqliteMod = await import("node:sqlite");
      const dbPath = resolveDatabasePath();
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const nativeDb = new sqliteMod.DatabaseSync(dbPath);
      try {
        nativeDb.exec("PRAGMA journal_mode = WAL;");
      } catch {
      }
      nativeDb.exec("PRAGMA foreign_keys = ON;");
      return nativeDb;
    } catch (err) {
      console.warn("[db] node:sqlite unavailable, using sql.js WASM fallback:", err.message);
    }
  }
  return createSqlJsDatabase();
}
var db = await createDatabase();
function initSchema() {
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
function futureDate(daysAhead) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}
function pastDate(daysAgo) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function seedDatabaseIfEmpty() {
  const existingUsers = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
  if (existingUsers.cnt > 0) return;
  const demoPassword = process.env.SEED_DEMO_PASSWORD || "Arena360@2026";
  const pwHash = bcrypt.hashSync(demoPassword, 10);
  db.exec("BEGIN IMMEDIATE;");
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (uid, name, email, phone, password_hash, role, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const customerId = Number(
      insertUser.run(
        "demo-customer-01",
        "Aarav Mehta",
        "customer@arena360.in",
        "9876543210",
        pwHash,
        "customer",
        null
      ).lastInsertRowid
    );
    const customer2Id = Number(
      insertUser.run(
        "demo-customer-02",
        "Priya Nair",
        "priya.nair@arena360.in",
        "9876543211",
        pwHash,
        "customer",
        null
      ).lastInsertRowid
    );
    const trainer1Id = Number(
      insertUser.run(
        "demo-trainer-01",
        "Rohan Kulkarni",
        "trainer@arena360.in",
        "9876543220",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainer2Id = Number(
      insertUser.run(
        "demo-trainer-02",
        "Ananya Deshmukh",
        "ananya.coach@arena360.in",
        "9876543221",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainer3Id = Number(
      insertUser.run(
        "demo-trainer-03",
        "Vikramaditya Rao",
        "vikram.swim@arena360.in",
        "9876543222",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainer4Id = Number(
      insertUser.run(
        "demo-trainer-04",
        "Meera Subramanian",
        "meera.coach@arena360.in",
        "9876543224",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainer5Id = Number(
      insertUser.run(
        "demo-trainer-05",
        "Arjun Gowda",
        "arjun.coach@arena360.in",
        "9876543225",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainer6Id = Number(
      insertUser.run(
        "demo-trainer-06",
        "Nandini Hegde",
        "nandini.coach@arena360.in",
        "9876543226",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const trainerPendingId = Number(
      insertUser.run(
        "demo-trainer-07",
        "Kabir Malhotra",
        "kabir.pending@arena360.in",
        "9876543223",
        pwHash,
        "trainer",
        null
      ).lastInsertRowid
    );
    const owner1Id = Number(
      insertUser.run(
        "demo-owner-01",
        "Siddharth Verma",
        "owner@arena360.in",
        "9876543230",
        pwHash,
        "facility_owner",
        null
      ).lastInsertRowid
    );
    const adminId = Number(
      insertUser.run(
        "demo-admin-01",
        "Karthik Subramanian",
        "admin@arena360.in",
        "9876543240",
        pwHash,
        "admin",
        null
      ).lastInsertRowid
    );
    db.prepare(`
      INSERT INTO customer_profiles (user_id, preferred_sports, city, address, emergency_contact)
      VALUES (?, ?, ?, ?, ?)
    `).run(customerId, JSON.stringify(["Badminton", "Cricket", "Swimming"]), "Bengaluru", "12th Main, Indiranagar, Bengaluru", "9876500001");
    db.prepare(`
      INSERT INTO customer_profiles (user_id, preferred_sports, city, address, emergency_contact)
      VALUES (?, ?, ?, ?, ?)
    `).run(customer2Id, JSON.stringify(["Tennis", "Gym/Fitness", "Table Tennis"]), "Bengaluru", "15th Cross, Malleshwaram, Bengaluru", "9876500002");
    db.prepare(`
      INSERT INTO facility_owners (user_id, business_name, gst_number, city, verified)
      VALUES (?, ?, ?, ?, 1)
    `).run(owner1Id, "Apex Athletic Venues Pvt Ltd", "29AABCU9603R1ZM", "Bengaluru");
    const sportsSeed = [
      ["cricket", "Cricket", "Floodlit turf pitches, bowling-machine lanes, and leather-ball practice nets in Bengaluru.", "Trophy", "/src/assets/images/sport_cricket_turf_1794838292791.jpg"],
      ["football", "Football", "FIFA-grade 5v5, 7v7, and full-size astro turf arenas with night floodlights.", "Goal", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["badminton", "Badminton", "Indoor BWF-approved cushioned synthetic courts with anti-glare arena lighting.", "Wind", "/src/assets/images/sport_badminton_court_1794838289668.jpg"],
      ["tennis", "Tennis", "All-weather acrylic hard courts and European red clay courts for singles and doubles.", "CircleDot", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["basketball", "Basketball", "Indoor maple hardwood courts and FIBA-regulated full courts.", "Dribbble", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["swimming", "Swimming", "Temperature-controlled indoor 25m and 50m Olympic lap pools with certified lifeguards.", "Waves", "/src/assets/images/sport_swimming_pool_1794838290203.jpg"],
      ["gym-fitness", "Gym/Fitness", "Indoor strength conditioning bays, Olympic lifting platforms, and turf sled lanes.", "Dumbbell", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["skating", "Skating", "Banked speed-skating tracks and smooth indoor artistic roller rinks.", "Zap", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["table-tennis", "Table Tennis", "Indoor ITTF-approved Stag & Butterfly championship tables with anti-slip vinyl flooring.", "CircleDot", "/src/assets/images/sport_badminton_court_1794838289668.jpg"],
      ["squash", "Squash", "Air-conditioned glass-back indoor squash courts with sprung maple floors.", "Shield", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["volleyball", "Volleyball", "Indoor wooden and cushioned sand-free competition volleyball courts.", "Trophy", "/src/assets/images/hero_sports_arena_1794838288174.jpg"],
      ["pickleball", "Pickleball", "Indoor & floodlit cushioned acrylic pickleball courts with pro competition nets.", "Wind", "/src/assets/images/sport_badminton_court_1794838289668.jpg"]
    ];
    const sportIds = {};
    const insertSport = db.prepare(`
      INSERT INTO sports (slug, name, description, icon_name, image_url) VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of sportsSeed) {
      const id = Number(insertSport.run(s[0], s[1], s[2], s[3], s[4]).lastInsertRowid);
      sportIds[s[1]] = id;
    }
    const facilitiesSeed = [
      {
        name: "Indiranagar Smash Pavilion",
        slug: "indiranagar-smash-pavilion",
        description: "Six BWF-certified indoor emerald synthetic badminton courts and ITTF table tennis bays with 11-meter clear ceiling height and non-glare LEDs.",
        address: "100 Feet Road, Indiranagar",
        city: "Bengaluru",
        price: 650,
        amenities: ["BWF Synthetic Mats", "Indoor AC Arena", "Showers & Lockers", "Drinking Water", "Parking"],
        sports: ["Badminton", "Table Tennis"],
        image: "/src/assets/images/sport_badminton_court_1794838289668.jpg",
        rating: 4.9,
        reviews: 2
      },
      {
        name: "Koramangala Turf & Cricket Bowl",
        slug: "koramangala-turf-cricket-bowl",
        description: "Enclosed 7v7 astro-turf pitch and 4 floodlit cricket practice nets equipped with dual-wheel bowling machines and video speed tracking.",
        address: "80 Feet Road, Koramangala 4th Block",
        city: "Bengaluru",
        price: 1400,
        amenities: ["LED Floodlights", "Bowling Machine", "Dugout Seating", "First Aid", "Free Parking"],
        sports: ["Cricket", "Football"],
        image: "/src/assets/images/sport_cricket_turf_1794838292791.jpg",
        rating: 4.8,
        reviews: 1
      },
      {
        name: "Whitefield Olympic Aquatics Center",
        slug: "whitefield-olympic-aquatics",
        description: "Heated 50-meter 8-lane indoor competition pool with ozone filtration, starting blocks, electronic pace clocks, and dedicated recovery deck.",
        address: "ITPL Main Road, Whitefield",
        city: "Bengaluru",
        price: 550,
        amenities: ["Heated 27\xB0C Water", "Ozone Filtration", "Certified Lifeguards", "Heated Showers", "Locker Rooms"],
        sports: ["Swimming"],
        image: "/src/assets/images/sport_swimming_pool_1794838290203.jpg",
        rating: 4.9,
        reviews: 1
      },
      {
        name: "Jayanagar Multi-Sport Arena",
        slug: "jayanagar-multi-sport-arena",
        description: "Bengaluru architectural multi-sport complex featuring indoor FIBA maple basketball & volleyball courts, tennis hard courts, and conditioning bay.",
        address: "11th Main, 4th Block, Jayanagar",
        city: "Bengaluru",
        price: 1100,
        amenities: ["Maple Hardwood", "Air-Conditioned", "Cafe & Hydration", "Physio Bay", "Parking"],
        sports: ["Basketball", "Tennis", "Gym/Fitness", "Volleyball"],
        image: "/src/assets/images/hero_sports_arena_1794838288174.jpg",
        rating: 4.7,
        reviews: 0
      },
      {
        name: "HSR Lakeview Racquet Club",
        slug: "hsr-lakeview-racquet-club",
        description: "ITF-spec cushioned acrylic tennis & pickleball courts alongside four air-cooled indoor badminton courts in HSR Layout.",
        address: "27th Main, HSR Layout Sector 1",
        city: "Bengaluru",
        price: 850,
        amenities: ["ITF Cushion Acrylic", "Ball Machine", "Pro Shop", "Lounge", "Parking"],
        sports: ["Tennis", "Badminton", "Pickleball"],
        image: "/src/assets/images/sport_badminton_court_1794838289668.jpg",
        rating: 4.8,
        reviews: 0
      },
      {
        name: "Sadashivanagar Velocity Rink & Gym",
        slug: "sadashivanagar-velocity-rink",
        description: "200m banked speed-skating circuit paired with an indoor Olympic strength & functional fitness training floor in Sadashivanagar.",
        address: "Sankey Tank Road, Sadashivanagar",
        city: "Bengaluru",
        price: 700,
        amenities: ["Banked Track", "Helmet Rental", "Olympic Racks", "Changing Rooms", "Parking"],
        sports: ["Skating", "Gym/Fitness"],
        image: "/src/assets/images/hero_sports_arena_1794838288174.jpg",
        rating: 4.6,
        reviews: 0
      },
      {
        name: "MG Road Indoor Sports Pavilion",
        slug: "mg-road-indoor-pavilion",
        description: "Climate-controlled central Bengaluru indoor sports hub with glass-back squash courts, ITTF table tennis, indoor pickleball, and volleyball.",
        address: "Church Street Annex, MG Road",
        city: "Bengaluru",
        price: 750,
        amenities: ["Glass-Back Squash", "ITTF Tables", "Climate Controlled", "Locker Suites", "Metro Access"],
        sports: ["Table Tennis", "Squash", "Pickleball", "Volleyball", "Badminton"],
        image: "/src/assets/images/hero_sports_arena_1794838288174.jpg",
        rating: 4.8,
        reviews: 0
      }
    ];
    const standardSlots = [
      ["06:00 - 07:00", "06:00", "07:00"],
      ["07:00 - 08:00", "07:00", "08:00"],
      ["08:00 - 09:00", "08:00", "09:00"],
      ["09:00 - 10:00", "09:00", "10:00"],
      ["16:00 - 17:00", "16:00", "17:00"],
      ["17:00 - 18:00", "17:00", "18:00"],
      ["18:00 - 19:00", "18:00", "19:00"],
      ["19:00 - 20:00", "19:00", "20:00"],
      ["20:00 - 21:00", "20:00", "21:00"],
      ["21:00 - 22:00", "21:00", "22:00"]
    ];
    const facilityIds = [];
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
    const insertTrainerProfile = db.prepare(`
      INSERT INTO trainer_profiles (user_id, bio, experience_years, certifications, session_price, city, approval_status, rating_avg, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTrainerRow = db.prepare(`INSERT INTO trainers (profile_id, user_id, featured) VALUES (?, ?, ?)`);
    const insertTrainerSport = db.prepare(`INSERT INTO trainer_sports (trainer_id, sport_id) VALUES (?, ?)`);
    const tp1 = Number(
      insertTrainerProfile.run(
        trainer1Id,
        "Former national-level racquet specialist in Bengaluru coaching footwork precision, deceptive net play, and indoor racquet match strategy.",
        9,
        JSON.stringify(["BWF Level 2 Coach", "ITTF Level 1 Table Tennis", "WSF Squash Level 1"]),
        1200,
        "Bengaluru",
        "approved",
        4.9,
        1
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp1, trainer1Id, 1);
    for (const sp of ["Badminton", "Tennis", "Table Tennis", "Squash"]) {
      insertTrainerSport.run(tp1, sportIds[sp]);
    }
    const tp2 = Number(
      insertTrainerProfile.run(
        trainer2Id,
        "High-performance strength, conditioning, and field-sport biomechanics coach working with Bengaluru club and state-level athletes.",
        7,
        JSON.stringify(["NSCA-CSCS", "ECB Level 2 Cricket", "AIFF C License"]),
        1500,
        "Bengaluru",
        "approved",
        4.8,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp2, trainer2Id, 1);
    for (const sp of ["Cricket", "Football", "Gym/Fitness", "Volleyball"]) {
      insertTrainerSport.run(tp2, sportIds[sp]);
    }
    const tp3 = Number(
      insertTrainerProfile.run(
        trainer3Id,
        "FINA-certified swim technique, skating agility, and court conditioning coach in Bengaluru specializing in endurance and athletic power.",
        11,
        JSON.stringify(["ASCA Level 3 Swim", "FINA Lifesaving Instructor", "RSFI Skating Coach"]),
        1100,
        "Bengaluru",
        "approved",
        4.9,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp3, trainer3Id, 1);
    for (const sp of ["Swimming", "Skating", "Gym/Fitness", "Basketball"]) {
      insertTrainerSport.run(tp3, sportIds[sp]);
    }
    const tp4 = Number(
      insertTrainerProfile.run(
        trainer4Id,
        "Indoor racquet sports specialist coaching singles/doubles tactics across Badminton, Table Tennis, Squash, and Pickleball in Bengaluru.",
        8,
        JSON.stringify(["NIS Certified Badminton", "ITTF Level 2 Coach", "IPTPA Pickleball Pro"]),
        1300,
        "Bengaluru",
        "approved",
        4.9,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp4, trainer4Id, 1);
    for (const sp of ["Badminton", "Table Tennis", "Squash", "Pickleball"]) {
      insertTrainerSport.run(tp4, sportIds[sp]);
    }
    const tp5 = Number(
      insertTrainerProfile.run(
        trainer5Id,
        "Bengaluru team-sports and tactical coach mentoring competitive Cricket, Football, Basketball, and indoor Volleyball squads.",
        6,
        JSON.stringify(["BCCI Level 1 Cricket", "FIBA Level 1 Coach", "VFI Volleyball Coach"]),
        1050,
        "Bengaluru",
        "approved",
        4.7,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp5, trainer5Id, 1);
    for (const sp of ["Cricket", "Football", "Basketball", "Volleyball"]) {
      insertTrainerSport.run(tp5, sportIds[sp]);
    }
    const tp6 = Number(
      insertTrainerProfile.run(
        trainer6Id,
        "Certified Bengaluru court & aquatics coach delivering biomechanical stroke correction in Tennis, Pickleball, Swimming, and Speed Skating.",
        10,
        JSON.stringify(["AITA Level 4 Tennis", "ASCA Level 2 Swim", "IPTPA Certified Coach"]),
        1250,
        "Bengaluru",
        "approved",
        4.8,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tp6, trainer6Id, 1);
    for (const sp of ["Tennis", "Swimming", "Skating", "Pickleball"]) {
      insertTrainerSport.run(tp6, sportIds[sp]);
    }
    const tpPending = Number(
      insertTrainerProfile.run(
        trainerPendingId,
        "Youth football tactical & agility coach in Bengaluru focused on ball mastery and positional awareness.",
        4,
        JSON.stringify(["AIFF D License"]),
        900,
        "Bengaluru",
        "pending",
        0,
        0
      ).lastInsertRowid
    );
    insertTrainerRow.run(tpPending, trainerPendingId, 0);
    insertTrainerSport.run(tpPending, sportIds["Football"]);
    const insertTrainerAvail = db.prepare(`
      INSERT INTO trainer_availability (trainer_user_id, avail_date, slot_label, start_time, end_time, is_booked)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tSlots = [
      ["07:00 - 08:00", "07:00", "08:00"],
      ["08:00 - 09:00", "08:00", "09:00"],
      ["17:00 - 18:00", "17:00", "18:00"],
      ["18:00 - 19:00", "18:00", "19:00"]
    ];
    for (const tUid of [trainer1Id, trainer2Id, trainer3Id, trainer4Id, trainer5Id, trainer6Id]) {
      for (let d = 0; d <= 5; d++) {
        const dt = futureDate(d);
        for (const sl of tSlots) {
          insertTrainerAvail.run(tUid, dt, sl[0], sl[1], sl[2], 0);
        }
      }
    }
    const past1 = pastDate(3);
    const past2 = pastDate(7);
    const upcoming1 = futureDate(1);
    const upcoming2 = futureDate(2);
    const b1 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Court 2 preferred')
      `).run("PNX-BK-261110-A1B2C3", customerId, facilityIds[0], sportIds["Badminton"], past1, "18:00 - 19:00", 650).lastInsertRowid
    );
    const b2 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Net lane 1 with bowling machine')
      `).run("PNX-BK-261106-D4E5F6", customerId, facilityIds[1], sportIds["Cricket"], past2, "19:00 - 20:00", 1400).lastInsertRowid
    );
    const b3 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Evening doubles match')
      `).run("PNX-BK-261117-G7H8I9", customerId, facilityIds[0], sportIds["Badminton"], upcoming1, "19:00 - 20:00", 650).lastInsertRowid
    );
    const b4 = Number(
      db.prepare(`
        INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Morning lap session')
      `).run("PNX-BK-261118-J1K2L3", customer2Id, facilityIds[2], sportIds["Swimming"], upcoming2, "07:00 - 08:00", 550).lastInsertRowid
    );
    const ts1 = Number(
      db.prepare(`
        INSERT INTO trainer_sessions (session_ref, customer_id, trainer_user_id, sport_id, session_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'Footwork & backhand smash clinic')
      `).run("PNX-TR-261109-M4N5O6", customerId, trainer1Id, sportIds["Badminton"], past1, "08:00 - 09:00", 1200).lastInsertRowid
    );
    const ts2 = Number(
      db.prepare(`
        INSERT INTO trainer_sessions (session_ref, customer_id, trainer_user_id, sport_id, session_date, slot_label, total_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Match tactics review')
      `).run("PNX-TR-261118-P7Q8R9", customerId, trainer1Id, sportIds["Badminton"], upcoming2, "17:00 - 18:00", 1200).lastInsertRowid
    );
    const insertPayment = db.prepare(`
      INSERT INTO payments (payment_ref, user_id, booking_id, trainer_session_id, gateway_order_id, gateway_payment_id, gateway_signature, method, method_detail, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified')
    `);
    insertPayment.run("PNX-PAY-261110-1001", customerId, b1, null, "order_seed_001", "pay_seed_001", "verified_seed", "upi", "aarav@okhdfcbank", 650);
    insertPayment.run("PNX-PAY-261106-1002", customerId, b2, null, "order_seed_002", "pay_seed_002", "verified_seed", "credit_card", "VISA \u2022\u2022\u2022\u2022 4242", 1400);
    insertPayment.run("PNX-PAY-261117-1003", customerId, b3, null, "order_seed_003", "pay_seed_003", "verified_seed", "upi", "aarav@okhdfcbank", 650);
    insertPayment.run("PNX-PAY-261118-1004", customer2Id, b4, null, "order_seed_004", "pay_seed_004", "verified_seed", "debit_card", "RUPAY \u2022\u2022\u2022\u2022 8819", 550);
    insertPayment.run("PNX-PAY-261109-1005", customerId, null, ts1, "order_seed_005", "pay_seed_005", "verified_seed", "upi", "aarav@okhdfcbank", 1200);
    insertPayment.run("PNX-PAY-261118-1006", customerId, null, ts2, "order_seed_006", "pay_seed_006", "verified_seed", "credit_card", "VISA \u2022\u2022\u2022\u2022 4242", 1200);
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
      VALUES (?, ?, ?, 5, 'Rohan broke down my split-step timing in 20 minutes\u2014immediate improvement in net recovery.', 'approved')
    `).run(customerId, trainer1Id, ts1);
    const insertNotif = db.prepare(`INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?)`);
    insertNotif.run(customerId, "booking_confirmed", "Booking Confirmed \xB7 Indiranagar Smash Pavilion", `Your badminton slot on ${upcoming1} (19:00 - 20:00) is confirmed. Ref: PNX-BK-261117-G7H8I9.`, 0);
    insertNotif.run(customerId, "session_reminder", "Upcoming Coaching Session", `Session with Coach Rohan Kulkarni scheduled for ${upcoming2} at 17:00 - 18:00.`, 0);
    insertNotif.run(trainer1Id, "new_session", "New Coaching Session Scheduled", `Aarav Mehta booked a Badminton coaching session for ${upcoming2} (17:00 - 18:00).`, 0);
    insertNotif.run(adminId, "trainer_pending", "Trainer Verification Pending", "Kabir Malhotra submitted Football coaching credentials awaiting admin review.", 0);
    db.prepare(`
      INSERT INTO reported_issues (reporter_id, target_type, target_id, subject, description, status)
      VALUES (?, 'facility', ?, 'Locker #14 latch sticky', 'Locker 14 in the men changing room needed extra force to unlock after evening slot.', 'open')
    `).run(customerId, facilityIds[0]);
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
initSchema();
seedDatabaseIfEmpty();

// src/server/auth.ts
import crypto from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";
import jwt from "jsonwebtoken";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
function loadFirebaseProjectId() {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  try {
    const configPath = path2.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs2.existsSync(configPath)) {
      const parsed = JSON.parse(fs2.readFileSync(configPath, "utf8"));
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
  }
  return "gen-lang-client-0946597153";
}
var firebaseProjectId = loadFirebaseProjectId();
if (!getApps().length) {
  initializeApp({
    projectId: firebaseProjectId
  });
}
var adminAuth = getAuth();
var JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET !== "replace-with-strong-random-32-byte-secret" ? process.env.JWT_SECRET : crypto.createHash("sha256").update(`arena360-${firebaseProjectId}-session`).digest("hex");
function signSessionToken(user) {
  return jwt.sign({ id: user.id, uid: user.uid, role: user.role }, JWT_SECRET, {
    expiresIn: "7d"
  });
}
function verifySessionToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}
async function verifyFirebaseToken(idToken) {
  return adminAuth.verifyIdToken(idToken);
}
function getUserById(id) {
  return db.prepare("SELECT id, uid, name, email, phone, role, avatar_url, is_active FROM users WHERE id = ?").get(id);
}
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please sign in to continue." });
  }
  const token = authHeader.slice(7).trim();
  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
  }
  const user = getUserById(decoded.id);
  if (!user || !user.is_active) {
    return res.status(403).json({ error: "Account is inactive or unavailable." });
  }
  req.authUser = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: `Forbidden: This operation requires one of [${roles.join(", ")}] permissions.`
      });
    }
    next();
  };
}

// src/server/domain.ts
import crypto2 from "node:crypto";
var ALLOWED_TRANSITIONS = {
  pending: ["payment_pending", "cancelled", "expired", "failed"],
  payment_pending: ["confirmed", "failed", "cancelled", "expired"],
  confirmed: ["completed", "cancelled", "rescheduled"],
  rescheduled: ["completed", "cancelled", "rescheduled"],
  cancelled: [],
  completed: [],
  failed: ["payment_pending", "cancelled"],
  expired: ["payment_pending"]
};
function isValidBookingTransition(from, to) {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function isActiveSlotHold(status, reservationExpiresAt, now = /* @__PURE__ */ new Date()) {
  if (status === "confirmed" || status === "rescheduled" || status === "pending") {
    return true;
  }
  if (status === "payment_pending") {
    if (!reservationExpiresAt) return true;
    return new Date(reservationExpiresAt).getTime() > now.getTime();
  }
  return false;
}
function calculateCancellationRefund(totalAmount, bookingDate, slotStartTime, now = /* @__PURE__ */ new Date()) {
  const safeAmount = Math.max(0, Math.round(totalAmount));
  const [year, month, day] = bookingDate.split("-").map(Number);
  const [hours, minutes] = slotStartTime.split(":").map(Number);
  const slotDateTime = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  const hoursUntilStart = (slotDateTime.getTime() - now.getTime()) / (1e3 * 60 * 60);
  if (hoursUntilStart >= 24) {
    return {
      refundPercentage: 100,
      refundAmount: safeAmount,
      policyTier: "full_refund",
      explanation: "Cancelled 24+ hours before slot start: 100% refund eligible."
    };
  }
  if (hoursUntilStart >= 6) {
    return {
      refundPercentage: 50,
      refundAmount: Math.round(safeAmount * 0.5),
      policyTier: "partial_refund",
      explanation: "Cancelled between 6 and 24 hours before slot start: 50% refund eligible."
    };
  }
  return {
    refundPercentage: 0,
    refundAmount: 0,
    policyTier: "no_refund",
    explanation: "Cancelled within 6 hours of slot start: non-refundable under cancellation policy."
  };
}
function generateBookingReference(prefix = "BK") {
  const datePart = (/* @__PURE__ */ new Date()).toISOString().slice(2, 10).replace(/-/g, "");
  const rand = crypto2.randomBytes(3).toString("hex").toUpperCase();
  return `PNX-${prefix}-${datePart}-${rand}`;
}
function generateRazorpayOrderSignature(orderId, paymentId, secret) {
  return crypto2.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}
function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = generateRazorpayOrderSignature(orderId, paymentId, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto2.timingSafeEqual(a, b);
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
function validatePhone(phone) {
  const digits = phone.replace(/[\s\-+]/g, "");
  return /^\d{10,13}$/.test(digits);
}
function validateUpiId(upiId) {
  return /^[a-zA-Z0-9._\-]{2,64}@[a-zA-Z0-9]{2,32}$/.test(upiId.trim());
}
function validateCardLast4(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return { valid: false, last4: "" };
  }
  return { valid: true, last4: digits.slice(-4) };
}
function getReservationExpiryIso(minutesFromNow = 10, now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + minutesFromNow * 60 * 1e3).toISOString();
}
function canUserReviewStatus(status, bookingDate, now = /* @__PURE__ */ new Date()) {
  if (status === "completed") return true;
  if (status === "confirmed" || status === "rescheduled") {
    const todayStr = now.toISOString().slice(0, 10);
    return bookingDate <= todayStr;
  }
  return false;
}

// src/server/routes.ts
var apiRouter = Router();
var RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET || "arena360_test_razorpay_hmac_secret";
var RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_arena360_demo";
function cleanExpiredReservations() {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(`
    UPDATE bookings
    SET status = 'expired', updated_at = datetime('now')
    WHERE status = 'payment_pending'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= ?
  `).run(nowIso);
  const expiredSessions = db.prepare(`
    SELECT id, availability_id FROM trainer_sessions
    WHERE status = 'payment_pending'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= ?
  `).all(nowIso);
  if (expiredSessions.length > 0) {
    for (const sess of expiredSessions) {
      db.prepare(`UPDATE trainer_sessions SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(sess.id);
      if (sess.availability_id) {
        db.prepare(`UPDATE trainer_availability SET is_booked = 0 WHERE id = ?`).run(sess.availability_id);
      }
    }
  }
}
function getUserPayload(userId) {
  const user = db.prepare("SELECT id, uid, name, email, phone, role, avatar_url, is_active, created_at FROM users WHERE id = ?").get(userId);
  if (!user) return null;
  const profile = db.prepare("SELECT preferred_sports, city, address, emergency_contact, notification_email, notification_sms FROM customer_profiles WHERE user_id = ?").get(userId);
  return {
    ...user,
    preferred_sports: profile ? JSON.parse(String(profile.preferred_sports || "[]")) : [],
    city: profile?.city || "",
    address: profile?.address || "",
    emergency_contact: profile?.emergency_contact || "",
    notification_email: Boolean(profile?.notification_email ?? 1),
    notification_sms: Boolean(profile?.notification_sms ?? 0)
  };
}
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "arena360-api", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().email("Valid email is required").max(200),
  phone: z.string().trim().min(10, "Enter a valid 10+ digit phone number").max(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.string().optional().default("customer"),
  city: z.string().trim().max(80).optional().default("Bengaluru")
});
apiRouter.post("/auth/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid registration data" });
  }
  const { name, email, phone, password, role: requestedRole, city } = parsed.data;
  if (requestedRole && requestedRole !== "customer") {
    return res.status(403).json({
      error: "Public registration is limited to Customer accounts. Trainer and Facility Owner accounts can only be created by an Administrator."
    });
  }
  const role = "customer";
  const normEmail = email.toLowerCase();
  const normPhone = phone.replace(/[\s\-]/g, "");
  if (!validateEmail(normEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!validatePhone(normPhone)) {
    return res.status(400).json({ error: "Please enter a valid 10 to 13 digit phone number." });
  }
  const existing = db.prepare("SELECT id, email, phone FROM users WHERE LOWER(email) = ? OR phone = ?").get(normEmail, normPhone);
  if (existing) {
    return res.status(409).json({
      error: existing.email.toLowerCase() === normEmail ? "An account with this email address already exists." : "An account with this phone number already exists."
    });
  }
  const passwordHash = bcrypt2.hashSync(password, 10);
  const uid = `pnx_${crypto3.randomUUID()}`;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const userId = Number(
      db.prepare(
        `INSERT INTO users (uid, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uid, name, normEmail, normPhone, passwordHash, role).lastInsertRowid
    );
    db.prepare(`INSERT INTO customer_profiles (user_id, city) VALUES (?, ?)`).run(userId, city || "Bengaluru");
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'welcome', ?, ?)`
    ).run(
      userId,
      "Welcome to ARENA360 Bengaluru",
      "Your customer account is active. Browse Bengaluru sports facilities, check live slots, and book certified coaches."
    );
    db.exec("COMMIT;");
    const token = signSessionToken({ id: userId, uid, role });
    res.status(201).json({ token, user: getUserPayload(userId) });
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});
var loginSchema = z.object({
  identifier: z.string().trim().min(3, "Email or mobile number is required"),
  password: z.string().min(1, "Password is required")
});
apiRouter.post("/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid credentials" });
  }
  const { identifier, password } = parsed.data;
  const norm = identifier.trim().toLowerCase();
  const phoneNorm = identifier.replace(/[\s\-]/g, "");
  const user = db.prepare(
    `SELECT id, uid, name, email, phone, password_hash, role, is_active
       FROM users WHERE LOWER(email) = ? OR phone = ?`
  ).get(norm, phoneNorm);
  if (!user || !user.password_hash || !bcrypt2.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email/mobile or password." });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: "Your account has been suspended. Contact administrator." });
  }
  const token = signSessionToken({ id: user.id, uid: user.uid, role: user.role });
  res.json({ token, user: getUserPayload(user.id) });
});
apiRouter.post("/auth/demo-login", (req, res) => {
  const roleSchema = z.object({
    role: z.enum(["customer", "trainer", "facility_owner", "admin"])
  });
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid role selected." });
  }
  const emailMap = {
    customer: "customer@arena360.in",
    trainer: "trainer@arena360.in",
    facility_owner: "owner@arena360.in",
    admin: "admin@arena360.in"
  };
  const user = db.prepare("SELECT id, uid, role, is_active FROM users WHERE email = ?").get(emailMap[parsed.data.role]);
  if (!user || !user.is_active) {
    return res.status(404).json({ error: "Demo account unavailable." });
  }
  const token = signSessionToken({ id: user.id, uid: user.uid, role: user.role });
  res.json({ token, user: getUserPayload(user.id) });
});
apiRouter.post("/auth/firebase", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: "Firebase ID token is required." });
  }
  try {
    const decoded = await verifyFirebaseToken(idToken);
    const email = (decoded.email || "").toLowerCase();
    const name = decoded.name || email.split("@")[0] || "ARENA360 Athlete";
    if (!email) {
      return res.status(400).json({ error: "Verified email missing on Google account." });
    }
    let user = db.prepare("SELECT id, uid, role, is_active FROM users WHERE uid = ? OR LOWER(email) = ?").get(decoded.uid, email);
    if (!user) {
      const assignedRole = email === "skarthikslv5@gmail.com" ? "admin" : "customer";
      const userId = Number(
        db.prepare(
          `INSERT INTO users (uid, name, email, role, avatar_url) VALUES (?, ?, ?, ?, ?)`
        ).run(decoded.uid, name, email, assignedRole, decoded.picture || null).lastInsertRowid
      );
      db.prepare(`INSERT OR IGNORE INTO customer_profiles (user_id) VALUES (?)`).run(userId);
      user = { id: userId, uid: decoded.uid, role: assignedRole, is_active: 1 };
    }
    if (!user.is_active) {
      return res.status(403).json({ error: "Account is suspended." });
    }
    const token = signSessionToken({ id: user.id, uid: user.uid, role: user.role });
    res.json({ token, user: getUserPayload(user.id) });
  } catch (err) {
    console.error("Firebase token exchange failed:", err);
    res.status(401).json({ error: "Invalid or expired Google sign-in token." });
  }
});
apiRouter.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "Enter a valid registered email address." });
  }
  const user = db.prepare("SELECT id, email FROM users WHERE LOWER(email) = ?").get(email.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "No account found with that email address." });
  }
  const resetToken = crypto3.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = getReservationExpiryIso(30);
  db.prepare(`INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)`).run(
    user.id,
    resetToken,
    expiresAt
  );
  res.json({
    message: "Password reset verification code generated.",
    // Returned for test/demo verification when SMTP is not configured
    verificationCode: process.env.SMTP_HOST ? void 0 : resetToken,
    expiresAt
  });
});
apiRouter.post("/auth/reset-password", (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    code: z.string().trim().min(4),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(128)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid reset request" });
  }
  const { email, code, newPassword } = parsed.data;
  const user = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }
  const record = db.prepare(
    `SELECT id, expires_at, used FROM password_resets
       WHERE user_id = ? AND reset_token = ? ORDER BY id DESC LIMIT 1`
  ).get(user.id, code.toUpperCase());
  if (!record || record.used || new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "Invalid or expired reset code." });
  }
  const hash = bcrypt2.hashSync(newPassword, 10);
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, user.id);
    db.prepare(`UPDATE password_resets SET used = 1 WHERE id = ?`).run(record.id);
    db.exec("COMMIT;");
    res.json({ message: "Password updated successfully. You can now sign in." });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Unable to reset password." });
  }
});
apiRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: getUserPayload(req.authUser.id) });
});
apiRouter.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});
apiRouter.get("/profile", requireAuth, (req, res) => {
  res.json({ user: getUserPayload(req.authUser.id) });
});
apiRouter.put("/profile", requireAuth, (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(20).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
    address: z.string().trim().max(300).optional().default(""),
    emergency_contact: z.string().trim().max(40).optional().default(""),
    preferred_sports: z.array(z.string()).max(15).optional().default([]),
    avatar_url: z.string().max(15e5).nullable().optional(),
    notification_email: z.boolean().optional().default(true),
    notification_sms: z.boolean().optional().default(false)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile fields" });
  }
  const data = parsed.data;
  const userId = req.authUser.id;
  const normEmail = data.email.toLowerCase();
  const normPhone = data.phone ? data.phone.replace(/[\s\-]/g, "") : null;
  const conflict = db.prepare(`SELECT id FROM users WHERE (LOWER(email) = ? OR (phone IS NOT NULL AND phone = ?)) AND id != ?`).get(normEmail, normPhone || "__none__", userId);
  if (conflict) {
    return res.status(409).json({ error: "Email or phone number is already used by another account." });
  }
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(
      `UPDATE users SET name = ?, email = ?, phone = ?, avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?`
    ).run(data.name, normEmail, normPhone, data.avatar_url ?? null, userId);
    db.prepare(
      `INSERT INTO customer_profiles (user_id, preferred_sports, city, address, emergency_contact, notification_email, notification_sms, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         preferred_sports = excluded.preferred_sports,
         city = excluded.city,
         address = excluded.address,
         emergency_contact = excluded.emergency_contact,
         notification_email = excluded.notification_email,
         notification_sms = excluded.notification_sms,
         updated_at = datetime('now')`
    ).run(
      userId,
      JSON.stringify(data.preferred_sports),
      data.city,
      data.address,
      data.emergency_contact,
      data.notification_email ? 1 : 0,
      data.notification_sms ? 1 : 0
    );
    db.exec("COMMIT;");
    res.json({ user: getUserPayload(userId), message: "Profile updated successfully." });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Failed to update profile." });
  }
});
apiRouter.get("/sports", (_req, res) => {
  const sports = db.prepare(
    `SELECT s.*,
        (SELECT COUNT(*) FROM facility_sports fs
         JOIN facilities f ON f.id = fs.facility_id
         WHERE fs.sport_id = s.id AND f.is_active = 1) as facility_count,
        (SELECT COUNT(*) FROM trainer_sports ts
         JOIN trainer_profiles tp ON tp.id = ts.trainer_id
         WHERE ts.sport_id = s.id AND tp.approval_status = 'approved') as trainer_count
       FROM sports s WHERE s.is_active = 1 ORDER BY s.id ASC`
  ).all();
  res.json({ sports });
});
apiRouter.get("/facilities", (req, res) => {
  cleanExpiredReservations();
  const { q, sport, city, area, minPrice, maxPrice, date, availableOnly } = req.query;
  const rows = db.prepare(
    `SELECT f.*, u.name as owner_name,
        (SELECT image_url FROM facility_images fi WHERE fi.facility_id = f.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as image_url
       FROM facilities f
       JOIN users u ON u.id = f.owner_id
       WHERE f.is_active = 1
       ORDER BY f.rating_avg DESC, f.id ASC`
  ).all();
  const targetDate = date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const enriched = rows.map((f) => {
    const fSports = db.prepare(
      `SELECT s.id, s.name, s.slug FROM sports s
           JOIN facility_sports fs ON fs.sport_id = s.id
           WHERE fs.facility_id = ? AND s.is_active = 1`
    ).all(Number(f.id));
    const totalSlots = db.prepare(`SELECT COUNT(*) as c FROM facility_time_slots WHERE facility_id = ? AND is_blocked = 0`).get(Number(f.id)).c;
    const activeBookings = db.prepare(
      `SELECT status, reservation_expires_at FROM bookings
           WHERE facility_id = ? AND booking_date = ? AND status IN ('pending','payment_pending','confirmed','rescheduled')`
    ).all(Number(f.id), targetDate);
    const bookedCount = activeBookings.filter((b) => isActiveSlotHold(b.status, b.reservation_expires_at)).length;
    const availableSlots = Math.max(0, totalSlots - bookedCount);
    return {
      ...f,
      id: Number(f.id),
      name: String(f.name || ""),
      city: String(f.city || ""),
      address: String(f.address || ""),
      description: String(f.description || ""),
      price_per_hour: Number(f.price_per_hour || 0),
      amenities: JSON.parse(String(f.amenities || "[]")),
      sports: fSports,
      available_slots_count: availableSlots,
      total_slots_count: totalSlots
    };
  }).filter((f) => {
    if (q) {
      const ql = q.toLowerCase();
      const matchText = f.name.toLowerCase().includes(ql) || f.city.toLowerCase().includes(ql) || f.address.toLowerCase().includes(ql) || f.description.toLowerCase().includes(ql) || f.sports.some((s) => s.name.toLowerCase().includes(ql));
      if (!matchText) return false;
    }
    if (sport && sport !== "all") {
      if (!f.sports.some((s) => s.slug === sport || s.name.toLowerCase() === sport.toLowerCase())) {
        return false;
      }
    }
    if (city && city !== "all") {
      if (f.city.toLowerCase() !== city.toLowerCase()) return false;
    }
    if (area && area !== "all") {
      const al = area.toLowerCase();
      if (!f.address.toLowerCase().includes(al) && !f.name.toLowerCase().includes(al)) return false;
    }
    if (minPrice && f.price_per_hour < Number(minPrice)) return false;
    if (maxPrice && f.price_per_hour > Number(maxPrice)) return false;
    if (availableOnly === "true" && f.available_slots_count <= 0) return false;
    return true;
  });
  res.json({ facilities: enriched, date: targetDate });
});
apiRouter.get("/facilities/:id", (req, res) => {
  cleanExpiredReservations();
  const idParam = req.params.id;
  const facility = db.prepare(
    `SELECT f.*, u.name as owner_name, fo.business_name
       FROM facilities f
       JOIN users u ON u.id = f.owner_id
       LEFT JOIN facility_owners fo ON fo.user_id = f.owner_id
       WHERE f.id = ? OR f.slug = ?`
  ).get(Number(idParam) || -1, idParam);
  if (!facility) {
    return res.status(404).json({ error: "Facility not found." });
  }
  const fId = Number(facility.id);
  const images = db.prepare(`SELECT id, image_url, is_primary FROM facility_images WHERE facility_id = ? ORDER BY is_primary DESC, sort_order ASC`).all(fId);
  const sports = db.prepare(`SELECT s.id, s.name, s.slug FROM sports s JOIN facility_sports fs ON fs.sport_id = s.id WHERE fs.facility_id = ?`).all(fId);
  const hours = db.prepare(`SELECT day_of_week, open_time, close_time, is_closed FROM facility_operating_hours WHERE facility_id = ? ORDER BY day_of_week ASC`).all(fId);
  const reviews = db.prepare(
    `SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.facility_id = ? AND r.moderation_status = 'approved'
       ORDER BY r.created_at DESC`
  ).all(fId);
  res.json({
    facility: {
      ...facility,
      amenities: JSON.parse(String(facility.amenities || "[]")),
      images,
      sports,
      operating_hours: hours,
      reviews
    }
  });
});
apiRouter.get("/facilities/:id/availability", (req, res) => {
  cleanExpiredReservations();
  const fId = Number(req.params.id);
  const date = String(req.query.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  const facility = db.prepare(`SELECT id, price_per_hour, is_active FROM facilities WHERE id = ?`).get(fId);
  if (!facility || !facility.is_active) {
    return res.status(404).json({ error: "Facility not found or inactive." });
  }
  const slots = db.prepare(`SELECT id, slot_label, start_time, end_time, price_override, is_blocked FROM facility_time_slots WHERE facility_id = ? ORDER BY start_time ASC`).all(fId);
  const bookings = db.prepare(
    `SELECT slot_label, status, reservation_expires_at FROM bookings
       WHERE facility_id = ? AND booking_date = ? AND status IN ('pending', 'payment_pending', 'confirmed', 'rescheduled')`
  ).all(fId, date);
  const activeMap = /* @__PURE__ */ new Map();
  for (const b of bookings) {
    if (isActiveSlotHold(b.status, b.reservation_expires_at)) {
      activeMap.set(b.slot_label, b.status);
    }
  }
  const slotMatrix = slots.map((s) => {
    const bookingStatus = activeMap.get(s.slot_label);
    let state = "available";
    if (s.is_blocked) state = "blocked";
    else if (bookingStatus === "payment_pending") state = "held";
    else if (bookingStatus) state = "booked";
    return {
      ...s,
      price: s.price_override ?? facility.price_per_hour,
      state,
      is_available: state === "available"
    };
  });
  res.json({ facility_id: fId, date, slots: slotMatrix });
});
apiRouter.get("/trainers", (req, res) => {
  cleanExpiredReservations();
  const { q, sport, minExp, minRating, maxPrice, availableOnly } = req.query;
  const rows = db.prepare(
    `SELECT tp.*, u.name, u.email, u.avatar_url, u.is_active
       FROM trainer_profiles tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.approval_status = 'approved' AND u.is_active = 1
       ORDER BY tp.rating_avg DESC, tp.experience_years DESC`
  ).all();
  const enriched = rows.map((t) => {
    const sports = db.prepare(
      `SELECT s.id, s.name, s.slug FROM sports s
           JOIN trainer_sports ts ON ts.sport_id = s.id
           WHERE ts.trainer_id = ?`
    ).all(Number(t.id));
    const availCount = db.prepare(
      `SELECT COUNT(*) as c FROM trainer_availability
             WHERE trainer_user_id = ? AND is_booked = 0 AND avail_date >= date('now')`
    ).get(Number(t.user_id)).c;
    return {
      ...t,
      id: Number(t.id),
      user_id: Number(t.user_id),
      name: String(t.name || ""),
      city: String(t.city || ""),
      bio: String(t.bio || ""),
      experience_years: Number(t.experience_years || 0),
      rating_avg: Number(t.rating_avg || 0),
      session_price: Number(t.session_price || 0),
      certifications: JSON.parse(String(t.certifications || "[]")),
      sports,
      available_slots_count: availCount
    };
  }).filter((t) => {
    if (q) {
      const ql = q.toLowerCase();
      const hit = t.name.toLowerCase().includes(ql) || t.city.toLowerCase().includes(ql) || t.bio.toLowerCase().includes(ql) || t.sports.some((s) => s.name.toLowerCase().includes(ql));
      if (!hit) return false;
    }
    if (sport && sport !== "all") {
      if (!t.sports.some((s) => s.slug === sport || s.name.toLowerCase() === sport.toLowerCase())) return false;
    }
    if (minExp && t.experience_years < Number(minExp)) return false;
    if (minRating && t.rating_avg < Number(minRating)) return false;
    if (maxPrice && t.session_price > Number(maxPrice)) return false;
    if (availableOnly === "true" && t.available_slots_count <= 0) return false;
    return true;
  });
  res.json({ trainers: enriched });
});
apiRouter.get("/trainers/:id", (req, res) => {
  cleanExpiredReservations();
  const userId = Number(req.params.id);
  const trainer = db.prepare(
    `SELECT tp.*, u.name, u.avatar_url
       FROM trainer_profiles tp
       JOIN users u ON u.id = tp.user_id
       WHERE (tp.user_id = ? OR tp.id = ?) AND tp.approval_status = 'approved' AND u.is_active = 1`
  ).get(userId, userId);
  if (!trainer) {
    return res.status(404).json({ error: "Trainer not found." });
  }
  const sports = db.prepare(`SELECT s.id, s.name, s.slug FROM sports s JOIN trainer_sports ts ON ts.sport_id = s.id WHERE ts.trainer_id = ?`).all(Number(trainer.id));
  const availability = db.prepare(
    `SELECT id, avail_date, slot_label, start_time, end_time, is_booked
       FROM trainer_availability
       WHERE trainer_user_id = ? AND avail_date >= date('now')
       ORDER BY avail_date ASC, start_time ASC`
  ).all(Number(trainer.user_id));
  const reviews = db.prepare(
    `SELECT r.*, u.name as reviewer_name
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.trainer_user_id = ? AND r.moderation_status = 'approved'
       ORDER BY r.created_at DESC`
  ).all(Number(trainer.user_id));
  res.json({
    trainer: {
      ...trainer,
      certifications: JSON.parse(String(trainer.certifications || "[]")),
      sports,
      availability,
      reviews
    }
  });
});
apiRouter.post("/bookings", requireAuth, (req, res) => {
  cleanExpiredReservations();
  const schema = z.object({
    facility_id: z.number().int().positive(),
    sport_id: z.number().int().positive(),
    booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
    slot_label: z.string().trim().min(3),
    notes: z.string().max(400).optional().default("")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid booking request" });
  }
  const { facility_id, sport_id, booking_date, slot_label, notes } = parsed.data;
  const customerId = req.authUser.id;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const facility = db.prepare(`SELECT id, name, price_per_hour, is_active FROM facilities WHERE id = ?`).get(facility_id);
    if (!facility || !facility.is_active) {
      db.exec("ROLLBACK;");
      return res.status(404).json({ error: "Selected facility is not available." });
    }
    const slot = db.prepare(`SELECT id, price_override, is_blocked FROM facility_time_slots WHERE facility_id = ? AND slot_label = ?`).get(facility_id, slot_label);
    if (!slot) {
      db.exec("ROLLBACK;");
      return res.status(400).json({ error: "Selected time slot does not exist for this facility." });
    }
    if (slot.is_blocked) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: "This time slot has been blocked by the facility owner." });
    }
    const activeConflict = db.prepare(
      `SELECT id, status, reservation_expires_at FROM bookings
         WHERE facility_id = ? AND booking_date = ? AND slot_label = ?
           AND status IN ('pending', 'payment_pending', 'confirmed', 'rescheduled')`
    ).get(facility_id, booking_date, slot_label);
    if (activeConflict && isActiveSlotHold(activeConflict.status, activeConflict.reservation_expires_at)) {
      db.exec("ROLLBACK;");
      return res.status(409).json({
        error: "Slot unavailable: another athlete already reserved or booked this time slot."
      });
    }
    const amount = slot.price_override ?? facility.price_per_hour;
    const bookingRef = generateBookingReference("BK");
    const expiresAt = getReservationExpiryIso(10);
    const bookingId = Number(
      db.prepare(
        `INSERT INTO bookings (booking_ref, customer_id, facility_id, sport_id, booking_date, slot_label, total_amount, status, reservation_expires_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'payment_pending', ?, ?)`
      ).run(bookingRef, customerId, facility_id, sport_id, booking_date, slot_label, amount, expiresAt, notes).lastInsertRowid
    );
    db.exec("COMMIT;");
    const created = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    res.status(201).json({ booking: created, expiresAt });
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Create booking failed:", err);
    res.status(409).json({ error: "Unable to reserve slot. It may have just been booked." });
  }
});
apiRouter.post("/sessions", requireAuth, (req, res) => {
  cleanExpiredReservations();
  const schema = z.object({
    trainer_user_id: z.number().int().positive(),
    availability_id: z.number().int().positive(),
    sport_id: z.number().int().positive(),
    notes: z.string().max(400).optional().default("")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid session request" });
  }
  const { trainer_user_id, availability_id, sport_id, notes } = parsed.data;
  const customerId = req.authUser.id;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const trainer = db.prepare(`SELECT session_price, approval_status FROM trainer_profiles WHERE user_id = ?`).get(trainer_user_id);
    if (!trainer || trainer.approval_status !== "approved") {
      db.exec("ROLLBACK;");
      return res.status(404).json({ error: "Approved trainer profile not found." });
    }
    const avail = db.prepare(`SELECT * FROM trainer_availability WHERE id = ? AND trainer_user_id = ?`).get(availability_id, trainer_user_id);
    if (!avail || avail.is_booked) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: "Selected trainer slot is no longer available." });
    }
    db.prepare(`UPDATE trainer_availability SET is_booked = 1 WHERE id = ?`).run(avail.id);
    const sessionRef = generateBookingReference("TR");
    const expiresAt = getReservationExpiryIso(10);
    const sessionId = Number(
      db.prepare(
        `INSERT INTO trainer_sessions (session_ref, customer_id, trainer_user_id, sport_id, availability_id, session_date, slot_label, total_amount, status, reservation_expires_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'payment_pending', ?, ?)`
      ).run(
        sessionRef,
        customerId,
        trainer_user_id,
        sport_id,
        avail.id,
        avail.avail_date,
        avail.slot_label,
        trainer.session_price,
        expiresAt,
        notes
      ).lastInsertRowid
    );
    db.exec("COMMIT;");
    const session = db.prepare("SELECT * FROM trainer_sessions WHERE id = ?").get(sessionId);
    res.status(201).json({ session, expiresAt });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Failed to create trainer session reservation." });
  }
});
apiRouter.post("/payments/create-order", requireAuth, (req, res) => {
  cleanExpiredReservations();
  const schema = z.object({
    type: z.enum(["facility", "trainer"]),
    reference_id: z.number().int().positive(),
    method: z.enum(["upi", "credit_card", "debit_card"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payment order parameters." });
  }
  const { type, reference_id, method } = parsed.data;
  const userId = req.authUser.id;
  const record = type === "facility" ? db.prepare("SELECT * FROM bookings WHERE id = ? AND customer_id = ?").get(reference_id, userId) : db.prepare("SELECT * FROM trainer_sessions WHERE id = ? AND customer_id = ?").get(reference_id, userId);
  if (!record) {
    return res.status(404).json({ error: "Reservation record not found." });
  }
  if (record.status === "confirmed" || record.status === "completed") {
    return res.status(409).json({ error: "This booking has already been paid and confirmed." });
  }
  if (record.status === "cancelled") {
    return res.status(409).json({ error: "Cannot pay for a cancelled booking." });
  }
  if (record.status === "expired") {
    return res.status(409).json({ error: "Reservation hold expired. Please select your slot again." });
  }
  if (record.status === "failed") {
    const newExpiry = getReservationExpiryIso(10);
    if (type === "facility") {
      db.prepare(`UPDATE bookings SET status = 'payment_pending', reservation_expires_at = ? WHERE id = ?`).run(
        newExpiry,
        reference_id
      );
    } else {
      db.prepare(`UPDATE trainer_sessions SET status = 'payment_pending', reservation_expires_at = ? WHERE id = ?`).run(
        newExpiry,
        reference_id
      );
    }
  }
  const orderId = `order_pnx_${crypto3.randomBytes(6).toString("hex")}`;
  const paymentRef = generateBookingReference("PAY");
  const amount = Number(record.total_amount);
  const paymentId = Number(
    db.prepare(
      `INSERT INTO payments (payment_ref, user_id, booking_id, trainer_session_id, gateway_order_id, method, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'initiated')`
    ).run(
      paymentRef,
      userId,
      type === "facility" ? reference_id : null,
      type === "trainer" ? reference_id : null,
      orderId,
      method,
      amount
    ).lastInsertRowid
  );
  const simulatedGatewayPaymentId = `pay_pnx_${crypto3.randomBytes(6).toString("hex")}`;
  const expectedSignature = generateRazorpayOrderSignature(orderId, simulatedGatewayPaymentId, RAZORPAY_SECRET);
  res.json({
    payment_id: paymentId,
    payment_ref: paymentRef,
    razorpay_key_id: RAZORPAY_KEY_ID,
    test_mode: !process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET === "rzp_test_secret_placeholder",
    order_id: orderId,
    amount,
    currency: "INR",
    simulated_payment_id: simulatedGatewayPaymentId,
    simulated_signature: expectedSignature
  });
});
apiRouter.post("/payments/verify", requireAuth, (req, res) => {
  const schema = z.object({
    payment_id: z.number().int().positive(),
    gateway_order_id: z.string().min(4),
    gateway_payment_id: z.string().optional().default(""),
    gateway_signature: z.string().optional().default(""),
    method: z.enum(["upi", "credit_card", "debit_card"]),
    upi_id: z.string().optional(),
    card_number: z.string().optional(),
    outcome: z.enum(["success", "failed", "cancelled"]).default("success")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payment payload" });
  }
  const { payment_id, gateway_order_id, gateway_payment_id, gateway_signature, method, upi_id, card_number, outcome } = parsed.data;
  const userId = req.authUser.id;
  const payment = db.prepare(`SELECT * FROM payments WHERE id = ? AND user_id = ?`).get(payment_id, userId);
  if (!payment) {
    return res.status(404).json({ error: "Payment record not found." });
  }
  if (payment.status === "verified") {
    return res.status(409).json({ error: "Duplicate payment request: this transaction is already verified." });
  }
  let methodDetail = "";
  if (outcome === "success") {
    if (method === "upi") {
      if (!upi_id || !validateUpiId(upi_id)) {
        return res.status(400).json({ error: "Please enter a valid UPI ID (e.g. name@okhdfcbank)." });
      }
      methodDetail = upi_id.trim();
    } else {
      const cardCheck = validateCardLast4(card_number || "");
      if (!cardCheck.valid) {
        return res.status(400).json({ error: "Enter a valid 13-19 digit card number." });
      }
      methodDetail = `${method === "credit_card" ? "Credit" : "Debit"} Card \u2022\u2022\u2022\u2022 ${cardCheck.last4}`;
    }
  }
  db.exec("BEGIN IMMEDIATE;");
  try {
    if (outcome !== "success") {
      const failStatus = outcome === "cancelled" ? "cancelled" : "failed";
      const reason = outcome === "cancelled" ? "Payment cancelled by user before completion." : "Bank authorization declined.";
      db.prepare(
        `UPDATE payments SET status = ?, method_detail = ?, failure_reason = ? WHERE id = ?`
      ).run(failStatus, methodDetail, reason, payment_id);
      if (payment.booking_id) {
        db.prepare(`UPDATE bookings SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
          payment.booking_id
        );
      }
      if (payment.trainer_session_id) {
        const ts = db.prepare("SELECT availability_id FROM trainer_sessions WHERE id = ?").get(payment.trainer_session_id);
        db.prepare(`UPDATE trainer_sessions SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
          payment.trainer_session_id
        );
        if (ts?.availability_id) {
          db.prepare(`UPDATE trainer_availability SET is_booked = 0 WHERE id = ?`).run(ts.availability_id);
        }
      }
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'payment_failed', ?, ?)`
      ).run(userId, "Payment Unsuccessful", `${reason} You can retry payment from My Bookings.`);
      db.exec("COMMIT;");
      return res.status(402).json({
        verified: false,
        status: failStatus,
        error: reason,
        payment: db.prepare("SELECT * FROM payments WHERE id = ?").get(payment_id)
      });
    }
    const isSignatureValid = verifyRazorpaySignature(
      gateway_order_id,
      gateway_payment_id,
      gateway_signature,
      RAZORPAY_SECRET
    );
    if (!isSignatureValid || payment.gateway_order_id !== gateway_order_id) {
      db.exec("ROLLBACK;");
      return res.status(400).json({ error: "Payment signature verification failed on server." });
    }
    db.prepare(
      `UPDATE payments
       SET status = 'verified', gateway_payment_id = ?, gateway_signature = ?, method = ?, method_detail = ?
       WHERE id = ?`
    ).run(gateway_payment_id, gateway_signature, method, methodDetail, payment_id);
    if (payment.booking_id) {
      const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(payment.booking_id);
      if (!isValidBookingTransition(booking.status, "confirmed") && booking.status !== "payment_pending") {
        db.exec("ROLLBACK;");
        return res.status(409).json({ error: `Cannot confirm booking from status "${booking.status}".` });
      }
      db.prepare(
        `UPDATE bookings SET status = 'confirmed', reservation_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(booking.id);
      const fac = db.prepare("SELECT name, owner_id FROM facilities WHERE id = ?").get(booking.facility_id);
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'booking_confirmed', ?, ?)`
      ).run(
        userId,
        `Booking Confirmed \xB7 ${fac.name}`,
        `Slot ${booking.booking_date} (${booking.slot_label}) confirmed. Reference: ${booking.booking_ref}.`
      );
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'owner_new_booking', ?, ?)`
      ).run(
        fac.owner_id,
        `New Facility Booking \xB7 ${fac.name}`,
        `Slot ${booking.booking_date} (${booking.slot_label}) booked (${booking.booking_ref}).`
      );
    }
    if (payment.trainer_session_id) {
      const ts = db.prepare(`SELECT * FROM trainer_sessions WHERE id = ?`).get(payment.trainer_session_id);
      db.prepare(
        `UPDATE trainer_sessions SET status = 'confirmed', reservation_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(ts.id);
      const trainerUser = db.prepare("SELECT name FROM users WHERE id = ?").get(ts.trainer_user_id);
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'session_confirmed', ?, ?)`
      ).run(
        userId,
        `Trainer Session Confirmed \xB7 ${trainerUser.name}`,
        `Coaching on ${ts.session_date} (${ts.slot_label}) confirmed. Reference: ${ts.session_ref}.`
      );
      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'trainer_new_session', ?, ?)`
      ).run(
        ts.trainer_user_id,
        "New Paid Coaching Session",
        `Customer confirmed session on ${ts.session_date} (${ts.slot_label}). Ref: ${ts.session_ref}.`
      );
    }
    db.exec("COMMIT;");
    const updatedPayment = db.prepare("SELECT * FROM payments WHERE id = ?").get(payment_id);
    const updatedBooking = payment.booking_id ? db.prepare("SELECT * FROM bookings WHERE id = ?").get(payment.booking_id) : null;
    const updatedSession = payment.trainer_session_id ? db.prepare("SELECT * FROM trainer_sessions WHERE id = ?").get(payment.trainer_session_id) : null;
    res.json({
      verified: true,
      payment: updatedPayment,
      booking: updatedBooking,
      session: updatedSession
    });
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Payment verify error:", err);
    res.status(500).json({ error: "Payment verification encountered a server error." });
  }
});
apiRouter.get("/bookings/my", requireAuth, (req, res) => {
  cleanExpiredReservations();
  const userId = req.authUser.id;
  const { status, type, fromDate, toDate } = req.query;
  const facilityBookings = db.prepare(
    `SELECT b.*, 'facility' as booking_type, f.name as facility_name, f.city as facility_city, f.address as facility_address,
        s.name as sport_name,
        (SELECT p.payment_ref FROM payments p WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) as payment_ref,
        (SELECT p.method FROM payments p WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) as payment_method,
        (SELECT p.status FROM payments p WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) as payment_status,
        (SELECT c.refund_amount FROM cancellations c WHERE c.booking_id = b.id ORDER BY c.id DESC LIMIT 1) as refund_amount,
        (SELECT c.refund_percentage FROM cancellations c WHERE c.booking_id = b.id ORDER BY c.id DESC LIMIT 1) as refund_percentage,
        (SELECT COUNT(*) FROM reviews r WHERE r.booking_id = b.id AND r.user_id = b.customer_id) as has_reviewed
       FROM bookings b
       JOIN facilities f ON f.id = b.facility_id
       JOIN sports s ON s.id = b.sport_id
       WHERE b.customer_id = ?
       ORDER BY b.booking_date DESC, b.id DESC`
  ).all(userId);
  const trainerBookings = db.prepare(
    `SELECT ts.*, ts.session_ref as booking_ref, ts.session_date as booking_date, 'trainer' as booking_type,
        u.name as trainer_name, tp.city as facility_city, s.name as sport_name,
        (SELECT p.payment_ref FROM payments p WHERE p.trainer_session_id = ts.id ORDER BY p.id DESC LIMIT 1) as payment_ref,
        (SELECT p.method FROM payments p WHERE p.trainer_session_id = ts.id ORDER BY p.id DESC LIMIT 1) as payment_method,
        (SELECT p.status FROM payments p WHERE p.trainer_session_id = ts.id ORDER BY p.id DESC LIMIT 1) as payment_status,
        (SELECT COUNT(*) FROM reviews r WHERE r.trainer_session_id = ts.id AND r.user_id = ts.customer_id) as has_reviewed
       FROM trainer_sessions ts
       JOIN users u ON u.id = ts.trainer_user_id
       JOIN trainer_profiles tp ON tp.user_id = ts.trainer_user_id
       JOIN sports s ON s.id = ts.sport_id
       WHERE ts.customer_id = ?
       ORDER BY ts.session_date DESC, ts.id DESC`
  ).all(userId);
  let combined = [...facilityBookings, ...trainerBookings].sort(
    (a, b) => String(b.booking_date).localeCompare(String(a.booking_date))
  );
  if (type && type !== "all") {
    combined = combined.filter((item) => item.booking_type === type);
  }
  if (status && status !== "all") {
    combined = combined.filter((item) => item.status === status);
  }
  if (fromDate) {
    combined = combined.filter((item) => String(item.booking_date) >= fromDate);
  }
  if (toDate) {
    combined = combined.filter((item) => String(item.booking_date) <= toDate);
  }
  res.json({ bookings: combined });
});
apiRouter.post("/bookings/:id/cancel", requireAuth, (req, res) => {
  const bookingId = Number(req.params.id);
  const { reason } = req.body;
  const userId = req.authUser.id;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ? AND customer_id = ?`).get(bookingId, userId);
    if (!booking) {
      db.exec("ROLLBACK;");
      return res.status(404).json({ error: "Booking not found." });
    }
    if (!isValidBookingTransition(booking.status, "cancelled")) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: `Booking in "${booking.status}" status cannot be cancelled.` });
    }
    const slotStart = booking.slot_label.split("-")[0].trim();
    const policy = calculateCancellationRefund(booking.total_amount, booking.booking_date, slotStart);
    const wasPaid = booking.status === "confirmed" || booking.status === "rescheduled";
    db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(booking.id);
    const refundAmount = wasPaid ? policy.refundAmount : 0;
    const refundPct = wasPaid ? policy.refundPercentage : 0;
    const refundStatus = wasPaid && refundAmount > 0 ? "processed" : "not_applicable";
    db.prepare(
      `INSERT INTO cancellations (booking_id, cancelled_by, reason, refund_percentage, refund_amount, refund_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(booking.id, userId, reason || "Customer requested cancellation", refundPct, refundAmount, refundStatus);
    if (wasPaid && refundAmount > 0) {
      db.prepare(`UPDATE payments SET status = 'refunded' WHERE booking_id = ? AND status = 'verified'`).run(booking.id);
    }
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'booking_cancelled', ?, ?)`
    ).run(
      userId,
      `Booking Cancelled \xB7 ${booking.booking_ref}`,
      wasPaid ? `${policy.explanation} Refund of \u20B9${refundAmount} processed.` : "Unpaid reservation released."
    );
    db.exec("COMMIT;");
    res.json({
      message: "Booking cancelled.",
      refund_amount: refundAmount,
      refund_percentage: refundPct,
      explanation: policy.explanation
    });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Failed to cancel booking." });
  }
});
apiRouter.post("/bookings/:id/reschedule", requireAuth, (req, res) => {
  cleanExpiredReservations();
  const bookingId = Number(req.params.id);
  const schema = z.object({
    booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot_label: z.string().trim().min(3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Select a valid new date and time slot." });
  }
  const { booking_date, slot_label } = parsed.data;
  const userId = req.authUser.id;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ? AND customer_id = ?`).get(bookingId, userId);
    if (!booking) {
      db.exec("ROLLBACK;");
      return res.status(404).json({ error: "Booking not found." });
    }
    if (!isValidBookingTransition(booking.status, "rescheduled")) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: "Only confirmed bookings can be rescheduled." });
    }
    const slotExists = db.prepare(`SELECT id, is_blocked FROM facility_time_slots WHERE facility_id = ? AND slot_label = ?`).get(booking.facility_id, slot_label);
    if (!slotExists || slotExists.is_blocked) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: "Target time slot is unavailable or blocked." });
    }
    const conflict = db.prepare(
      `SELECT id, status, reservation_expires_at FROM bookings
         WHERE facility_id = ? AND booking_date = ? AND slot_label = ? AND id != ?
           AND status IN ('pending', 'payment_pending', 'confirmed', 'rescheduled')`
    ).get(booking.facility_id, booking_date, slot_label, booking.id);
    if (conflict && isActiveSlotHold(conflict.status, conflict.reservation_expires_at)) {
      db.exec("ROLLBACK;");
      return res.status(409).json({ error: "Target slot is already booked. Choose another time." });
    }
    db.prepare(
      `UPDATE bookings SET booking_date = ?, slot_label = ?, status = 'rescheduled', updated_at = datetime('now') WHERE id = ?`
    ).run(booking_date, slot_label, booking.id);
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'booking_rescheduled', ?, ?)`
    ).run(
      userId,
      `Booking Rescheduled \xB7 ${booking.booking_ref}`,
      `Moved from ${booking.booking_date} (${booking.slot_label}) to ${booking_date} (${slot_label}).`
    );
    db.exec("COMMIT;");
    res.json({
      message: "Booking rescheduled successfully.",
      booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id)
    });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(409).json({ error: "Unable to reschedule to that slot." });
  }
});
apiRouter.get("/payments/my", requireAuth, (req, res) => {
  const payments = db.prepare(
    `SELECT p.*,
        b.booking_ref, f.name as facility_name,
        ts.session_ref, tu.name as trainer_name
       FROM payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN facilities f ON f.id = b.facility_id
       LEFT JOIN trainer_sessions ts ON ts.id = p.trainer_session_id
       LEFT JOIN users tu ON tu.id = ts.trainer_user_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
  ).all(req.authUser.id);
  res.json({ payments });
});
apiRouter.post("/reviews", requireAuth, (req, res) => {
  const schema = z.object({
    target_type: z.enum(["facility", "trainer"]),
    booking_id: z.number().int().positive().optional(),
    trainer_session_id: z.number().int().positive().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(5, "Write at least 5 characters").max(1e3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid review" });
  }
  const { target_type, booking_id, trainer_session_id, rating, comment } = parsed.data;
  const userId = req.authUser.id;
  if (target_type === "facility") {
    if (!booking_id) return res.status(400).json({ error: "Booking ID required to review a facility." });
    const booking = db.prepare(`SELECT id, facility_id, booking_date, status FROM bookings WHERE id = ? AND customer_id = ?`).get(booking_id, userId);
    if (!booking || !canUserReviewStatus(booking.status, booking.booking_date)) {
      return res.status(403).json({
        error: "Only customers with a completed booking can submit a review for this facility."
      });
    }
    const already = db.prepare(`SELECT id FROM reviews WHERE booking_id = ? AND user_id = ?`).get(booking.id, userId);
    if (already) {
      return res.status(409).json({ error: "You have already submitted a review for this booking." });
    }
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(
        `INSERT INTO reviews (user_id, facility_id, booking_id, rating, comment) VALUES (?, ?, ?, ?, ?)`
      ).run(userId, booking.facility_id, booking.id, rating, comment);
      const stats = db.prepare(
        `SELECT AVG(rating) as avg_r, COUNT(*) as cnt FROM reviews WHERE facility_id = ? AND moderation_status = 'approved'`
      ).get(booking.facility_id);
      db.prepare(`UPDATE facilities SET rating_avg = ?, review_count = ? WHERE id = ?`).run(
        Math.round((stats.avg_r || 0) * 10) / 10,
        stats.cnt,
        booking.facility_id
      );
      db.exec("COMMIT;");
      return res.status(201).json({ message: "Review published successfully." });
    } catch {
      db.exec("ROLLBACK;");
      return res.status(500).json({ error: "Failed to submit review." });
    }
  } else {
    if (!trainer_session_id) return res.status(400).json({ error: "Session ID required to review a trainer." });
    const sess = db.prepare(`SELECT id, trainer_user_id, session_date, status FROM trainer_sessions WHERE id = ? AND customer_id = ?`).get(trainer_session_id, userId);
    if (!sess || !canUserReviewStatus(sess.status, sess.session_date)) {
      return res.status(403).json({
        error: "Only customers with a completed coaching session can review this trainer."
      });
    }
    const already = db.prepare(`SELECT id FROM reviews WHERE trainer_session_id = ? AND user_id = ?`).get(sess.id, userId);
    if (already) {
      return res.status(409).json({ error: "You have already reviewed this coaching session." });
    }
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(
        `INSERT INTO reviews (user_id, trainer_user_id, trainer_session_id, rating, comment) VALUES (?, ?, ?, ?, ?)`
      ).run(userId, sess.trainer_user_id, sess.id, rating, comment);
      const stats = db.prepare(
        `SELECT AVG(rating) as avg_r, COUNT(*) as cnt FROM reviews WHERE trainer_user_id = ? AND moderation_status = 'approved'`
      ).get(sess.trainer_user_id);
      db.prepare(`UPDATE trainer_profiles SET rating_avg = ?, review_count = ? WHERE user_id = ?`).run(
        Math.round((stats.avg_r || 0) * 10) / 10,
        stats.cnt,
        sess.trainer_user_id
      );
      db.exec("COMMIT;");
      return res.status(201).json({ message: "Trainer review published successfully." });
    } catch {
      db.exec("ROLLBACK;");
      return res.status(500).json({ error: "Failed to submit trainer review." });
    }
  }
});
apiRouter.get("/notifications", requireAuth, (req, res) => {
  const notifications = db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.authUser.id);
  res.json({ notifications });
});
apiRouter.patch("/notifications/:id/read", requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    Number(req.params.id),
    req.authUser.id
  );
  res.json({ ok: true });
});
apiRouter.post("/notifications/read-all", requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser.id);
  res.json({ ok: true });
});
apiRouter.post("/issues", requireAuth, (req, res) => {
  const schema = z.object({
    target_type: z.enum(["facility", "trainer", "booking", "payment", "other"]),
    target_id: z.number().int().optional(),
    subject: z.string().trim().min(4).max(160),
    description: z.string().trim().min(10).max(1200)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid issue report" });
  }
  const { target_type, target_id, subject, description } = parsed.data;
  const id = Number(
    db.prepare(
      `INSERT INTO reported_issues (reporter_id, target_type, target_id, subject, description) VALUES (?, ?, ?, ?, ?)`
    ).run(req.authUser.id, target_type, target_id ?? null, subject, description).lastInsertRowid
  );
  res.status(201).json({ id, message: "Issue submitted to ARENA360 support team." });
});
apiRouter.get("/trainer/overview", requireAuth, requireRole("trainer", "admin"), (req, res) => {
  const uid = req.authUser.id;
  const profile = db.prepare(
    `SELECT tp.*, u.name, u.email, u.phone, u.avatar_url
       FROM trainer_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.user_id = ?`
  ).get(uid);
  const sports = profile ? db.prepare(`SELECT s.id, s.name, s.slug FROM sports s JOIN trainer_sports ts ON ts.sport_id = s.id WHERE ts.trainer_id = ?`).all(Number(profile.id)) : [];
  const availability = db.prepare(`SELECT * FROM trainer_availability WHERE trainer_user_id = ? ORDER BY avail_date ASC, start_time ASC`).all(uid);
  const sessions = db.prepare(
    `SELECT ts.*, cu.name as customer_name, cu.email as customer_email, s.name as sport_name
       FROM trainer_sessions ts
       JOIN users cu ON cu.id = ts.customer_id
       JOIN sports s ON s.id = ts.sport_id
       WHERE ts.trainer_user_id = ?
       ORDER BY ts.session_date DESC, ts.id DESC`
  ).all(uid);
  res.json({
    profile: profile ? { ...profile, certifications: JSON.parse(String(profile.certifications || "[]")), sports } : null,
    availability,
    sessions
  });
});
apiRouter.put("/trainer/profile", requireAuth, requireRole("trainer", "admin"), (req, res) => {
  const schema = z.object({
    bio: z.string().trim().min(10).max(1e3),
    experience_years: z.number().int().min(0).max(60),
    certifications: z.array(z.string().trim().min(2)).max(12),
    session_price: z.number().int().min(100).max(5e4),
    city: z.string().trim().min(2).max(80),
    sport_ids: z.array(z.number().int().positive()).min(1, "Select at least one sport")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid trainer profile data" });
  }
  const { bio, experience_years, certifications, session_price, city, sport_ids } = parsed.data;
  const uid = req.authUser.id;
  const tp = db.prepare("SELECT id FROM trainer_profiles WHERE user_id = ?").get(uid);
  if (!tp) return res.status(404).json({ error: "Trainer profile not found." });
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(
      `UPDATE trainer_profiles SET bio = ?, experience_years = ?, certifications = ?, session_price = ?, city = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(bio, experience_years, JSON.stringify(certifications), session_price, city, tp.id);
    db.prepare(`DELETE FROM trainer_sports WHERE trainer_id = ?`).run(tp.id);
    const ins = db.prepare(`INSERT INTO trainer_sports (trainer_id, sport_id) VALUES (?, ?)`);
    for (const sid of sport_ids) ins.run(tp.id, sid);
    db.exec("COMMIT;");
    res.json({ message: "Trainer profile updated." });
  } catch {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Unable to update trainer profile." });
  }
});
apiRouter.post("/trainer/availability", requireAuth, requireRole("trainer", "admin"), (req, res) => {
  const schema = z.object({
    avail_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide valid date, start time, and end time." });
  const { avail_date, start_time, end_time } = parsed.data;
  const slot_label = `${start_time} - ${end_time}`;
  try {
    const id = Number(
      db.prepare(
        `INSERT INTO trainer_availability (trainer_user_id, avail_date, slot_label, start_time, end_time, is_booked)
           VALUES (?, ?, ?, ?, ?, 0)`
      ).run(req.authUser.id, avail_date, slot_label, start_time, end_time).lastInsertRowid
    );
    res.status(201).json({ slot: db.prepare("SELECT * FROM trainer_availability WHERE id = ?").get(id) });
  } catch {
    res.status(409).json({ error: "This availability slot already exists." });
  }
});
apiRouter.delete("/trainer/availability/:id", requireAuth, requireRole("trainer", "admin"), (req, res) => {
  const slot = db.prepare("SELECT * FROM trainer_availability WHERE id = ? AND trainer_user_id = ?").get(Number(req.params.id), req.authUser.id);
  if (!slot) return res.status(404).json({ error: "Slot not found." });
  if (slot.is_booked) return res.status(409).json({ error: "Cannot remove a slot with an active booking." });
  db.prepare("DELETE FROM trainer_availability WHERE id = ?").run(slot.id);
  res.json({ ok: true });
});
apiRouter.patch("/trainer/sessions/:id/status", requireAuth, requireRole("trainer", "admin"), (req, res) => {
  const schema = z.object({ status: z.enum(["confirmed", "completed", "cancelled"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status update." });
  const sess = db.prepare("SELECT * FROM trainer_sessions WHERE id = ? AND trainer_user_id = ?").get(Number(req.params.id), req.authUser.id);
  if (!sess) return res.status(404).json({ error: "Session not found." });
  if (!isValidBookingTransition(sess.status, parsed.data.status)) {
    return res.status(409).json({ error: `Cannot change session from "${sess.status}" to "${parsed.data.status}".` });
  }
  db.prepare(`UPDATE trainer_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    parsed.data.status,
    sess.id
  );
  if (parsed.data.status === "cancelled" && sess.availability_id) {
    db.prepare(`UPDATE trainer_availability SET is_booked = 0 WHERE id = ?`).run(sess.availability_id);
  }
  db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'session_update', ?, ?)`).run(
    sess.customer_id,
    `Session ${parsed.data.status} \xB7 ${sess.session_ref}`,
    `Your trainer updated session ${sess.session_ref} status to ${parsed.data.status}.`
  );
  res.json({ ok: true });
});
apiRouter.get("/owner/overview", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const ownerId = req.authUser.id;
  const facilities = db.prepare(
    `SELECT f.*,
        (SELECT image_url FROM facility_images fi WHERE fi.facility_id = f.id ORDER BY is_primary DESC LIMIT 1) as image_url
       FROM facilities f WHERE f.owner_id = ? ORDER BY f.id DESC`
  ).all(ownerId);
  const enrichedFacilities = facilities.map((f) => ({
    ...f,
    amenities: JSON.parse(String(f.amenities || "[]")),
    sports: db.prepare(`SELECT s.id, s.name FROM sports s JOIN facility_sports fs ON fs.sport_id = s.id WHERE fs.facility_id = ?`).all(Number(f.id)),
    slots: db.prepare(`SELECT * FROM facility_time_slots WHERE facility_id = ? ORDER BY start_time ASC`).all(Number(f.id)),
    hours: db.prepare(`SELECT * FROM facility_operating_hours WHERE facility_id = ? ORDER BY day_of_week ASC`).all(Number(f.id))
  }));
  const bookings = db.prepare(
    `SELECT b.*, f.name as facility_name, u.name as customer_name, u.email as customer_email, s.name as sport_name
       FROM bookings b
       JOIN facilities f ON f.id = b.facility_id
       JOIN users u ON u.id = b.customer_id
       JOIN sports s ON s.id = b.sport_id
       WHERE f.owner_id = ?
       ORDER BY b.booking_date DESC, b.id DESC`
  ).all(ownerId);
  const revenueTotal = bookings.filter((b) => b.status === "confirmed" || b.status === "completed" || b.status === "rescheduled").reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
  res.json({
    facilities: enrichedFacilities,
    bookings,
    stats: {
      totalFacilities: facilities.length,
      totalBookings: bookings.length,
      revenueTotal
    }
  });
});
apiRouter.post("/owner/facilities", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(1e3),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(80),
    price_per_hour: z.number().int().min(100).max(5e4),
    amenities: z.array(z.string()).default([]),
    sport_ids: z.array(z.number().int().positive()).min(1, "Select at least one sport"),
    image_url: z.string().optional().default("/src/assets/images/hero_sports_arena_1794838288174.jpg")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid facility data" });
  }
  const d = parsed.data;
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto3.randomBytes(2).toString("hex")}`;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const fId = Number(
      db.prepare(
        `INSERT INTO facilities (owner_id, name, slug, description, address, city, price_per_hour, amenities)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(req.authUser.id, d.name, slug, d.description, d.address, d.city, d.price_per_hour, JSON.stringify(d.amenities)).lastInsertRowid
    );
    db.prepare(`INSERT INTO facility_images (facility_id, image_url, is_primary) VALUES (?, ?, 1)`).run(fId, d.image_url);
    const insSport = db.prepare(`INSERT INTO facility_sports (facility_id, sport_id) VALUES (?, ?)`);
    for (const sid of d.sport_ids) insSport.run(fId, sid);
    for (let day = 0; day < 7; day++) {
      db.prepare(`INSERT INTO facility_operating_hours (facility_id, day_of_week, open_time, close_time) VALUES (?, ?, '06:00', '22:00')`).run(fId, day);
    }
    const defaultSlots = [
      ["06:00 - 07:00", "06:00", "07:00"],
      ["07:00 - 08:00", "07:00", "08:00"],
      ["17:00 - 18:00", "17:00", "18:00"],
      ["18:00 - 19:00", "18:00", "19:00"],
      ["19:00 - 20:00", "19:00", "20:00"],
      ["20:00 - 21:00", "20:00", "21:00"]
    ];
    for (const s of defaultSlots) {
      db.prepare(`INSERT INTO facility_time_slots (facility_id, slot_label, start_time, end_time) VALUES (?, ?, ?, ?)`).run(fId, s[0], s[1], s[2]);
    }
    db.exec("COMMIT;");
    res.status(201).json({ id: fId, message: "Facility added successfully." });
  } catch (err) {
    db.exec("ROLLBACK;");
    res.status(500).json({ error: "Unable to create facility." });
  }
});
apiRouter.put("/owner/facilities/:id", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const fId = Number(req.params.id);
  const existing = db.prepare("SELECT id, owner_id FROM facilities WHERE id = ?").get(fId);
  if (!existing) return res.status(404).json({ error: "Facility not found." });
  if (req.authUser.role !== "admin" && existing.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "You do not own this facility." });
  }
  const schema = z.object({
    name: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(1e3),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(80),
    price_per_hour: z.number().int().min(100).max(5e4),
    amenities: z.array(z.string()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid facility update fields." });
  const d = parsed.data;
  db.prepare(
    `UPDATE facilities SET name = ?, description = ?, address = ?, city = ?, price_per_hour = ?, amenities = COALESCE(?, amenities), updated_at = datetime('now') WHERE id = ?`
  ).run(d.name, d.description, d.address, d.city, d.price_per_hour, d.amenities ? JSON.stringify(d.amenities) : null, fId);
  res.json({ message: "Facility details updated." });
});
apiRouter.delete("/owner/facilities/:id", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const fId = Number(req.params.id);
  const existing = db.prepare("SELECT id, owner_id FROM facilities WHERE id = ?").get(fId);
  if (!existing) return res.status(404).json({ error: "Facility not found." });
  if (req.authUser.role !== "admin" && existing.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  const activeCount = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE facility_id = ? AND status IN ('confirmed', 'rescheduled') AND booking_date >= date('now')`).get(fId).c;
  if (activeCount > 0) {
    return res.status(409).json({ error: "Cannot delete a facility with upcoming confirmed bookings." });
  }
  db.prepare(`UPDATE facilities SET is_active = 0 WHERE id = ?`).run(fId);
  res.json({ message: "Facility archived." });
});
apiRouter.patch("/owner/slots/:slotId", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const slotId = Number(req.params.slotId);
  const slot = db.prepare(
    `SELECT fts.id, f.owner_id FROM facility_time_slots fts JOIN facilities f ON f.id = fts.facility_id WHERE fts.id = ?`
  ).get(slotId);
  if (!slot) return res.status(404).json({ error: "Slot not found." });
  if (req.authUser.role !== "admin" && slot.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  const { is_blocked, price_override } = req.body;
  db.prepare(`UPDATE facility_time_slots SET is_blocked = COALESCE(?, is_blocked), price_override = ? WHERE id = ?`).run(
    typeof is_blocked === "boolean" ? is_blocked ? 1 : 0 : null,
    price_override ?? null,
    slotId
  );
  res.json({ ok: true });
});
apiRouter.post("/owner/facilities/:id/slots", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const fId = Number(req.params.id);
  const fac = db.prepare("SELECT id, owner_id FROM facilities WHERE id = ?").get(fId);
  if (!fac) return res.status(404).json({ error: "Facility not found." });
  if (req.authUser.role !== "admin" && fac.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  const { start_time, end_time, price_override } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: "Start and end time required." });
  const label = `${start_time} - ${end_time}`;
  try {
    db.prepare(
      `INSERT INTO facility_time_slots (facility_id, slot_label, start_time, end_time, price_override) VALUES (?, ?, ?, ?, ?)`
    ).run(fId, label, start_time, end_time, price_override ?? null);
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: "Slot already exists for this facility." });
  }
});
apiRouter.put("/owner/facilities/:id/hours", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const fId = Number(req.params.id);
  const fac = db.prepare("SELECT id, owner_id FROM facilities WHERE id = ?").get(fId);
  if (!fac) return res.status(404).json({ error: "Facility not found." });
  if (req.authUser.role !== "admin" && fac.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  const { hours } = req.body;
  const upd = db.prepare(
    `UPDATE facility_operating_hours SET open_time = ?, close_time = ?, is_closed = ? WHERE facility_id = ? AND day_of_week = ?`
  );
  for (const h of hours || []) {
    upd.run(h.open_time, h.close_time, h.is_closed ? 1 : 0, fId, h.day_of_week);
  }
  res.json({ message: "Operating hours saved." });
});
apiRouter.patch("/owner/bookings/:id/status", requireAuth, requireRole("facility_owner", "admin"), (req, res) => {
  const bookingId = Number(req.params.id);
  const { status } = req.body;
  const booking = db.prepare(`SELECT b.*, f.owner_id FROM bookings b JOIN facilities f ON f.id = b.facility_id WHERE b.id = ?`).get(bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (req.authUser.role !== "admin" && booking.owner_id !== req.authUser.id) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  if (!isValidBookingTransition(booking.status, status)) {
    return res.status(409).json({ error: "Invalid status transition." });
  }
  db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, bookingId);
  res.json({ ok: true });
});
apiRouter.get("/admin/overview", requireAuth, requireRole("admin"), (_req, res) => {
  const users = db.prepare(`SELECT id, uid, name, email, phone, role, is_active, created_at FROM users ORDER BY id DESC`).all();
  const trainers = db.prepare(
    `SELECT tp.*, u.name, u.email, u.is_active
       FROM trainer_profiles tp JOIN users u ON u.id = tp.user_id ORDER BY tp.id DESC`
  ).all();
  const sports = db.prepare(`SELECT * FROM sports ORDER BY id ASC`).all();
  const facilities = db.prepare(
    `SELECT f.*, u.name as owner_name, u.email as owner_email
       FROM facilities f JOIN users u ON u.id = f.owner_id ORDER BY f.id DESC`
  ).all();
  const bookings = db.prepare(
    `SELECT b.*, u.name as customer_name, f.name as facility_name, s.name as sport_name
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       JOIN facilities f ON f.id = b.facility_id
       JOIN sports s ON s.id = b.sport_id
       ORDER BY b.id DESC`
  ).all();
  const payments = db.prepare(
    `SELECT p.*, u.name as user_name, u.email as user_email
       FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC`
  ).all();
  const reviews = db.prepare(
    `SELECT r.*, u.name as reviewer_name, f.name as facility_name, tu.name as trainer_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN facilities f ON f.id = r.facility_id
       LEFT JOIN users tu ON tu.id = r.trainer_user_id
       ORDER BY r.id DESC`
  ).all();
  const issues = db.prepare(
    `SELECT ri.*, u.name as reporter_name, u.email as reporter_email
       FROM reported_issues ri JOIN users u ON u.id = ri.reporter_id ORDER BY ri.id DESC`
  ).all();
  const sportBreakdown = db.prepare(
    `SELECT s.name as sport, COUNT(b.id) as bookings, COALESCE(SUM(b.total_amount), 0) as revenue
       FROM sports s
       LEFT JOIN bookings b ON b.sport_id = s.id AND b.status IN ('confirmed', 'completed', 'rescheduled')
       GROUP BY s.id ORDER BY bookings DESC`
  ).all();
  res.json({
    users,
    trainers,
    sports,
    facilities,
    bookings,
    payments,
    reviews,
    issues,
    analytics: {
      sportBreakdown,
      totalRevenue: payments.filter((p) => p.status === "verified").reduce((a, b) => a + b.amount, 0)
    }
  });
});
var adminCreateUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().email("Valid email is required").max(200),
  phone: z.string().trim().min(10, "Enter a valid 10+ digit phone number").max(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["customer", "trainer", "facility_owner"]),
  city: z.string().trim().max(80).optional().default("Bengaluru"),
  businessName: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(500).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  sessionPrice: z.number().int().min(100).max(5e4).optional(),
  certifications: z.array(z.string().trim().min(1)).optional(),
  sportIds: z.array(z.number().int().positive()).optional()
});
apiRouter.post("/admin/users", requireAuth, requireRole("admin"), (req, res) => {
  const parsed = adminCreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user payload." });
  }
  const {
    name,
    email,
    phone,
    password,
    role,
    city,
    businessName,
    bio,
    experienceYears,
    sessionPrice,
    certifications,
    sportIds
  } = parsed.data;
  const normEmail = email.toLowerCase();
  const normPhone = phone.replace(/[\s\-]/g, "");
  if (!validateEmail(normEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!validatePhone(normPhone)) {
    return res.status(400).json({ error: "Please enter a valid 10 to 13 digit phone number." });
  }
  const existing = db.prepare("SELECT id, email, phone FROM users WHERE LOWER(email) = ? OR phone = ?").get(normEmail, normPhone);
  if (existing) {
    return res.status(409).json({
      error: existing.email.toLowerCase() === normEmail ? "An account with this email address already exists." : "An account with this phone number already exists."
    });
  }
  const passwordHash = bcrypt2.hashSync(password, 10);
  const uid = `pnx_${crypto3.randomUUID()}`;
  const targetCity = city || "Bengaluru";
  db.exec("BEGIN IMMEDIATE;");
  try {
    const userId = Number(
      db.prepare(`INSERT INTO users (uid, name, email, phone, password_hash, role, avatar_url) VALUES (?, ?, ?, ?, ?, ?, NULL)`).run(uid, name, normEmail, normPhone, passwordHash, role).lastInsertRowid
    );
    db.prepare(`INSERT INTO customer_profiles (user_id, city) VALUES (?, ?)`).run(userId, targetCity);
    if (role === "facility_owner") {
      db.prepare(
        `INSERT INTO facility_owners (user_id, business_name, city, verified) VALUES (?, ?, ?, 1)`
      ).run(userId, businessName || `${name} Sports Venues`, targetCity);
    }
    if (role === "trainer") {
      const tpId = Number(
        db.prepare(
          `INSERT INTO trainer_profiles (user_id, bio, experience_years, certifications, session_price, city, approval_status)
             VALUES (?, ?, ?, ?, ?, ?, 'approved')`
        ).run(
          userId,
          bio || `Certified sports performance coach based in ${targetCity}.`,
          experienceYears ?? 4,
          JSON.stringify(certifications && certifications.length > 0 ? certifications : ["NIS Certified Coach"]),
          sessionPrice ?? 1100,
          targetCity
        ).lastInsertRowid
      );
      db.prepare(`INSERT INTO trainers (profile_id, user_id, featured) VALUES (?, ?, 1)`).run(tpId, userId);
      const assignedSports = sportIds && sportIds.length > 0 ? sportIds : db.prepare(`SELECT id FROM sports WHERE is_active = 1 LIMIT 1`).all().map(
        (s) => s.id
      );
      const insTrainerSport = db.prepare(`INSERT OR IGNORE INTO trainer_sports (trainer_id, sport_id) VALUES (?, ?)`);
      for (const sid of assignedSports) {
        insTrainerSport.run(tpId, sid);
      }
      const insAvail = db.prepare(
        `INSERT OR IGNORE INTO trainer_availability (trainer_user_id, avail_date, slot_label, start_time, end_time, is_booked)
         VALUES (?, ?, ?, ?, ?, 0)`
      );
      for (let d = 1; d <= 3; d++) {
        const dt = new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
        insAvail.run(userId, dt, "07:00 - 08:00", "07:00", "08:00");
        insAvail.run(userId, dt, "18:00 - 19:00", "18:00", "19:00");
      }
    }
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'welcome', ?, ?)`
    ).run(
      userId,
      "Account Provisioned by Administrator",
      `Your ${role.replace("_", " ")} account on ARENA360 Bengaluru is active.`
    );
    db.exec("COMMIT;");
    res.status(201).json({
      user: getUserPayload(userId),
      message: `${role.replace("_", " ")} account created for ${name}.`
    });
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Admin create user error:", err);
    res.status(500).json({ error: "Unable to create account." });
  }
});
apiRouter.patch("/admin/users/:id/status", requireAuth, requireRole("admin"), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.authUser.id) {
    return res.status(400).json({ error: "You cannot deactivate your own admin account." });
  }
  const { is_active } = req.body;
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(
    is_active ? 1 : 0,
    targetId
  );
  res.json({ ok: true });
});
apiRouter.patch("/admin/trainers/:id/approval", requireAuth, requireRole("admin"), (req, res) => {
  const tpId = Number(req.params.id);
  const { approval_status } = req.body;
  if (!["approved", "rejected"].includes(approval_status)) {
    return res.status(400).json({ error: "Invalid approval status." });
  }
  const tp = db.prepare("SELECT user_id FROM trainer_profiles WHERE id = ?").get(tpId);
  if (!tp) return res.status(404).json({ error: "Trainer profile not found." });
  db.prepare(`UPDATE trainer_profiles SET approval_status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    approval_status,
    tpId
  );
  db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'trainer_approval', ?, ?)`).run(
    tp.user_id,
    `Trainer Profile ${approval_status === "approved" ? "Approved" : "Rejected"}`,
    `An administrator has ${approval_status} your trainer verification profile.`
  );
  res.json({ ok: true });
});
apiRouter.post("/admin/sports", requireAuth, requireRole("admin"), (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().min(5).max(300)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid sport name and description required." });
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    const id = Number(
      db.prepare(`INSERT INTO sports (slug, name, description, icon_name, image_url) VALUES (?, ?, ?, 'Trophy', ?)`).run(slug, parsed.data.name, parsed.data.description, "/src/assets/images/hero_sports_arena_1794838288174.jpg").lastInsertRowid
    );
    res.status(201).json({ id, message: "Sport category created." });
  } catch {
    res.status(409).json({ error: "A sport with that name already exists." });
  }
});
apiRouter.delete("/admin/sports/:id", requireAuth, requireRole("admin"), (req, res) => {
  db.prepare(`UPDATE sports SET is_active = 0 WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});
apiRouter.patch("/admin/facilities/:id/status", requireAuth, requireRole("admin"), (req, res) => {
  const { is_active } = req.body;
  db.prepare(`UPDATE facilities SET is_active = ? WHERE id = ?`).run(is_active ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});
apiRouter.patch("/admin/reviews/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { moderation_status } = req.body;
  db.prepare(`UPDATE reviews SET moderation_status = ? WHERE id = ?`).run(moderation_status, Number(req.params.id));
  res.json({ ok: true });
});
apiRouter.patch("/admin/issues/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { status, admin_notes } = req.body;
  db.prepare(`UPDATE reported_issues SET status = ?, admin_notes = COALESCE(?, admin_notes), updated_at = datetime('now') WHERE id = ?`).run(
    status,
    admin_notes ?? null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

// src/server/app.ts
function createApiApp() {
  const app2 = express();
  app2.use(express.json({ limit: "4mb" }));
  app2.use("/api", apiRouter);
  return app2;
}

// src/server/vercel.ts
var app = express2();
var apiApp = createApiApp();
app.use((req, res, next) => {
  if (req.url === "/api" || req.url.startsWith("/api?")) {
    const urlObj = new URL(req.url, "http://localhost");
    const vpath = urlObj.searchParams.get("__vpath");
    if (vpath !== null) {
      urlObj.searchParams.delete("__vpath");
      const qs = urlObj.searchParams.toString();
      req.url = `/api/${vpath}${qs ? `?${qs}` : ""}`;
    }
  }
  return apiApp(req, res, next);
});
var vercel_default = app;
export {
  vercel_default as default
};
