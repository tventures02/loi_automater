import React, { useState } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { sendToAmplitude } from "../../utils/amplitude";
import CONSTANTS from "../../utils/constants";
import { generatePricingPageUrl } from "../../utils/misc";
import { serverFunctions } from "../../utils/serverFunctions";
import { User } from "../../utils/types";

const isDev = process.env.REACT_APP_NODE_ENV.includes('dev');

export default function CtaCard ({ 
    message,    
    user,
    config,
}: {
    message: string;
    user: User;
    config: any;
}) {
    const [isNavigating, setIsNavigating] = useState(false);
    const onUpgradeClick = async () => {
        try {
            if (isNavigating) return;
            setIsNavigating(true);
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.UPGRADE_CLICKED, null, { email: user.email });
            }
            catch (error) { }

            const url = await generatePricingPageUrl(user.email, user.idToken, serverFunctions.getUserData, config);
            if (isDev) {
                console.log(url);
                console.log(user.email)
                console.log(user.idToken)
            }
            window.open(url, '_blank');
        } catch (error) {
            if (isDev) console.log(error);
        }
        finally {
            setIsNavigating(false);
        }
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onUpgradeClick}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onUpgradeClick() : null)}
            className="
group relative mt-2 cursor-pointer outline-none
rounded-lg p-[1px]
bg-gradient-to-r from-amber-400 via-rose-400 to-fuchsia-500
shadow-sm transition-shadow
hover:shadow-[0_0_0_3px_rgba(251,191,36,0.25)]
focus-visible:shadow-[0_0_0_3px_rgba(17,24,39,0.8)]
"
        >
            {/* inner card */}
            <div
                className="
flex items-center justify-between
rounded-md bg-amber-50/90 backdrop-blur
px-3 py-2
"
            >
                {/* left: message + tiny attention beacon (no extra copy) */}
                <div className="flex items-center gap-2">
                    <div className="text-[10px] text-amber-900">
                        { isNavigating ? 'Going to pricing page...' : message}
                    </div>
                </div>

                {/* right: button (keeps same label); isolates click to avoid double-fire */}
                <button
                    type="button"
                    disabled={isNavigating}
                    onClick={(e) => {
                        e.stopPropagation();
                        onUpgradeClick();
                    }}
                    className="
inline-flex items-center gap-1 rounded-md
bg-gray-900 px-2 py-1 text-[11px] text-white
transition
shadow-sm
hover:bg-gray-800 hover:shadow-md
active:scale-[0.98]
focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 cursor-pointer
"
                >
                    <LockClosedIcon className="h-3 w-3" />
                    Upgrade
                    {/* arrow nudge for affordance; no new copy */}
                    <svg
                        className="
h-3 w-3 -mr-0.5
translate-x-0 transition-transform
group-hover:translate-x-[2px]
"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                    >
                        <path d="M7 5l5 5-5 5" />
                    </svg>
                </button>
            </div>

            {/* subtle glow sheen on hover (visual premium cue, no copy) */}
            <div
                className="
pointer-events-none absolute inset-0 rounded-lg opacity-0
transition-opacity duration-300
group-hover:opacity-100
"
                style={{
                    background:
                        "radial-gradient(60% 60% at 80% 0%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 60%)",
                }}
                aria-hidden="true"
            />
        </div>
    )
}