import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { userPreferencesSchema } from '@dm/shared';

import {
  Authenticated,
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { PreferencesService } from './preferences.service';

/**
 * شخصی‌سازی کاربر جاری.
 *
 * `@Authenticated()` و نه یک مجوز: هر کاربری که وارد می‌شود ترجیح خودش را دارد، و
 * مجوز گرفتن برای عوض کردن رنگ رابط، معنایی نداشت. دامنهٔ هر دو مسیر همان کاربرِ
 * نشست است — شناسه نه در مسیر می‌آید و نه در بدنه، پس مسیری برای رسیدن به پروفایل
 * کسی دیگر نیست.
 *
 * `PUT` واقعاً می‌نویسد (نشان «فقط خواندنی» رویش دروغ می‌بود) ولی آنچه می‌نویسد
 * **ترجیح نمایشی خودِ کاربر** است؛ همین را `role-separation.test.ts` صریح نگه
 * می‌دارد.
 */
@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Authenticated()
  @Get()
  @ApiOperation({ summary: 'ترجیح‌های شخصی‌سازی کاربر جاری' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.get(user.id);
  }

  @Authenticated()
  @Put()
  @ApiOperation({ summary: 'ذخیره ترجیح‌های شخصی‌سازی کاربر جاری' })
  async replace(
    @Body(new ZodBody(userPreferencesSchema)) body: ReturnType<typeof userPreferencesSchema.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.preferences.replace(user.id, body);
  }
}
