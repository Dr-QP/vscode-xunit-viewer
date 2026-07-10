export function log(message) {
  console.log(`[build] ${message}`);
}

export function fail(message) {
  console.error(`[build] ${message}`);
  process.exit(1);
}
