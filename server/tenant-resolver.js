import path from "node:path";

export function resolveTenantDbPath(hostname, baseDir = path.resolve(process.cwd(), "tenants")) {
  const subdomain = hostname.split(".")[0].toLowerCase();
  if (!subdomain || subdomain === "www") return path.join(baseDir, "default.db");
  return path.join(baseDir, `${subdomain}.db`);
}
