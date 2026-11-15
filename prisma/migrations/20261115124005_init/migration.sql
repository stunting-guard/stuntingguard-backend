-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('KADER', 'APARATUR', 'ADMIN') NOT NULL DEFAULT 'KADER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dusun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `rw` VARCHAR(191) NOT NULL,
    `posyandu` VARCHAR(191) NOT NULL,
    `kapasitasBalita` INTEGER NOT NULL DEFAULT 100,
    `zona` ENUM('MERAH', 'KUNING', 'HIJAU') NOT NULL DEFAULT 'HIJAU',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Dusun_nama_key`(`nama`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkriningStunting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kodeKeluarga` VARCHAR(191) NOT NULL,
    `kepalaKeluarga` VARCHAR(191) NULL,
    `namaBalita` VARCHAR(191) NULL,
    `nikBalita` VARCHAR(191) NULL,
    `jenisKelamin` VARCHAR(191) NULL,
    `usiaBulan` INTEGER NOT NULL,
    `tinggiBadan` DOUBLE NULL,
    `beratBadan` DOUBLE NULL,
    `zScoreTb` DOUBLE NULL,
    `zScoreBb` DOUBLE NULL,
    `pendapatan` INTEGER NOT NULL,
    `pendidikanIbu` VARCHAR(191) NOT NULL,
    `riwayatKehamilan` VARCHAR(191) NOT NULL,
    `sumberAir` VARCHAR(191) NOT NULL,
    `kondisiSanitasi` VARCHAR(191) NOT NULL,
    `statusRisiko` VARCHAR(191) NOT NULL,
    `keyakinanModel` DOUBLE NULL,
    `faktorDominan` VARCHAR(191) NULL,
    `rencanaIntervensi` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `dusunId` INTEGER NOT NULL,
    `kaderId` INTEGER NULL,

    UNIQUE INDEX `SkriningStunting_kodeKeluarga_key`(`kodeKeluarga`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SkriningStunting` ADD CONSTRAINT `SkriningStunting_dusunId_fkey` FOREIGN KEY (`dusunId`) REFERENCES `Dusun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkriningStunting` ADD CONSTRAINT `SkriningStunting_kaderId_fkey` FOREIGN KEY (`kaderId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
