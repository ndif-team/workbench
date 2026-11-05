import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { CwLogo } from "@/components/CwLogo";
import styles from "./login.module.css";

/** Keep the artwork and page geometry stable while sign-in options load. */
export function LoginFrame({ children }: { children: ReactNode }) {
    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <Link href="/" className={styles.brand} aria-label="Workbench home">
                    <CwLogo cell={7} wordmark />
                </Link>
            </header>
            <div className={styles.stage}>
                <section className={styles.access} aria-labelledby="login-heading">
                    <div className={styles.intro}>
                        <h1 id="login-heading">Look beneath the surface.</h1>
                        <p>Log in to access LLMs hosted on NDIF, up to Llama 405B.</p>
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
