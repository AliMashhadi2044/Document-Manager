import { Icon, type IconName } from '../../shared/ui/icon';

/**
 * دکمهٔ اقدام در ستون آخر جدول‌های اطلاعات پایه.
 *
 * یک‌جا، چون هر صفحهٔ تازه نسخهٔ خودش را کپی می‌کرد و اندازه و حالت hoverشان کم‌کم
 * با هم فرق می‌کرد. برچسب **اجباری** است: این دکمه‌ها فقط آیکون‌اند و بدون نام
 * قابل دسترس، صفحه‌خوان چیزی برای خواندن ندارد.
 */
export function RowAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150 hover:bg-muted active:scale-90 ${
        danger ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
