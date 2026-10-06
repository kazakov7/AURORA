process.env.NODE_ENV = 'test';
process.env.MONGO_DEV = process.env.AURA_E2E_MONGO_URI;
process.env.SECRET_TOKEN = 'aura-e2e-secret-token';
process.env.STRIPE_SECRET_KEY = 'sk_test_aura_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_aura_mock';
