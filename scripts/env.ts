// Loads .env.local (then .env) for scripts run with tsx, matching what Next.js does for the app.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
