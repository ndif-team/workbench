"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The logo of the account that publishes a model (its Hugging Face avatar,
 * `Model.org.avatar_url`), on a small square tile. Nothing at all when the
 * account has none or the image doesn't load, so the names beside it start
 * where it would have been. Decorative: the account's name is always shown
 * beside it.
 *
 * The tile is white in both themes: the logos are made for light
 * backgrounds, and some are dark marks on transparency (openai's) that would
 * vanish on a dark card. The image is fetched from Hugging Face's CDN without
 * a referrer.
 */
export function OrgAvatar({ src, className }: { src?: string | null; className?: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (!src || failed) return null;

    return (
        <span
            aria-hidden
            className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white",
                className,
            )}
        >
            <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className="size-full object-contain"
            />
        </span>
    );
}
