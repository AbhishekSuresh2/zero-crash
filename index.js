/**
 * zero-crash v1.0.0
 * Copyright (c) 2026 Abhishek Suresh (https://github.com/AbhishekSuresh2)
 * Released under the MIT License.
 * * Usage Restriction: Please do not copy, modify, and republish this 
 * Package as your own without explicit permission. 
 * * Contributions: Found a bug or have an idea?, Please open an issue; 
 * Please submit a Pull Request (PR) to the official repository.
 */

const OS = require("os");
const CRYPTO = require("crypto");

const DEFAULT_EXIT_CODES = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  CONFIG_ERROR: 2,
  DEPENDENCY_ERROR: 3,
  INTERRUPT: 130
};

let handled = false;
let shutdownHooks = [];
let role = "app";
let envRequired = [];

function crashId() {
  return "ZC-" + CRYPTO.randomBytes(3).toString("hex").toUpperCase();
}

function context() {
  return {
    node: process.version,
    platform: OS.platform(),
    pid: process.pid,
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
    uptime: Math.round(process.uptime()) + "s"
  };
}

function format(err, type, code, options) {
  const id = crashId();
  const reason = err && err.message ? err.message : String(err);
  const where = err && err.stack ? err.stack.split(OS.EOL)[1] : "";
  if (options.json) {
    return JSON.stringify({ id, type, reason, where, code, role, context: context() });
  }
  if (options.verbose && err.stack) return err.stack;
  return `💥 [${role}] ${type}\nReason: ${reason}\nAt: ${where?.trim()}\nExit: ${code}\nCrashID: ${id}`;
}

function logger(msg, options) {
  if (options.quiet) return;
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runShutdown() {
  return Promise.allSettled(shutdownHooks.map(fn => fn()));
}

function exit(code) {
  runShutdown().finally(() => process.exit(code));
}

function guard(err, type, code, options) {
  if (handled) return;
  handled = true;
  options.logger(format(err, type, code, options), options);
  if (options.onCrash) {
    try { options.onCrash(err, { type, code }); } catch {}
  }
  exit(code);
}

function attach(options) {
  if (attach.done) return;
  attach.done = true;

  process.on("uncaughtException", e =>
    guard(e, "RUNTIME_ERROR", DEFAULT_EXIT_CODES.RUNTIME_ERROR, options)
  );

  process.on("unhandledRejection", e =>
    guard(e, "RUNTIME_ERROR", DEFAULT_EXIT_CODES.RUNTIME_ERROR, options)
  );

  process.on("SIGINT", () =>
    guard("Manual Interrupt", "INTERRUPT", DEFAULT_EXIT_CODES.INTERRUPT, options)
  );

  process.on("SIGTERM", () =>
    guard("Termination Signal", "INTERRUPT", DEFAULT_EXIT_CODES.INTERRUPT, options)
  );
}

function requireEnv(list) {
  envRequired = list;
}

function checkEnv(options) {
  const missing = envRequired.filter(k => !process.env[k]);
  if (missing.length) {
    guard(`Missing env: ${missing.join(", ")}`, "CONFIG_ERROR", DEFAULT_EXIT_CODES.CONFIG_ERROR, options);
  }
}

function onShutdown(fn) {
  shutdownHooks.push(fn);
}

function setRole(name) {
  role = name;
}

function protect(fn, user = {}) {
  const options = {
    verbose: false,
    quiet: false,
    json: false,
    logger,
    onCrash: null,
    ...user
  };

  attach(options);
  checkEnv(options);

  Promise.resolve()
    .then(fn)
    .then(() => {
      if (!options.quiet)
        logger(`✅ [${role}] Clean exit`, options);
      exit(DEFAULT_EXIT_CODES.SUCCESS);
    })
    .catch(err =>
      guard(err, "RUNTIME_ERROR", DEFAULT_EXIT_CODES.RUNTIME_ERROR, options)
    );
}

function config(msg) {
  const e = new Error(msg);
  e.__type = "CONFIG";
  return e;
}

function dependency(msg) {
  const e = new Error(msg);
  e.__type = "DEPENDENCY";
  return e;
}

module.exports = {
  protect,
  onShutdown,
  requireEnv,
  role: setRole,
  exitCodes: DEFAULT_EXIT_CODES,
  config,
  dependency
};
