import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { Request, Response } from 'express';
import session from 'express-session';
import passport from 'passport';

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.set('trust proxy', 1);



    app.use(
      session({
        name: 'sr_session',
        secret: process.env.SESSION_SECRET || 'super-secret-session-key',
        resave: false,
        saveUninitialized: false,
        proxy: true, // Crucial for trusting the Next.js proxy
        cookie: {
          maxAge: 7 * 24 * 60 * 60 * 1000,
          secure: false, // FORCE FALSE FOR LOCAL DEV
          httpOnly: true,
          sameSite: 'lax', // 'lax' allows cookies to be sent on top-level redirects
          path: '/',
          domain: undefined, // Let the browser determine the domain (localhost)
        },
      }),
    );
    app.use(passport.initialize());
    app.use(passport.session());

    // Debug Middleware - runs AFTER passport.session() so we can see deserialized user
    app.use((req: Request, res: Response, next: Function) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        const sessionCookie = req.headers.cookie?.split(';').find(c => c.trim().startsWith('sr_session='));
        console.log(`[${req.method}] ${req.path} | SessionID: ${req.sessionID} | User: ${req.user ? (req.user as any).username : 'Guest'} | SessionCookie: ${sessionCookie ? 'PRESENT' : 'MISSING'} | Cookies: ${Object.keys(req.cookies || {}).join(', ')}`);
        if (req.user) {
          console.log(`  └─ User details: ID=${(req.user as any).id}, Username=${(req.user as any).username}`);
        }
      }
      next();
    });

    app.enableCors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3002',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    const port = process.env.PORT ?? 3001;
    console.log(`Attempting to start server on port ${port}...`);
    await app.listen(port);
    console.log(`Nest application successfully started on port ${port}`);
  } catch (err) {
    console.error('Fatal error during bootstrap:', err);
    process.exit(1);
  }
}
bootstrap();
