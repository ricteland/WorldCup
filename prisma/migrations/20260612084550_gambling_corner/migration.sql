-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "recoveryToken" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gambleBalance" INTEGER NOT NULL DEFAULT 100
);
INSERT INTO "new_Player" ("createdAt", "displayName", "id", "isAdmin", "recoveryToken") SELECT "createdAt", "displayName", "id", "isAdmin", "recoveryToken" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_displayName_key" ON "Player"("displayName");
CREATE UNIQUE INDEX "Player_recoveryToken_key" ON "Player"("recoveryToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
