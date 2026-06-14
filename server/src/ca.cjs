// Preloaded via `node -r ./src/ca.cjs`.
// Adds the corporate proxy's root CA (exported to corp-root-ca.pem) to Node's
// TLS trust store so HTTPS calls (Telegram, Google) work behind the proxy.
const fs = require("node:fs");
const path = require("node:path");
const tls = require("node:tls");

const pemPath = path.join(__dirname, "..", "corp-root-ca.pem");

if (fs.existsSync(pemPath)) {
  const extraCert = fs.readFileSync(pemPath, "ascii");
  const origCreateSecureContext = tls.createSecureContext;
  tls.createSecureContext = (options = {}) => {
    const context = origCreateSecureContext(options);
    context.context.addCACert(extraCert);
    return context;
  };
  console.log("🔐 Loaded extra root CA (corp-root-ca.pem)");
}
