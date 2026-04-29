// Run with: node generate-icons.js
// Requires canvas: npm install canvas
// Creates icons/icon16.png, icon48.png, icon128.png

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background circle
  ctx.fillStyle = "#4285f4";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Bell shape (simple)
  const s = size / 16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.35, size * 0.22, Math.PI, 0);
  ctx.lineTo(size * 0.78, size * 0.68);
  ctx.lineTo(size * 0.22, size * 0.68);
  ctx.closePath();
  ctx.fill();

  // Clapper
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.73, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  const outPath = path.join(__dirname, "icons", `icon${size}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log("Written:", outPath);
}
