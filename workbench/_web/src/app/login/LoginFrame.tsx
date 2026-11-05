"use client";

import type { MouseEvent, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CwLogo } from "@/components/CwLogo";
import styles from "./login.module.css";

/**
 * Keep the artwork and page geometry stable while sign-in options load. The
 * signal-focus rings are drawn over the artwork in its own 1536 × 1024
 * coordinates, so they have to move with the image if it is replaced.
 *
 * The logo goes back to the previous page when that page is one of the app's
 * (the Navigation API's `canGoBack` only counts same-origin entries). Arriving
 * from another site, from a fresh tab, or in a browser without the Navigation
 * API, it follows its href home instead. Modified clicks keep the link's
 * default, so it still opens home in a new tab.
 */
export function LoginFrame({ children }: { children: ReactNode }) {
    const router = useRouter();

    const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
        if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }
        const { navigation } = window as Window & { navigation?: { canGoBack: boolean } };
        if (!navigation?.canGoBack) return;
        event.preventDefault();
        router.back();
    };

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <Link
                    href="/"
                    onClick={handleBack}
                    className={styles.brand}
                    aria-label="Back"
                    title="Back"
                >
                    <CwLogo cell={7} wordmark />
                </Link>
            </header>
            <div className={styles.stage}>
                <section className={styles.access} aria-labelledby="login-heading">
                    <div className={styles.intro}>
                        <h1 id="login-heading">Look beneath the surface.</h1>
                        <p>Sign in to access LLMs hosted on NDIF, up to Llama 405B.</p>
                    </div>
                    <div className={styles.form}>{children}</div>
                </section>
                <figure className={styles.artwork}>
                    <Image
                        src="/images/login/neural-layers-clean-lines.webp"
                        width={1536}
                        height={1024}
                        sizes="(max-width: 760px) 100vw, (max-width: 1240px) 55vw, 650px"
                        priority
                        alt="An orange signal passing through stacked blue and lavender matrix layers."
                    />
                    <svg
                        className={styles.signalFocus}
                        viewBox="0 0 1536 1024"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle
                            cx="882"
                            cy="604"
                            r="67"
                            fill="rgb(255 191 111 / 4%)"
                            stroke="rgb(237 131 53 / 80%)"
                            strokeWidth="2.5"
                        />
                        <circle
                            cx="882"
                            cy="604"
                            r="94"
                            fill="none"
                            stroke="rgb(237 131 53 / 35%)"
                            strokeWidth="1.8"
                        />
                        <path
                            className={styles.signalCrosshair}
                            d="M767 604h30 M967 604h30 M882 489v30 M882 689v30"
                            fill="none"
                            strokeWidth="1.6"
                        />
                    </svg>
                </figure>
            </div>
        </main>
    );
}
