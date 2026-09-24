process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  "postgresql://postgres:postgres@localhost:5432/pagos_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-32bytes!!";
process.env.SCHEDULER_ENABLED = "false";
process.env.ALLOW_SIGNUP = "true";
process.env.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY || "simulated";
process.env.FEE_PERCENT = process.env.FEE_PERCENT || "0";
process.env.FEE_FIXED_COP = process.env.FEE_FIXED_COP || "0";
