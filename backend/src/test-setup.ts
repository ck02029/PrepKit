process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://prepkit:prepkit@127.0.0.1:5432/prepkit_test";
process.env.SESSION_SECRET ??= "unit-test-session-secret-with-at-least-32-characters";
