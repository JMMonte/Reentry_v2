interface TimeUtils {
    setTimeWarp: (value: number) => void;
}

interface TimeWarpEvent extends CustomEvent {
    detail: {
        value: number;
    };
}

interface TimeUpdateEvent extends CustomEvent {
    detail: {
        simulatedTime: string;
    };
}

interface TimeFormattedEvent extends CustomEvent {
    detail: {
        formattedTime: string;
    };
}

export function initTimeControls(timeUtils: TimeUtils): void {
    const timeWarpOptions: readonly number[] = [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000] as const;
    let currentTimeWarpIndex = 1; // Start at 1x

    // Listen for time warp update events from React
    document.addEventListener('updateTimeWarp', ((event: TimeWarpEvent) => {
        const { value } = event.detail;
        timeUtils.setTimeWarp(value);
    }) as EventListener);

    // Listen for time updates from the main app
    document.addEventListener('timeUpdate', ((event: TimeUpdateEvent) => {
        const { simulatedTime } = event.detail;
        const date = new Date(simulatedTime);

        // Format the time as HH:MM:SS.cc (24-hour format with centesimals)
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');
        const milliseconds = date.getUTCMilliseconds();
        const centesimals = Math.floor(milliseconds / 10).toString().padStart(2, '0');

        const formattedTime = `${hours}:${minutes}:${seconds}.${centesimals}`;

        // Dispatch the formatted time to React
        document.dispatchEvent(new CustomEvent<TimeFormattedEvent['detail']>('timeFormatted', { 
            detail: { formattedTime } 
        }));
    }) as EventListener);

    // Initialize with the default time warp value
    timeUtils.setTimeWarp(timeWarpOptions[currentTimeWarpIndex]);
} 