

/**
 * Computes set difference of two sets, `left` - `right`.
 * (How is this not in the standard library??)
 */
export function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
    const result = new Set(left);
    for (const ele of right) {
        result.delete(ele);
    }
    return result;
}