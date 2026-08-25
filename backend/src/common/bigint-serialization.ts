// Prisma BigInt columns (e.g. File.size) must serialize as strings in HTTP
// responses. Installs a global BigInt.prototype.toJSON once per process.
const prototype = BigInt.prototype as unknown as { toJSON?: () => string };
if (typeof prototype.toJSON !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function bigIntToJson(): string {
      return String(this);
    },
    writable: true,
    configurable: true,
  });
}

export {};
