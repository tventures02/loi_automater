// ───────────────────────────────────────────────────────────────
// Freemium counters (per-user) via UserProperties
// ───────────────────────────────────────────────────────────────
export const DEFAULT_FREE_DAILY_SEND_CAP = 10;                 // Free users get 10/day by default
const RESERVATION_TTL_MS = 15 * 60 * 1000;         // Reclaim stuck reservations after 15 minutes

const LOI_PROP = {
    dateKey: 'loi.dateKey',
    used: 'loi.used',       // irrevocably consumed today
    reserved: 'loi.reserved',   // in-flight “held” quota
    reservedTs: 'loi.reservedTs', // timestamp of last reservation change
};

function _tz_() {
    return SpreadsheetApp.getActive()?.getSpreadsheetTimeZone()
        || Session.getScriptTimeZone()
        || 'UTC';
}
function _todayKey_(tz: string) {
    return Utilities.formatDate(new Date(), tz, 'yyyyMMdd'); // e.g., 20250828
}
function _getUserProps_() {
    return PropertiesService.getUserProperties();
}
function _toInt_(v: any, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : d;
}

/** Read & normalize counters for *today*. Resets on date change, reclaims stale reservations. */
function _readAndNormalizeCounters_(tz: string) {
    const props = _getUserProps_();
    const today = _todayKey_(tz);
    const pDate = props.getProperty(LOI_PROP.dateKey);
    let used = _toInt_(props.getProperty(LOI_PROP.used), 0);
    let reserved = _toInt_(props.getProperty(LOI_PROP.reserved), 0);
    const reservedTs = _toInt_(props.getProperty(LOI_PROP.reservedTs), 0);

    if (pDate !== today) {
        used = 0; reserved = 0;
        props.setProperties({
            [LOI_PROP.dateKey]: today,
            [LOI_PROP.used]: '0',
            [LOI_PROP.reserved]: '0',
            [LOI_PROP.reservedTs]: String(Date.now()),
        });
    } else if (reserved > 0 && Date.now() - reservedTs > RESERVATION_TTL_MS) {
        // Reclaim stale holds
        reserved = 0;
        props.setProperties({
            [LOI_PROP.reserved]: '0',
            [LOI_PROP.reservedTs]: String(Date.now()),
        });
    }
    return { today, used, reserved, props };
}

function _resolvePlanAndCap_(isPremium: boolean, freeDailyCap?: number) {
    const plan = isPremium ? 'premium' : 'free';
    const cap = isPremium ? Number.MAX_SAFE_INTEGER
        : _toInt_(freeDailyCap, DEFAULT_FREE_DAILY_SEND_CAP);
    return { plan, cap };
}

/** Reserve up to `ask` credits under a per-user lock. */
// Atomically reserves a requested number of send credits against the user's daily cap, returning the amount actually granted.
// prevent race conditions (like double-clicking "Send") by using locks
export function _reserveCredits_({ ask, isPremium, freeDailyCap }: { ask: number, isPremium: boolean, freeDailyCap?: number }) {
    const lock = LockService.getUserLock();
    if (!lock.tryLock(10_000)) throw new Error('Another send is in progress. Try again soon.');
    try {
        const tz = _tz_();
        const { plan, cap } = _resolvePlanAndCap_(isPremium, freeDailyCap);
        const { today, used, reserved, props } = _readAndNormalizeCounters_(tz);

        const remaining = Math.max(0, cap - used - reserved);
        const granted = Math.max(0, Math.min(ask, remaining));

        if (granted > 0) {
            props.setProperties({
                [LOI_PROP.reserved]: String(reserved + granted),
                [LOI_PROP.reservedTs]: String(Date.now()),
            });
        }

        return { plan, cap, today, used, granted };
    } finally {
        lock.releaseLock();
    }
}

/** Commit after sending: used += sent; reserved -= granted (clamped ≥ 0). */
// Atomically finalizes a send operation by adding successful sends to the daily 'used' total and clearing the original reservation.
// prevent race conditions (like double-clicking "Send") by using locks
export function _commitCredits_({ granted, sent }: { granted: number, sent: number }) {
    const lock = LockService.getUserLock();
    if (!lock.tryLock(10_000)) {
        console.log('Another send is in progress. Try again soon.');
        throw new Error('Another send is in progress. Try again soon.');
    }
    try {
        const tz = _tz_();
        const { props } = _readAndNormalizeCounters_(tz);
        const prevUsed = _toInt_(props.getProperty(LOI_PROP.used), 0);
        const prevReserved = _toInt_(props.getProperty(LOI_PROP.reserved), 0);

        const newUsed = Math.max(0, prevUsed + Math.max(0, sent));
        const newReserved = Math.max(0, prevReserved - Math.max(0, granted));

        props.setProperties({
            [LOI_PROP.used]: String(newUsed),
            [LOI_PROP.reserved]: String(newReserved),
            [LOI_PROP.reservedTs]: String(Date.now()),
        });

        return { used: newUsed, reserved: newReserved };
    } catch (error) {
        console.log('error', error);
        throw error;
    } finally {
        lock.releaseLock();
    }
}

export const getSendCreditsLeft = (payload) => {
    const isPremium = !!payload?.isPremium;
    const freeDailyCap = Number(payload?.freeDailyCap ?? DEFAULT_FREE_DAILY_SEND_CAP);

    const lock = LockService.getUserLock();
    if (!lock.tryLock(10_000)) throw new Error('Busy, try again.');
    try {
        const tz = _tz_();
        const { used, reserved } = _readAndNormalizeCounters_(tz);
        const { plan, cap } = _resolvePlanAndCap_(isPremium, freeDailyCap);

        const gmailRemaining = MailApp.getRemainingDailyQuota();
        const planLeftTotal = Math.max(0, cap - used);
        const planLeftNow = Math.max(0, cap - used - reserved);

        return {
            plan,
            dailyCap: isPremium ? gmailRemaining : freeDailyCap,
            usedToday: used,
            reserved,
            gmailRemaining,
            creditsLeftPlan: planLeftTotal,
            creditsAvailableNow: Math.min(gmailRemaining, planLeftNow),
            creditsLeft: Math.min(gmailRemaining, planLeftTotal),
        };
    } finally {
        lock.releaseLock();
    }
};
