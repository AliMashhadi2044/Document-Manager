// هر پوشه خروجی باید قالب ماژول خودش را اعلام کند، وگرنه Node فایل .js داخل
// dist/esm را بر اساس "type" پکیج ریشه به‌اشتباه CommonJS می‌خواند.
import { writeFileSync } from 'node:fs';

writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2));
console.log('✓ نشانگر قالب ماژول برای dist/cjs و dist/esm نوشته شد');
