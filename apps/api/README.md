<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Troubleshooting Twitch 401 Unauthorized Errors

If you're experiencing 401 Unauthorized errors when testing in your localhost environment, here are the most common causes and solutions:

### 1. Missing or Incorrect Environment Variables

**Problem**: The `TWITCH_CLIENT_ID` or `TWITCH_CLIENT_SECRET` are missing or incorrect.

**Solution**:
- Check that you have a `.env` file in the `apps/api/` directory
- Ensure the following variables are set:
  ```
  TWITCH_CLIENT_ID=your_client_id_here
  TWITCH_CLIENT_SECRET=your_client_secret_here
  TWITCH_REDIRECT_URI=http://localhost:3001/auth/twitch/callback
  ```
- Get these values from your [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- The application will now validate these on startup and log warnings if they're missing

### 2. Redirect URI Mismatch

**Problem**: The `TWITCH_REDIRECT_URI` in your `.env` file doesn't match what's configured in your Twitch app.

**Solution**:
- Go to your [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- Click on your app → Settings
- Under "OAuth Redirect URLs", make sure you have added:
  - `http://localhost:3001/auth/twitch/callback` (or whatever port you're using)
- The redirect URI must match **exactly** (including http vs https, port number, trailing slashes)

### 3. Invalid Client Credentials

**Problem**: The Client ID or Client Secret are incorrect or the app was deleted/regenerated.

**Solution**:
- Verify your credentials in the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- If you regenerated the Client Secret, make sure to update it in your `.env` file
- Restart your application after updating environment variables

### 4. Token Expiration

**Problem**: App access tokens expire after a certain time, and the refresh mechanism may fail.

**Solution**:
- The application now automatically handles token refresh
- Check the logs for messages like "Fetching new Twitch App Access Token..."
- If you see repeated 401 errors, check that `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are correct

### 5. Localhost vs Production Configuration

**Problem**: Your Twitch app might be configured for production URLs only.

**Solution**:
- Make sure your Twitch app allows localhost redirects
- In the Twitch Developer Console, add `http://localhost:3001/auth/twitch/callback` to OAuth Redirect URLs
- Some Twitch apps require you to explicitly enable localhost in the app settings

### Debugging Tips

1. **Check startup logs**: The application now validates environment variables on startup. Look for:
   - ✅ "All required Twitch environment variables are present"
   - ❌ "Missing required Twitch environment variables"

2. **Check API logs**: When a 401 error occurs, you'll now see detailed error messages including:
   - Which API call failed
   - Whether the token or Client-ID is missing
   - The full error response from Twitch

3. **Test token generation**: The app token is generated automatically. Check logs for:
   - "Fetching new Twitch App Access Token..."
   - "Generated new App Access Token. Expires in Xs"
   - Any errors during token generation

4. **Verify your .env file location**: Make sure your `.env` file is in `apps/api/.env` (not the root directory)

### Still Having Issues?

- Double-check all environment variables are set correctly
- Verify your Twitch app is active (not deleted or suspended)
- Check that you're using the correct port in both your `.env` and Twitch app settings
- Review the application logs for specific error messages

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
