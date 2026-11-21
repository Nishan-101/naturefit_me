const { STAGING_DB_NAME } = require("./otpPolicy");

function referencesProductionSite(value) {
  return /naturefit\.site/i.test(String(value || ""));
}

function readRuntime(env) {
  const source = env || process.env;
  return {
    appEnv: source.APP_ENV || source.appEnv,
    nodeEnv: source.NODE_ENV || source.nodeEnv,
    dbName: source.DB_NAME || source.dbName,
    dbHost: source.DB_HOST || source.dbHost,
    dbUser: source.DB_USER || source.dbUser,
    dbPassword: source.DB_PASSWORD || source.dbPassword,
    publicSiteUrl: source.PUBLIC_SITE_URL || source.publicSiteUrl,
    clientOrigin: source.CLIENT_ORIGIN || source.clientOrigin,
    stripeSecretKey: source.STRIPE_SECRET_KEY || source.stripeSecretKey,
    liveEnabled: source.STRIPE_LIVE_ENABLED || source.liveEnabled,
  };
}

function isolationFailure(env) {
  const source = readRuntime(env);
  const appEnv = String(source.appEnv || "").trim().toLowerCase();
  const nodeEnv = String(source.nodeEnv || "").trim().toLowerCase();
  const dbName = String(source.dbName || "").trim();
  const dbHost = String(source.dbHost || "").trim();
  const dbUser = String(source.dbUser || "").trim();
  const dbPassword = String(source.dbPassword || "");
  const site = String(source.publicSiteUrl || "");
  const origin = String(source.clientOrigin || "");
  const key = String(source.stripeSecretKey || "").trim();
  const liveEnabled = source.liveEnabled === true || source.liveEnabled === "true";

  if (!appEnv) {
    if (nodeEnv === "production") return "APP_ENV is missing. Refusing to start.";
    return "";
  }
  if (appEnv !== "production" && appEnv !== "staging") {
    return "APP_ENV must be production or staging. Refusing to start.";
  }
  if (dbName === STAGING_DB_NAME && appEnv !== "staging") {
    return "The naturefit_staging database can only be used when APP_ENV is staging. Refusing to start.";
  }
  if (appEnv === "production") return "";
  if (dbName !== STAGING_DB_NAME) return "Staging must set DB_NAME to naturefit_staging. Refusing to start.";
  if (!dbHost || !dbUser || !dbPassword) {
    return "Staging must set DB_HOST, DB_USER, and DB_PASSWORD for naturefit_staging. Refusing to start.";
  }
  if (referencesProductionSite(site) || referencesProductionSite(origin)) {
    return "Staging cannot use naturefit.site. Refusing to start.";
  }
  if (liveEnabled || key.startsWith("sk_live_")) return "Staging cannot use live Stripe credentials. Refusing to start.";
  if (key && !key.startsWith("sk_test_")) return "Staging STRIPE_SECRET_KEY must be a Stripe test key. Refusing to start.";
  return "";
}

function assertRuntimeIsolation(env) {
  const message = isolationFailure(env);
  if (message) {
    const error = new Error(message);
    error.statusCode = 503;
    throw error;
  }
}

function publicSiteOrigin(env) {
  const source = readRuntime(env);
  const configured = String(source.publicSiteUrl || "").trim().replace(/\/$/, "");
  const appEnv = String(source.appEnv || "").trim().toLowerCase();
  if (appEnv === "staging") {
    if (!configured || referencesProductionSite(configured)) return "";
    return configured;
  }
  return configured || "https://naturefit.site";
}

module.exports = {
  STAGING_DB_NAME,
  isolationFailure,
  assertRuntimeIsolation,
  publicSiteOrigin,
};
