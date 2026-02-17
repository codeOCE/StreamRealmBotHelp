import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import session from 'express-session';
import passport from 'passport';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    app.use(
      session({
        secret: process.env.SESSION_SECRET || 'super-secret-session-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          secure: false, // Important for localhost (HTTP)
          httpOnly: true,
        },
      }),
    );
    app.use(passport.initialize());
    app.use(passport.session());

    app.enableCors({
      origin: true,
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
