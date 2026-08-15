import { Badge } from '@/components/ui/Badge';
import type { TransportSelection } from '@/types/visa';

/**
 * Ground transportation display.
 *
 * Bound to the current structured transport model on the visa case
 * (`VisaCaseDetails.transport`). The obsolete single-string
 * "transportation package" field was removed from the model and is deliberately
 * not recreated here.
 *
 * Shows only what the selection actually holds. When nothing has been selected,
 * it says "Not arranged" rather than inventing a placeholder arrangement.
 */
export function TransportSummary({ transport }: { transport: TransportSelection }) {
  const hasRoute = Boolean(transport.routeName || transport.isCustomRoute);
  const hasAnything =
    hasRoute ||
    Boolean(transport.vehicleTypeName) ||
    Boolean(transport.transportProvider) ||
    transport.referencePrice != null ||
    transport.agreedPrice != null;

  if (!hasAnything) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        Not arranged
      </p>
    );
  }

  const effectiveRate =
    transport.hasPriceOverride && transport.agreedPrice != null
      ? transport.agreedPrice
      : transport.referencePrice;
  const total = effectiveRate != null ? effectiveRate * transport.numberOfVehicles : null;

  const pickup = [transport.pickupDate, transport.pickupTime].filter(Boolean).join(' at ');

  return (
    <div className="rounded-md border border-slate-300 bg-white">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        {hasRoute && (
          <Row label={transport.isCustomRoute ? 'Custom route' : 'Route'}>
            <span className="flex flex-wrap items-center gap-2">
              {transport.routeName ||
                `${transport.customOrigin || '—'} → ${transport.customDestination || '—'}`}
              {transport.isCustomRoute && <Badge tone="caution">Custom</Badge>}
            </span>
          </Row>
        )}
        {transport.vehicleTypeName && <Row label="Vehicle">{transport.vehicleTypeName}</Row>}
        {transport.numberOfVehicles > 0 && (
          <Row label="Quantity">
            <span className="tabular-nums">{transport.numberOfVehicles}</span>
          </Row>
        )}
        {transport.transportProvider && <Row label="Provider">{transport.transportProvider}</Row>}
        {effectiveRate != null && (
          <Row label="Effective rate">
            <span className="tabular-nums">SAR {effectiveRate.toFixed(2)}</span>
            {transport.hasPriceOverride && transport.referencePrice != null && (
              <span className="ml-2 text-xs text-slate-500">
                (reference SAR <span className="tabular-nums">{transport.referencePrice.toFixed(2)}</span>)
              </span>
            )}
          </Row>
        )}
        {transport.hasPriceOverride && (
          <Row label="Rate override">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="caution">Overridden</Badge>
              {transport.overrideApproverName && (
                <span className="text-xs text-slate-600">
                  Approved by {transport.overrideApproverName}
                </span>
              )}
            </span>
            {transport.overrideReason && (
              <span className="mt-0.5 block text-xs text-slate-600">{transport.overrideReason}</span>
            )}
          </Row>
        )}
        {pickup && <Row label="Pickup">{pickup}</Row>}
        {total != null && (
          <Row label="Total">
            <span className="font-bold tabular-nums text-navy-900">SAR {total.toFixed(2)}</span>
          </Row>
        )}
      </dl>
      {transport.internalNotes && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-xs leading-relaxed text-slate-600">
          {transport.internalNotes}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}
