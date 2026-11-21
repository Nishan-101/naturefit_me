const STAGING_ADDON_NAME = "naturefit_staging";

function text(value) {
  return String(value == null ? "" : value).trim();
}

function equalFold(left, right) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function referencesProductionSite(value) {
  return /naturefit\.site/i.test(String(value || ""));
}

function cleverCloudHost(value) {
  return /^[a-z0-9][a-z0-9.-]*\.clever-cloud\.com$/i.test(text(value));
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
    stagingDbAddon: source.STAGING_DB_ADDON || source.stagingDbAddon,
    stagingDbHost: source.STAGING_DB_HOST || source.stagingDbHost,
    stagingDbName: source.STAGING_DB_NAME || source.stagingDbName,
    stagingDbUser: source.STAGING_DB_USER || source.stagingDbUser,
    productionDbHost: source.PRODUCTION_DB_HOST || source.productionDbHost,
    productionDbName: source.PRODUCTION_DB_NAME || source.productionDbName,
    productionDbUser: source.PRODUCTION_DB_USER || source.productionDbUser,
    productionDbPassword: source.PRODUCTION_DB_PASSWORD || source.productionDbPassword,
    publicSiteUrl: source.PUBLIC_SITE_URL || source.publicSiteUrl,
    clientOrigin: source.CLIENT_ORIGIN || source.clientOrigin,
    stripeSecretKey: source.STRIPE_SECRET_KEY || source.stripeSecretKey,
    liveEnabled: source.STRIPE_LIVE_ENABLED || source.liveEnabled,
  };
}

function accountName(currentUser) {
  return text(currentUser).split("@")[0];
}

/**
 * The staging database is accepted only when the live connection matches a
 * separately declared host, database name, and user, and none of those match
 * the production database. The Clever Cloud add-on name is not the schema name.
 * This function never returns connection values.
 */
function stagingDatabaseFailure(env) {
  const source = readRuntime(env);
  const addon = text(source.stagingDbAddon);
  const expectedHost = text(source.stagingDbHost);
  const expectedName = text(source.stagingDbName);
  const expectedUser = text(source.stagingDbUser);
  const dbHost = text(source.dbHost);
  const dbName = text(source.dbName);
  const dbUser = text(source.dbUser);
  const dbPassword = String(source.dbPassword || "");
  const productionHost = text(source.productionDbHost);
  const productionName = text(source.productionDbName);
  const productionUser = text(source.productionDbUser);

  if (source.productionDbPassword) {
    return "Remove PRODUCTION_DB_PASSWORD. Staging must not store the production database password. Refusing to start.";
  }
  if (addon !== STAGING_ADDON_NAME) {
    return "Staging must set STAGING_DB_ADDON to naturefit_staging. Refusing to start.";
  }
  if (!expectedHost || !expectedName || !expectedUser) {
    return "Staging must set STAGING_DB_HOST, STAGING_DB_NAME, and STAGING_DB_USER to the Clever Cloud staging database identity. Refusing to start.";
  }
  if (!cleverCloudHost(expectedHost)) {
    return "STAGING_DB_HOST must be the Clever Cloud host for the staging database. Refusing to start.";
  }
  if (!dbHost || !dbName || !dbUser || !dbPassword) {
    return "Staging must set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD for the staging database. Refusing to start.";
  }
  if (!productionHost || !productionName || !productionUser) {
    return "Staging must set PRODUCTION_DB_HOST, PRODUCTION_DB_NAME, and PRODUCTION_DB_USER so the live database can be rejected. Refusing to start.";
  }
  if (equalFold(dbHost, productionHost) || equalFold(expectedHost, productionHost)) {
    return "Staging must not use the production database host. Refusing to start.";
  }
  if (equalFold(dbName, productionName) || equalFold(expectedName, productionName)) {
    return "Staging must not use the production database name. Refusing to start.";
  }
  if (equalFold(dbUser, productionUser) || equalFold(expectedUser, productionUser)) {
    return "Staging must not use the production database user. Refusing to start.";
  }
  if (!equalFold(dbHost, expectedHost)) {
    return "DB_HOST must match STAGING_DB_HOST. A matching database name is not enough. Refusing to start.";
  }
  if (dbName !== expectedName) {
    return "DB_NAME must match STAGING_DB_NAME. The Clever Cloud add-on name is not the MySQL database name. Refusing to start.";
  }
  if (dbUser !== expectedUser) {
    return "DB_USER must match STAGING_DB_USER. A matching database name is not enough. Refusing to start.";
  }
  return "";
}

function productionDatabaseFailure(source) {
  const dbName = text(source.dbName);
  const dbHost = text(source.dbHost);
  const dbUser = text(source.dbUser);
  if (equalFold(dbName, STAGING_ADDON_NAME)) {
    return "The naturefit_staging database can only be used when APP_ENV is staging. Refusing to start.";
  }
  if (text(source.stagingDbName) && dbName === text(source.stagingDbName)) {
    return "Production cannot use the staging database. Refusing to start.";
  }
  if (text(source.stagingDbHost) && equalFold(dbHost, source.stagingDbHost)) {
    return "Production cannot use the staging database host. Refusing to start.";
  }
  if (text(source.stagingDbUser) && equalFold(dbUser, source.stagingDbUser)) {
    return "Production cannot use the staging database user. Refusing to start.";
  }
  return "";
}

function isolationFailure(env) {
  const source = readRuntime(env);
  const appEnv = text(source.appEnv).toLowerCase();
  const nodeEnv = text(source.nodeEnv).toLowerCase();
  const site = String(source.publicSiteUrl || "");
  const origin = String(source.clientOrigin || "");
  const key = text(source.stripeSecretKey);
  const liveEnabled = source.liveEnabled === true || source.liveEnabled === "true";

  if (!appEnv) {
    if (nodeEnv === "production") return "APP_ENV is missing. Refusing to start.";
    return "";
  }
  if (appEnv !== "production" && appEnv !== "staging") {
    return "APP_ENV must be production or staging. Refusing to start.";
  }
  if (appEnv === "production") return productionDatabaseFailure(source);

  const databaseFailure = stagingDatabaseFailure(env);
  if (databaseFailure) return databaseFailure;
  if (referencesProductionSite(site) || referencesProductionSite(origin)) {
    return "Staging cannot use naturefit.site. Refusing to start.";
  }
  if (liveEnabled || key.startsWith("sk_live_")) return "Staging cannot use live Stripe credentials. Refusing to start.";
  if (key && !key.startsWith("sk_test_")) return "Staging STRIPE_SECRET_KEY must be a Stripe test key. Refusing to start.";
  return "";
}

function connectedDatabaseFailure(identity, env) {
  const source = readRuntime(env);
  const appEnv = text(source.appEnv).toLowerCase();
  if (!appEnv) return "";
  const actualName = text(identity && (identity.databaseName || identity.database_name));
  const actualUser = accountName(identity && (identity.currentUser || identity.current_user));
  if (!actualName || !actualUser) {
    return "The connected database identity could not be verified. Refusing to start.";
  }
  if (appEnv === "staging") {
    if (actualName !== text(source.stagingDbName)) {
      return "The connected database does not match STAGING_DB_NAME. Refusing to start.";
    }
    if (actualUser !== text(source.stagingDbUser)) {
      return "The connected database user does not match STAGING_DB_USER. Refusing to start.";
    }
    if (equalFold(actualName, source.productionDbName)) {
      return "The connected database is the production database. Refusing to start.";
    }
    if (equalFold(actualUser, source.productionDbUser)) {
      return "The connected database user is the production database user. Refusing to start.";
    }
    return "";
  }
  if (appEnv === "production") {
    if (equalFold(actualName, STAGING_ADDON_NAME)) {
      return "Production cannot use the naturefit_staging database. Refusing to start.";
    }
    if (text(source.stagingDbName) && actualName === text(source.stagingDbName)) {
      return "Production is connected to the staging database. Refusing to start.";
    }
    if (text(source.stagingDbUser) && equalFold(actualUser, source.stagingDbUser)) {
      return "Production is connected as the staging database user. Refusing to start.";
    }
  }
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

function assertConnectedDatabase(identity, env) {
  const message = connectedDatabaseFailure(identity, env);
  if (message) {
    const error = new Error(message);
    error.statusCode = 503;
    throw error;
  }
}

function publicSiteOrigin(env) {
  const source = readRuntime(env);
  const configured = text(source.publicSiteUrl).replace(/\/$/, "");
  const appEnv = text(source.appEnv).toLowerCase();
  if (appEnv === "staging") {
    if (!configured || referencesProductionSite(configured)) return "";
    return configured;
  }
  return configured || "https://naturefit.site";
}

module.exports = {
  STAGING_ADDON_NAME,
  stagingDatabaseFailure,
  isolationFailure,
  connectedDatabaseFailure,
  assertRuntimeIsolation,
  assertConnectedDatabase,
  publicSiteOrigin,
};
