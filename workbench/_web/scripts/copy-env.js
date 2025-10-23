import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the external .env file (in the root directory)
const externalEnvPath = path.resolve(__dirname, "../../../.env");
// Path to the Next.js .env file
const nextEnvPath = path.resolve(__dirname, "../.env");

// Read the external .env file
const envContent = fs.readFileSync(externalEnvPath, "utf8");

// Write to the Next.js .env file
fs.writeFileSync(nextEnvPath, envContent);

console.log("Environment variables copied successfully!");
