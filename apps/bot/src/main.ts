import 'dotenv/config';
import { Logger } from 'pino';

const logger = require('pino')();

async function bootstrap() {
    logger.info('StreamPulse Bot Service Starting...');
    // Logic to initialize Twurple and queues will go here
}

bootstrap();
