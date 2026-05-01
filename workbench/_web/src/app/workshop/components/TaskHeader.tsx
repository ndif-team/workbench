interface TaskHeaderProps {
    label: string;
    currentIndex: number;
    total: number;
}

export function TaskHeader({ label, currentIndex, total }: TaskHeaderProps) {
    return (
        <header
            data-testid="workshop-task-header"
            className="flex items-center justify-between border-b py-3 px-4"
        >
            <h1 className="text-lg font-semibold">{label}</h1>
            <div className="flex items-center gap-2" aria-label={`Step ${currentIndex + 1} of ${total}`}>
                {Array.from({ length: total }).map((_, i) => (
                    <span
                        key={i}
                        data-testid={`progress-dot-${i}`}
                        data-active={i === currentIndex ? "true" : "false"}
                        className={
                            i === currentIndex
                                ? "h-2.5 w-2.5 rounded-full bg-primary"
                                : "h-2 w-2 rounded-full bg-muted-foreground/40"
                        }
                    />
                ))}
            </div>
        </header>
    );
}
