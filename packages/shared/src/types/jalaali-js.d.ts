/**
 * اعلان تایپ برای `jalaali-js` که تایپ همراه ندارد.
 * فقط توابعی که واقعاً استفاده می‌کنیم اعلام شده‌اند.
 */
declare module 'jalaali-js' {
  export interface JalaaliDateParts {
    jy: number;
    jm: number;
    jd: number;
  }

  export interface GregorianDateParts {
    gy: number;
    gm: number;
    gd: number;
  }

  export function toJalaali(gy: number, gm: number, gd: number): JalaaliDateParts;
  export function toGregorian(jy: number, jm: number, jd: number): GregorianDateParts;
  export function isValidJalaaliDate(jy: number, jm: number, jd: number): boolean;
  export function isLeapJalaaliYear(jy: number): boolean;
  export function jalaaliMonthLength(jy: number, jm: number): number;
}
