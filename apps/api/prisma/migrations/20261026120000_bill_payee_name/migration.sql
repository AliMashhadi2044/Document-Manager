-- نام صاحب حساب قبض.
--
-- قبضِ یک مدرسه به نام همان مدرسه است و نه به نام فروشندهٔ فاکتور. تا امروز گزارش
-- شبای ذینفعان ناچار بود نام فروشنده را در ستون «نام صاحب حساب» بنشاند، که برای
-- قبض درست نبود.

ALTER TABLE "invoice_payments" ADD COLUMN "payee_name" VARCHAR(200);

-- همان قاعدهٔ همیشگی: تغییر روش پرداخت، فیلدهای روش قبلی را پاک می‌کند و نه اینکه
-- پنهانشان کند. پس این ستون فقط در روش «قبض» مقدار می‌گیرد.
ALTER TABLE "invoice_payments" DROP CONSTRAINT IF EXISTS "invoice_payments_method_fields_ck";

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_method_fields_ck" CHECK (
    ("method_kind" = 'BENEFICIARY_ACCOUNT'
      AND "bill_identifier" IS NULL AND "petty_cash_holder_id" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL
      AND "payee_name" IS NULL)
    OR ("method_kind" = 'BILL'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "petty_cash_holder_id" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL)
    OR ("method_kind" = 'PETTY_CASH'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "bill_identifier" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL
      AND "payee_name" IS NULL)
    OR ("method_kind" = 'SPLIT'
      AND "bill_identifier" IS NULL
      AND "vendor_bank_account_id" IS NOT NULL AND "iban_snapshot" IS NOT NULL
      AND "petty_cash_holder_id" IS NOT NULL
      AND "beneficiary_amount" > 0 AND "petty_cash_amount" > 0
      AND "payee_name" IS NULL)
  );
