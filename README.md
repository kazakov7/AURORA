# AURORA Backend

## Google authentication

The API accepts a verified Google ID token through the GraphQL mutation below. Configure the public Google Web client ID on the API as `GOOGLE_WEB_CLIENT_ID`; Antigravity must use the same public Web client ID. Do not add a Google client secret to this project.

```graphql
mutation GoogleAuth($input: GoogleAuthInput!) {
  googleAuth(input: $input) {
    _id
    memberNick
    memberType
    memberAuthType
    accessToken
  }
}
```

The client sends only `{ "input": { "credential": "<Google ID token>" } }`. On success, store and use `accessToken` through the same AURORA session flow used after `login`. The API verifies the credential, issuer, audience, expiry, Google subject, and verified email; it does not trust browser profile data. A Google attempt for an email already owned by a non-Google account is rejected and must not be auto-linked.

## Kakao authentication

Configure `KAKAO_REST_API_KEY` and `KAKAO_CLIENT_SECRET` on the API. The client secret remains server-only. The API exchanges the authorization code directly with Kakao, requires the returned OIDC ID token, and verifies its RS256 signature using Kakao's published JWKS as well as its issuer, audience, expiration, and subject.

```graphql
mutation KakaoAuth($input: KakaoAuthInput!) {
  kakaoAuth(input: $input) {
    _id
    memberNick
    memberType
    memberAuthType
    accessToken
  }
}
```

Antigravity sends only:

```json
{
  "input": {
    "code": "<authorization code returned by Kakao>",
    "redirectUri": "https://your-app.example/auth/kakao/callback"
  }
}
```

In Kakao Developers, enable Kakao Login and OpenID Connect, register the exact redirect URI under the REST API key, enable the client secret, and enable consent for Nickname and Profile image. Antigravity must request the Kakao authorization scope `openid,profile_nickname,profile_image` (comma-separated for Kakao's REST authorization request). The API retrieves the consented nickname and HTTPS profile-image URL from Kakao's server-side user-information endpoint; it never receives provider tokens or profile values from Antigravity. Email is optional for AURORA Kakao accounts, but any supplied email that already belongs to another AURORA account is rejected rather than linked. The supplied `redirectUri` must exactly match the URI used to obtain the code and one registered in Kakao Developers.

The NestJS GraphQL backend for the AURORA travel marketplace.

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

AURORA is built with [Nest](https://github.com/nestjs/nest).

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

# backend validation
$ npx tsc -p apps/aurora-api/tsconfig.app.json --noEmit
$ npx tsc -p apps/aurora-batch/tsconfig.app.json --noEmit
$ npm run build

# test coverage
$ npm run test:cov
```

The E2E suite starts an isolated in-memory MongoDB replica set, clears test data between cases, and never uses `MONGO_DEV` or `MONGO_PROD`. The first run may download a MongoDB test binary into `/tmp/aura-mongodb-binaries`. Stripe is mocked in E2E; no real charge is created.

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
