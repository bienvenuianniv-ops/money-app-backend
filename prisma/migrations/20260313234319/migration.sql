-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "convertedAmount" DROP DEFAULT,
ALTER COLUMN "fromCurrency" DROP DEFAULT,
ALTER COLUMN "toCurrency" DROP DEFAULT;
