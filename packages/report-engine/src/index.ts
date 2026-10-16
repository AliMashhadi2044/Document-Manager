/**
 * موتور قالب و رندر گزارش.
 *
 * این بسته عمداً **ایزومورفیک** است: نه `fs`، نه `exceljs`، نه هیچ وابستگی فقط-Node.
 * دلیلش این است که هم سرور و هم مرورگر باید بتوانند قالب را اعتبارسنجی و چیدمان کنند.
 * تولید فایل Excel (که به `exceljs` نیاز دارد) در لایه API می‌نشیند و از همین سند
 * چیدمان تغذیه می‌شود — پس قاعده جدول یک‌جا تعریف شده و دو خروجی از آن ساخته می‌شوند.
 */

export * from './expression.js';
export * from './template.js';
export * from './format.js';
export * from './evaluate.js';
export * from './layout.js';
export * from './render-html.js';
export * from './validate.js';
export type { Value } from './types.js';
