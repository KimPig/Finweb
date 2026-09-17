import Android from '@mui/icons-material/Android';
import Apple from '@mui/icons-material/Apple';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import React, { useCallback, useState, type ChangeEvent, type MouseEvent } from 'react';

import globalize from 'lib/globalize';
import browser from 'scripts/browser';
import shell from 'scripts/shell';

import { dismissMobileAppNotice, isMobileAppNoticeDismissed, isMobileAppNoticeEligible } from './policy';

const FINDROID_URL = 'https://play.google.com/store/apps/details?id=dev.jdtech.jellyfin';
const SWIFTFIN_URL = 'https://apps.apple.com/app/swiftfin/id1604098728';

function openStore(event: MouseEvent<HTMLAnchorElement>) {
    if (window.NativeShell?.openUrl) {
        event.preventDefault();
        shell.openUrl(event.currentTarget.href, '_blank');
    }
}

export default function MobileAppNotice({ pathname }: Readonly<{ pathname: string }>) {
    const [dismissed, setDismissed] = useState(isMobileAppNoticeDismissed);
    const [doNotShowAgain, setDoNotShowAgain] = useState(false);
    const close = useCallback(() => {
        dismissMobileAppNotice(doNotShowAgain);
        setDismissed(true);
    }, [doNotShowAgain]);
    const changeDoNotShowAgain = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setDoNotShowAgain(event.target.checked);
    }, []);

    return (
        <Dialog
            className='finweb-mobile-app-notice'
            open={!dismissed && isMobileAppNoticeEligible(browser, pathname)}
            onClose={close}
            fullWidth
            maxWidth='xs'
            aria-labelledby='finweb-mobile-app-notice-title'
            aria-describedby='finweb-mobile-app-notice-description'
        >
            <DialogTitle id='finweb-mobile-app-notice-title'>
                {globalize.translate('FinwebMobileAppNoticeTitle')}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <DialogContentText id='finweb-mobile-app-notice-description'>
                        {globalize.translate('FinwebMobileAppNoticeDescription')}
                    </DialogContentText>
                    <Button
                        variant='outlined'
                        href={FINDROID_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        onClick={openStore}
                        startIcon={<Android />}
                        sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                    >
                        Findroid · Google Play
                    </Button>
                    <Button
                        variant='outlined'
                        href={SWIFTFIN_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        onClick={openStore}
                        startIcon={<Apple />}
                        sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                    >
                        Swiftfin · App Store
                    </Button>
                    <DialogContentText>
                        {globalize.translate('FinwebMobileAppNoticeOfficial')}
                    </DialogContentText>
                    <FormControlLabel
                        control={<Checkbox checked={doNotShowAgain} onChange={changeDoNotShowAgain} />}
                        label={globalize.translate('FinwebMobileAppNoticeDoNotShowAgain')}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>{globalize.translate('ButtonClose')}</Button>
            </DialogActions>
        </Dialog>
    );
}
