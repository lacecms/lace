import { assertHostDatabaseSafe } from "./database/host-database-safety.js";
import { migrateNodeDatabase } from "./database/connection.js";

// The packaged API image reaches this entry point through a workspace symlink.
if (import.meta.main) {
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
