export function simpleTimeParse(str: string): { hours: number, minutes: number } {
    const parts = str.split(':');
    return {hours: Number(parts[0]), minutes: Number(parts[1])};
}