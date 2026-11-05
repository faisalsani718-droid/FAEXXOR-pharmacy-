// FAEXXOR Pharmacy: secure Cloudinary signing. Only a logged-in admin can use it.
// Netlify env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, FIREBASE_API_KEY, FIREBASE_PROJECT_ID
const crypto = require("crypto");
const E = process.env;
const json = (c, o) => ({ statusCode: c, headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
const sign = (p) => crypto.createHash("sha1").update(
  Object.keys(p).sort().map((k) => k + "=" + p[k]).join("&") + E.CLOUDINARY_API_SECRET).digest("hex");

async function requireAdmin(token) {
  if (!token) throw new Error("Not logged in");
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + E.FIREBASE_API_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) });
  const u = (await r.json()).users;
  if (!r.ok || !u || !u[0]) throw new Error("Invalid login");
  const d = await fetch("https://firestore.googleapis.com/v1/projects/" + E.FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/users/" + u[0].localId, { headers: { Authorization: "Bearer " + token } });
  const doc = await d.json();
  if (!d.ok || !doc.fields || !doc.fields.role || doc.fields.role.stringValue !== "admin") throw new Error("Admin only");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  try {
    await requireAdmin((event.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    const b = JSON.parse(event.body || "{}");
    const timestamp = Math.floor(Date.now() / 1000);
    if (b.action === "sign") {
      const base = String(b.fileName || "image").replace(/\.[^.]+$/, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
      const params = { allowed_formats: "jpg,jpeg,png,webp", folder: "faexxor-products",
        public_id: base + "-" + crypto.randomBytes(4).toString("hex"), timestamp };
      return json(200, { ...params, signature: sign(params), apiKey: E.CLOUDINARY_API_KEY, cloudName: E.CLOUDINARY_CLOUD_NAME });
    }
    if (b.action === "delete") {
      const publicId = String(b.publicId || "");
      if (!publicId.startsWith("faexxor-products/")) return json(400, { error: "Bad publicId" });
      const params = { public_id: publicId, timestamp };
      const body = new URLSearchParams({ ...params, api_key: E.CLOUDINARY_API_KEY, signature: sign(params) });
      const r = await fetch("https://api.cloudinary.com/v1_1/" + E.CLOUDINARY_CLOUD_NAME + "/image/destroy", { method: "POST", body });
      return json(r.ok ? 200 : 502, await r.json());
    }
    return json(400, { error: "Unknown action" });
  } catch (e) { return json(401, { error: e.message }); }
};
