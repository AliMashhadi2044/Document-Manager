import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * قواعد ESLint سامانه.
 *
 * این فایل سه دسته قاعده دارد و هر سه **قاعده واقعی پروژه‌اند**، نه سلیقه قالب‌بندی:
 *
 *  ۱. ممنوعیت‌های امنیتی: `eval` و `new Function` در هیچ‌جای این مخزن مجاز نیستند.
 *     موتور گزارش قرار است عبارت کاربر را با AST ایمن ارزیابی کند، نه با اجرای کد
 *     (الزام §۲۲ پرامپت). اگر روزی کسی میان‌بر بزند، اینجا متوقف می‌شود.
 *  ۲. ممنوعیت‌های مالی: مبلغ ریالی از مسیر `Number`، `parseFloat` یا ممیز شناور
 *     عبور نمی‌کند (ADR-0003، ریسک R2). در لایه‌های مالی، تبدیل عدد ممنوع است.
 *  ۳. مرز ماژول‌ها: پکیج مشترک به اپ‌ها وابسته نمی‌شود، و دو اپ به هم import نمی‌کنند.
 *     بدون این، «منبع واحد محاسبه» به‌تدریج از هم می‌پاشد.
 */

const SECURITY_BANS = [
  {
    selector: "CallExpression[callee.name='eval']",
    message: 'اجرای کد با eval ممنوع است؛ ارزیابی عبارت گزارش با AST ایمن انجام می‌شود.',
  },
  {
    selector: "NewExpression[callee.name='Function']",
    message: 'ساخت تابع از رشته ممنوع است (معادل eval).',
  },
  {
    selector: "CallExpression[callee.object.name='Function'][callee.property.name='constructor']",
    message: 'ساخت تابع از رشته ممنوع است (معادل eval).',
  },
];

const FINANCIAL_BANS = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'مبلغ یا مقدار هرگز با parseFloat خوانده نمی‌شود؛ از moneyFromString و qtyFromString استفاده کنید.',
  },
  {
    selector: "CallExpression[callee.name='parseInt']",
    message: 'از Number.parseInt با مبنای صریح یا توابع @dm/shared استفاده کنید، نه parseInt سراسری.',
  },
];

const MONEY_BANS = [
  {
    selector: "CallExpression[callee.name='Number']",
    message: 'در لایه مالی تبدیل به Number ممنوع است؛ مبلغ ریالی bigint است (ADR-0003).',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message:
      'گرد کردن مالی با roundDiv انجام می‌شود، نه toFixed. استثنای مجاز فقط Prisma.Decimal است؛ ' +
      'آن را با eslint-disable-next-line و دلیل صریح علامت بزنید.',
  },
  {
    selector: 'BinaryExpression[operator="/"]',
    message: 'تقسیم مستقیم در لایه مالی ممنوع است؛ از roundDiv با سیاست صریح استفاده کنید.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/prisma/migrations/**',
      'apps/web/dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-syntax': ['error', ...SECURITY_BANS, ...FINANCIAL_BANS],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` صریح در کد تولیدی مجاز نیست؛ مرزهای Prisma با unknown و type guard رد می‌شوند.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  /**
   * لایه‌های مالی: علاوه بر قواعد عمومی، تبدیل عدد و ممیز شناور هم ممنوع است.
   * محاسبه ریالی فقط با `bigint` و توابع `@dm/shared` انجام می‌شود.
   */
  {
    files: [
      'packages/shared/src/money/**/*.ts',
      'packages/shared/src/financial/**/*.ts',
      'packages/shared/src/invoices/**/*.ts',
      'apps/api/src/modules/financial/**/*.ts',
      'apps/api/src/modules/invoices/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...SECURITY_BANS, ...FINANCIAL_BANS, ...MONEY_BANS],
    },
  },

  /**
   * خودِ بدویات پول: `rounding.ts` **پیاده‌سازی** گرد کردن است و `money.ts` تبدیل
   * مقیاس را انجام می‌دهد، پس تقسیم اینجا هدف است نه تخلف. تنها همین دو فایل از
   * ممنوعیت تقسیم مستثنا هستند؛ هر مصرف‌کننده‌ای باید از `roundDiv` رد شود.
   */
  {
    files: ['packages/shared/src/money/money.ts', 'packages/shared/src/money/rounding.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SECURITY_BANS,
        ...FINANCIAL_BANS,
        ...MONEY_BANS.filter((ban) => !ban.selector.startsWith('BinaryExpression')),
      ],
    },
  },

  /** پکیج مشترک نباید به هیچ اپ یا کتابخانه مخصوص سرور وابسته شود. */
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@dm/api', '@dm/web', '**/apps/**'], message: 'پکیج مشترک به اپ‌ها وابسته نمی‌شود.' },
            { group: ['@prisma/client', '@nestjs/*', 'react', 'react-dom'], message: 'پکیج مشترک در مرورگر و سرور اجرا می‌شود؛ وابستگی مخصوص یک طرف مجاز نیست.' },
          ],
        },
      ],
    },
  },

  /** رابط کاربری به Prisma و کد سرور دسترسی ندارد. */
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@prisma/client', '@nestjs/*', '@dm/api', '**/apps/api/**'], message: 'رابط کاربری به کد یا تایپ‌های سرور وابسته نمی‌شود؛ قرارداد از @dm/shared می‌آید.' },
          ],
        },
      ],
    },
  },

  /** سرور به رابط کاربری وابسته نمی‌شود. */
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', '@dm/web', '**/apps/web/**'], message: 'سرور به رابط کاربری وابسته نمی‌شود.' },
          ],
        },
      ],
    },
  },

  /** تست‌ها: قواعد مالی سخت‌گیرانه اعمال نمی‌شوند، چون باید رفتار نادرست را هم بسازند. */
  {
    files: ['**/*.test.{ts,tsx}', 'vitest.config.ts', 'eslint.config.mjs'],
    rules: {
      'no-restricted-syntax': ['error', ...SECURITY_BANS],
      'no-console': 'off',
    },
  },

  /** اسکریپت‌های seed و ابزار: چاپ در خروجی بخشی از کارشان است. */
  {
    files: ['apps/api/prisma/**/*.ts', 'packages/*/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
      // متغیرهای سراسری Node در این اسکریپت‌ها طبیعی‌اند؛ تایپ‌چک مرجع نبودِ متغیر است.
      'no-undef': 'off',
    },
  },
);
