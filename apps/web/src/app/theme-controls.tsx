import {
  PRIMARY_COLORS,
  PRIMARY_COLOR_LABELS,
  THEME_MODES,
  THEME_MODE_LABELS,
  useTheme,
} from '../shared/theme/theme';
import { Button } from '../shared/ui/button';

/** تنظیمات ظاهری کاربر. این تنظیمات بر محاسبات مالی یا دسترسی‌ها اثری ندارند. */
export function ThemeControls(): JSX.Element {
  const { mode, setMode, primary, setPrimary, resolved } = useTheme();

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">تنظیمات ظاهر</h2>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-muted-foreground">تم</span>
          {THEME_MODES.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={mode === item ? 'primary' : 'secondary'}
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {THEME_MODE_LABELS[item]}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">
            (تم مؤثر: {resolved === 'dark' ? 'تاریک' : 'روشن'})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-muted-foreground">رنگ اصلی</span>
          {PRIMARY_COLORS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={primary === item ? 'primary' : 'secondary'}
              aria-pressed={primary === item}
              onClick={() => setPrimary(item)}
            >
              {PRIMARY_COLOR_LABELS[item]}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
