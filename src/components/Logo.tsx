import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'badge';
  className?: string;
  imgClassName?: string;
  title?: string;
}

/**
 * Official Inna Ataina Travels logo.
 * Uses the uploaded badge (compact) for sidebar/loading and full logo where space allows.
 */
export function Logo({ variant = 'full', className, imgClassName, title = 'Inna Ataina Travels' }: LogoProps) {
  const src = variant === 'badge'
    ? '/assets/images/inna_ataina_badge.png'
    : '/assets/images/WhatsApp_Image_2026-07-20_at_12.38.38_AM.jpeg';

  return (
    <div className={cn('flex items-center', className)}>
      <img
        src={src}
        alt={title}
        title={title}
        className={cn(
          'object-contain',
          variant === 'badge' ? 'h-10 w-10' : 'h-12 w-auto max-w-full',
          imgClassName
        )}
      />
    </div>
  );
}

interface LogoMarkProps {
  className?: string;
  size?: number;
}

/**
 * Compact circular logo mark for tight spaces (sidebar collapsed, loading screen).
 */
export function LogoMark({ className, size = 40 }: LogoMarkProps) {
  return (
    <img
      src="/assets/images/inna_ataina_badge.png"
      alt="Inna Ataina Travels"
      width={size}
      height={size}
      className={cn('object-contain rounded-full bg-white', className)}
    />
  );
}
