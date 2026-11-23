import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { db } from './db.ts';
import type { UserRole } from './domain.ts';

function loadFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firebase-applet-config.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { projectId?: string };
        if (parsed.projectId) return parsed.projectId;
      }
    } catch {
      // Try next candidate
    }
  }
  return 'gen-lang-client-0946597153';
}

const firebaseProjectId = loadFirebaseProjectId();

if (!getApps().length) {
  initializeApp({
    projectId: firebaseProjectId,
  });
}

const adminAuth = getAuth();

const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET !== 'replace-with-strong-random-32-byte-secret'
    ? process.env.JWT_SECRET
    : crypto.createHash('sha256').update(`arena360-${firebaseProjectId}-session`).digest('hex');

export interface SessionUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: number;
}

export interface AuthRequest extends Request {
  authUser?: SessionUser;
}

export function signSessionToken(user: { id: number; uid: string; role: UserRole }): string {
  return jwt.sign({ id: user.id, uid: user.uid, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifySessionToken(token: string): { id: number; uid: string; role: UserRole } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; uid: string; role: UserRole };
    return payload;
  } catch {
    return null;
  }
}

export async function verifyFirebaseToken(idToken: string) {
  return adminAuth.verifyIdToken(idToken);
}

export function getUserById(id: number): SessionUser | undefined {
  return db
    .prepare('SELECT id, uid, name, email, phone, role, avatar_url, is_active FROM users WHERE id = ?')
    .get(id) as SessionUser | undefined;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  const token = authHeader.slice(7).trim();
  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
  const user = getUserById(decoded.id);
  if (!user || !user.is_active) {
    return res.status(403).json({ error: 'Account is inactive or unavailable.' });
  }
  req.authUser = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: `Forbidden: This operation requires one of [${roles.join(', ')}] permissions.`,
      });
    }
    next();
  };
}
