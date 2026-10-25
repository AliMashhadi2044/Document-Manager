-- سهم هر مقصد در پرداخت ترکیبی.
--
-- مبلغ اینجا **تکرار** مبلغ فاکتور نیست، تقسیم آن است (قاعدهٔ «مبالغ فقط یک‌جا
-- زندگی می‌کنند»): جمع دو سهم همان `invoices.total_amount` است و همین را دیتابیس
-- تضمین می‌کند، نه فقط لایهٔ سرویس.

ALTER TABLE "invoice_payments"
  ADD COLUMN "beneficiary_amount" BIGINT,
  ADD COLUMN "petty_cash_amount"  BIGINT;

-- ───────── سازگاری فیلدهای روش پرداخت ─────────
-- قید قبلی سه شاخه داشت و هیچ‌کدام `SPLIT` را نمی‌پذیرفت؛ بازنویسی می‌شود تا:
--  • فقط روش ترکیبی دو سهم داشته باشد (و بقیه حتماً نداشته باشند)،
--  • روش ترکیبی هر دو مقصد را داشته باشد — پرداخت ترکیبی با یک طرف، ترکیبی نیست،
--  • هیچ سهمی صفر یا منفی نباشد: سهم صفر یعنی همان روش تک‌مقصدی، نه ترکیبی.
ALTER TABLE "invoice_payments" DROP CONSTRAINT IF EXISTS "invoice_payments_method_fields_ck";

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_method_fields_ck" CHECK (
    ("method_kind" = 'BENEFICIARY_ACCOUNT'
      AND "bill_identifier" IS NULL AND "petty_cash_holder_id" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL)
    OR ("method_kind" = 'BILL'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "petty_cash_holder_id" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL)
    OR ("method_kind" = 'PETTY_CASH'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "bill_identifier" IS NULL
      AND "beneficiary_amount" IS NULL AND "petty_cash_amount" IS NULL)
    OR ("method_kind" = 'SPLIT'
      AND "bill_identifier" IS NULL
      AND "vendor_bank_account_id" IS NOT NULL AND "iban_snapshot" IS NOT NULL
      AND "petty_cash_holder_id" IS NOT NULL
      AND "beneficiary_amount" > 0 AND "petty_cash_amount" > 0)
  );

-- ───────── جمع دو سهم = مبلغ فاکتور ─────────
-- این را CHECK نمی‌تواند تضمین کند (مبلغ فاکتور در جدول دیگری است)، پس تریگر.
--
-- **به تعویق افتاده تا لحظهٔ commit**: ثبت و ویرایش فاکتور، ردیف‌ها و پرداخت را در
-- یک تراکنش می‌نویسد و مبلغ نهایی فاکتور ممکن است بعد از ردیف پرداخت نوشته شود.
-- بررسی در لحظهٔ INSERT، تراکنشِ درست را هم رد می‌کرد.
CREATE OR REPLACE FUNCTION dm_check_split_payment_total() RETURNS trigger AS $$
DECLARE
  v_invoice_id UUID;
  v_total      BIGINT;
  v_parts      BIGINT;
BEGIN
  -- هر شاخه در دستور خودش: در PL/pgSQL یک عبارت `CASE` یک‌جا آماده (plan) می‌شود و
  -- آنگاه `NEW."id"` برای جدول `invoice_payments` هم تفسیر می‌شود — جدولی که چنین
  -- ستونی ندارد. دستورهای جدا، فقط هنگام اجرای همان شاخه آماده می‌شوند.
  IF TG_TABLE_NAME = 'invoices' THEN
    v_invoice_id := NEW."id";
  ELSE
    v_invoice_id := NEW."invoice_id";
  END IF;

  SELECT p."beneficiary_amount" + p."petty_cash_amount", i."total_amount"
    INTO v_parts, v_total
    FROM "invoice_payments" p
    JOIN "invoices" i ON i."id" = p."invoice_id"
   WHERE p."invoice_id" = v_invoice_id AND p."method_kind" = 'SPLIT';

  -- ردیف پرداخت ترکیبی ندارد (یا در همین تراکنش حذف شده): چیزی برای بررسی نیست.
  IF v_parts IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_parts <> v_total THEN
    RAISE EXCEPTION 'جمع سهم کارپرداز و ذی‌نفع باید برابر مبلغ کل فاکتور باشد (% در برابر %).',
      v_parts, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "invoice_payments_split_total_ck"
  AFTER INSERT OR UPDATE ON "invoice_payments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION dm_check_split_payment_total();

-- مبلغ فاکتور هم می‌تواند بعد از ثبت پرداخت عوض شود؛ آن مسیر هم باید بررسی شود.
CREATE CONSTRAINT TRIGGER "invoices_split_total_ck"
  AFTER UPDATE OF "total_amount" ON "invoices"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION dm_check_split_payment_total();
