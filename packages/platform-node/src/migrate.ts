import { fileURLToPath } from "node:url";
import { assertHostDatabaseSafe } from "./host-database-safety.js";
import { migrateNodeDatabase } from "./index.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await assertHostDatabaseSafe({
      databasePath: process.env.LACE_DATABASE_PATH ?? "./lace.sqlite",
    });
    console.log(
      JSON.stringify(migrateNodeDatabase(process.env.LACE_DATABASE_PATH ?? "./lace.sqlite")),
    );
  } catch {
    console.error(
      "Database migration refused. Stop matching Compose API/dispatcher services, restore Docker inspection and retry maintenance.",
    );
    process.exitCode = 6;
  }
}
