-- AlterTable
ALTER TABLE `skriningstunting` ADD COLUMN `asiEksklusif` VARCHAR(191) NULL,
    ADD COLUMN `beratLahirGram` INTEGER NULL,
    ADD COLUMN `namaIbu` VARCHAR(191) NULL,
    ADD COLUMN `noKk` VARCHAR(191) NULL,
    ADD COLUMN `praktikMpasi` VARCHAR(191) NULL,
    ADD COLUMN `statusSosialEkonomi` VARCHAR(191) NULL,
    ADD COLUMN `tinggiBadanIbu` DOUBLE NULL,
    ADD COLUMN `usiaIbu` INTEGER NULL;
