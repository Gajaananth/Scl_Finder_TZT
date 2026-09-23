import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { parse as cookieParse, serialize as cookieSerialize } from 'cookie';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import schools from './data/schools.json';

const SESSION_COOKIE_NAME = 'session';
const SECRET_KEY = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'st-cecilias-girls-college-session-secret-key-32-chars-min!'
);

const DEFAULT_STAFF = [
  {
    email: 'staff@stcecilias.lk',
    passwordHash: '$2b$10$fjC163mzcX5d8mqprOZd3e90.KrNzHcW0KxQOlMlP6.GTCivjFxn6', // StCecilia@2026#Admin!
  },
];

function getAccounts() {
  const env = process.env.STAFF_ACCOUNTS;
  if (!env) return DEFAULT_STAFF;
  try {
    const parsed = JSON.parse(env);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_STAFF;
}

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function mockApiPlugin(): Plugin {
  return {
    name: 'mock-auth-and-schools-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // 1. Session check (/api/me)
        if (url === '/api/me' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          const cookies = cookieParse(req.headers.cookie || '');
          const token = cookies[SESSION_COOKIE_NAME];
          if (!token) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          try {
            const { payload } = await jwtVerify(token, SECRET_KEY);
            if (payload.email && typeof payload.email === 'string') {
              res.statusCode = 200;
              res.end(JSON.stringify({ email: payload.email }));
              return;
            }
          } catch {}
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        // 2. Login (/api/login)
        if (url === '/api/login' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          const body = await parseJsonBody(req);
          const { email, password } = body || {};

          if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Invalid email or password' }));
            return;
          }

          const accounts = getAccounts();
          const account = accounts.find((a: any) => a.email.toLowerCase() === email.trim().toLowerCase());

          if (!account) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Invalid email or password' }));
            return;
          }

          const match = await bcrypt.compare(password, account.passwordHash);
          if (!match) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Invalid email or password' }));
            return;
          }

          const token = await new SignJWT({ email: account.email })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('12h')
            .sign(SECRET_KEY);

          const cookieHeader = cookieSerialize(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: false, // allow http in local dev
            sameSite: 'strict',
            path: '/',
            maxAge: 12 * 60 * 60,
          });

          res.setHeader('Set-Cookie', cookieHeader);
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, email: account.email }));
          return;
        }

        // 3. Logout (/api/logout)
        if (url === '/api/logout' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          const cookieHeader = cookieSerialize(SESSION_COOKIE_NAME, '', {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            path: '/',
            maxAge: 0,
            expires: new Date(0),
          });
          res.setHeader('Set-Cookie', cookieHeader);
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // 4. Schools endpoint (/api/schools) - public
        if (url === '/api/schools') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(schools));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApiPlugin()],
});
