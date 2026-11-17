/*
  Warnings:

  - You are about to alter the column `statusRisiko` on the `skriningstunting` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.

*/
-- DropIndex
DROP INDEX `SkriningStunting_kodeKeluarga_key` ON `skriningstunting`;

-- AlterTable
ALTER TABLE `dusun` ADD COLUMN `kecamatan` VARCHAR(191) NOT NULL DEFAULT 'Cileunyi',
    ADD COLUMN `labelPos` JSON NULL,
    ADD COLUMN `namaSingkat` VARCHAR(191) NULL,
    ADD COLUMN `polygon` JSON NULL,
    ADD COLUMN `prioritas` VARCHAR(191) NULL,
    ADD COLUMN `pusat` JSON NULL;

-- AlterTable
ALTER TABLE `skriningstunting` ADD COLUMN `ambangKritis` DOUBLE NULL,
    ADD COLUMN `faktorDetail` JSON NULL,
    ADD COLUMN `prioritas` VARCHAR(191) NULL,
    ADD COLUMN `probabilitas` JSON NULL,
    ADD COLUMN `rekomendasiDetail` JSON NULL,
    ADD COLUMN `rt` VARCHAR(191) NULL,
    ADD COLUMN `statusBb` VARCHAR(191) NULL,
    ADD COLUMN `statusTb` VARCHAR(191) NULL,
    MODIFY `kodeKeluarga` VARCHAR(191) NULL,
    MODIFY `statusRisiko` ENUM('TINGGI', 'SEDANG', 'RENDAH') NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `dusunId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_dusunId_fkey` FOREIGN KEY (`dusunId`) REFERENCES `Dusun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
