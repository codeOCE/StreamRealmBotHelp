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
        cookie: {
          maxAge: 7 * 24 * 60 * 60 * 1000,
          secure: process.env.NODE_ENV === 'production', // Only secure in prod
          httpOnly: true,
          sameSite: 'lax', // Needed for OAuth redirects
          path: '/',
        },
      }),
    );
    app.use(passport.initialize());
    app.use(passport.session());

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
