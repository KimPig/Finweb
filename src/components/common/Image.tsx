import { isBlurhashValid } from 'blurhash';
import React, { type FC, useCallback, useEffect, useState } from 'react';
import { BlurhashCanvas } from 'react-blurhash';
import { LazyLoadImage } from 'react-lazy-load-image-component';

import * as userSettings from 'scripts/settings/userSettings';
import './Image.scss';

// Remember successful loads for this document only, without retaining image data.
const revealedImages = new Set<string>();
const rememberImage = (url: string) => {
    revealedImages.delete(url);
    revealedImages.add(url);
    if (revealedImages.size > 2000) {
        const oldest = revealedImages.values().next().value;
        if (oldest !== undefined) revealedImages.delete(oldest);
    }
};

const imageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    zIndex: 0
};

interface ImageProps {
    imgUrl: string;
    blurhash?: string;
    containImage: boolean;
}

const ImageContent: FC<ImageProps> = ({
    imgUrl,
    blurhash,
    containImage
}) => {
    const [wasRevealed] = useState(() => revealedImages.has(imgUrl));
    const [status, setStatus] = useState<'loading' | 'revealing' | 'ready' | 'error'>('loading');
    const [isLoadStarted, setIsLoadStarted] = useState(wasRevealed);
    const finishReveal = useCallback(() => {
        setStatus('ready');
    }, []);
    const handleLoad = useCallback(() => {
        rememberImage(imgUrl);
        if (wasRevealed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishReveal();
        } else {
            setStatus('revealing');
        }
    }, [imgUrl, wasRevealed, finishReveal]);

    useEffect(() => {
        if (status !== 'revealing') return undefined;
        // Also clean up when a custom stylesheet disables the animation.
        const timer = window.setTimeout(finishReveal, 350);
        return () => window.clearTimeout(timer);
    }, [status, finishReveal]);

    const handleAnimationEnd = useCallback((event: React.AnimationEvent<HTMLImageElement>) => {
        if (event.animationName === 'finweb-poster-reveal' && status === 'revealing') finishReveal();
    }, [status, finishReveal]);

    const handleError = useCallback(() => {
        revealedImages.delete(imgUrl);
        setStatus('error');
    }, [imgUrl]);
    const handleLoadStarted = useCallback(() => {
        if (!wasRevealed) setIsLoadStarted(true);
    }, [wasRevealed]);
    const validHash = blurhash && isBlurhashValid(blurhash).result && userSettings.enableBlurhash();

    return (
        <div className='finweb-progressive-image'>
            <div className='finweb-image-placeholder' style={{ ...imageStyle, opacity: status === 'ready' ? 0 : 1 }} aria-hidden='true'>
                {status !== 'ready' && isLoadStarted && validHash && (
                    <BlurhashCanvas hash={blurhash} width={20} height={20} punch={1} style={imageStyle} />
                )}
            </div>
            <LazyLoadImage
                src={imgUrl}
                className={`finweb-image-poster${status === 'revealing' ? ' finweb-image-poster-revealing' : ''}`}
                style={{
                    ...imageStyle,
                    objectFit: containImage ? 'contain' : 'cover',
                    opacity: status !== 'error' && (wasRevealed || status !== 'loading') ? 1 : 0
                }}
                onLoad={handleLoad}
                beforeLoad={handleLoadStarted}
                onError={handleError}
                onAnimationEnd={handleAnimationEnd}
                visibleByDefault={wasRevealed}
            />

        </div>
    );
};

// Reset all image state on source changes, including recycled list/card instances.
const Image: FC<ImageProps> = props => <ImageContent key={props.imgUrl} {...props} />;

export default Image;
