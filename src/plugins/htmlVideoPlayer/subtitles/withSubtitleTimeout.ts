export function withSubtitleTimeout<T>(promise: Promise<T>, stage: string, milliseconds = 30_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`${stage} timed out`)), milliseconds);
        promise.then(value => {
            window.clearTimeout(timeout);
            resolve(value);
        }, error => {
            window.clearTimeout(timeout);
            reject(error);
        });
    });
}
