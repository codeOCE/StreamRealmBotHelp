/*
  Warnings:

  - You are about to drop the column `botAccessToken` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `botRefreshToken` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `minMessages` on the `Timer` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "UserLevel" ADD VALUE 'VIP';

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "botAccessToken",
DROP COLUMN "botRefreshToken",
ADD COLUMN     "encryptedBotAccessToken" TEXT,
ADD COLUMN     "encryptedBotRefreshToken" TEXT;

-- AlterTable
ALTER TABLE "Timer" DROP COLUMN "minMessages",
ADD COLUMN     "chatLines" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Overlay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "urlSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Overlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverlayWidget" (
    "id" TEXT NOT NULL,
    "overlayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 300,
    "height" INTEGER NOT NULL DEFAULT 200,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "styles" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverlayWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Overlay_urlSlug_key" ON "Overlay"("urlSlug");

-- CreateIndex
CREATE INDEX "Overlay_tenantId_idx" ON "Overlay"("tenantId");

-- CreateIndex
CREATE INDEX "Overlay_urlSlug_idx" ON "Overlay"("urlSlug");

-- CreateIndex
CREATE INDEX "OverlayWidget_overlayId_idx" ON "OverlayWidget"("overlayId");

-- AddForeignKey
ALTER TABLE "Overlay" ADD CONSTRAINT "Overlay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverlayWidget" ADD CONSTRAINT "OverlayWidget_overlayId_fkey" FOREIGN KEY ("overlayId") REFERENCES "Overlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
