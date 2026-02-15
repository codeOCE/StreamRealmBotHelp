import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
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
