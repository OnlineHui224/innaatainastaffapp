import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { usePersonalGemini } from '@/context/personalGeminiStore';
import { BANNER_ACTION, BANNER_LABEL, GEMINI_STATUS } from '@/types/personalGemini';

/**
 * Compact Personal Gemini status inside an operations module.
 *
 * One low strip above the workflow. It reports availability and offers the next
 * step — it never removes the workflow beneath it. Uploads, staff-entered
 * fields and everything already reviewed stay exactly where they are in every
 * state.
 *
 * The inline action routes to the account page rather than acting here, because
 * a connection is managed in the staff member's own account, not inside an
 * operations module.
 */
export function PersonalGeminiBanner({ className }: { className?: string }) {
  const { state } = usePersonalGemini();
  const tone = GEMINI_STATUS[state];
  const action = BANNER_ACTION[state];

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2',
        tone.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden="true" />
      <span className="text-xs text-slate-600">Personal Gemini Access</span>
      <span className="text-xs font-bold">{BANNER_LABEL[state]}</span>

      {action && (
        <Link
          to="/app/account"
          className={cn(
            'ml-auto inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-white px-2.5 py-1 sm:min-h-[30px]',
            'text-xs font-bold text-navy-900 transition-colors hover:bg-slate-50',
          )}
        >
          {action}
          <span className="sr-only"> personal Gemini access, in your account</span>
        </Link>
      )}
    </div>
  );
}
