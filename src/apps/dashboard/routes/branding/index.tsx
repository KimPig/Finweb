import type { BrandingOptionsDto } from '@jellyfin/sdk/lib/generated-client/models/branding-options-dto';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import Delete from '@mui/icons-material/Delete';
import Upload from '@mui/icons-material/Upload';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type ActionFunctionArgs, Form, useActionData, useNavigation } from 'react-router-dom';

import { getBrandingOptionsQuery, QUERY_KEY, useBrandingOptions } from 'apps/dashboard/features/branding/api/useBrandingOptions';
import Loading from 'components/loading/LoadingComponent';
import Image from 'components/Image';
import Page from 'components/Page';
import { SPLASHSCREEN_URL } from 'constants/branding';
import { useApi } from 'hooks/useApi';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { queryClient } from 'utils/query/queryClient';
import { ActionData } from 'types/actionData';
import { type CustomScriptSettings, parseCustomScriptUrls, readCustomScript, writeCustomScript } from 'utils/finweb/customScriptSettings';

const BRANDING_CONFIG_KEY = 'branding';
const BrandingOption = {
    CustomCss: 'CustomCss',
    LoginDisclaimer: 'LoginDisclaimer',
    SplashscreenEnabled: 'SplashscreenEnabled'
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const api = ServerConnections.getApi();
    if (!api) throw new Error('No Api instance available');

    const formData = await request.formData();
    const data = Object.fromEntries(formData);
    const script: CustomScriptSettings = {
        enabled: data.FinwebCustomJsEnabled?.toString() === 'on',
        code: data.FinwebCustomJs?.toString() || '',
        mode: 'both',
        url: data.FinwebCustomJsUrl?.toString().trim() || ''
    };
    const external = parseCustomScriptUrls(script.url);
    if (script.enabled && external.invalidLine) {
        return { isSaved: false, error: 'FinwebCustomJsInvalidUrl' };
    }

    const brandingOptions: BrandingOptionsDto = {
        CustomCss: writeCustomScript(data.CustomCss?.toString() || '', script),
        LoginDisclaimer: data.LoginDisclaimer?.toString(),
        SplashscreenEnabled: data.SplashscreenEnabled?.toString() === 'on'
    };

    await getSystemApi(api)
        .updateNamedConfiguration({
            key: BRANDING_CONFIG_KEY,
            body: JSON.stringify(brandingOptions)
        });

    void queryClient.invalidateQueries({
        queryKey: [ QUERY_KEY ]
    });

    return {
        isSaved: true
    };
};

export const loader = async () => {
    const api = ServerConnections.getApi();
    if (!api) return {};

    return queryClient.ensureQueryData(
        getBrandingOptionsQuery(api));
};

export const Component = () => {
    const { api } = useApi();
    const navigation = useNavigation();
    const actionData = useActionData() as (ActionData & { error?: string }) | undefined;
    const isSubmitting = navigation.state === 'submitting';

    const {
        data: defaultBrandingOptions,
        isPending,
        isError
    } = useBrandingOptions();
    const [ brandingOptions, setBrandingOptions ] = useState(defaultBrandingOptions || {});
    const [ customScript, setCustomScript ] = useState<CustomScriptSettings>(() => readCustomScript().script);
    const [ invalidScriptSettings, setInvalidScriptSettings ] = useState(false);
    const initializedServer = useRef<string>();

    const [ error, setError ] = useState<string>();

    const [ isSplashscreenEnabled, setIsSplashscreenEnabled ] = useState(brandingOptions.SplashscreenEnabled ?? false);
    const [ splashscreenUrl, setSplashscreenUrl ] = useState<string>();
    useEffect(() => {
        if (!api || !defaultBrandingOptions || initializedServer.current === api.basePath) return;
        const parsed = readCustomScript(defaultBrandingOptions.CustomCss || '');
        setBrandingOptions({ ...defaultBrandingOptions, CustomCss: parsed.css });
        setCustomScript(parsed.script);
        setInvalidScriptSettings(parsed.invalid);
        setIsSplashscreenEnabled(defaultBrandingOptions.SplashscreenEnabled ?? false);
        initializedServer.current = api.basePath;
    }, [api, defaultBrandingOptions]);
    useEffect(() => {
        if (!api || isSubmitting) return;

        setSplashscreenUrl(api.getUri(SPLASHSCREEN_URL, { t: Date.now() }));
    }, [ api, isSubmitting ]);

    const onSplashscreenDelete = useCallback(() => {
        setError(undefined);

        if (!api) return;

        getImageApi(api)
            .deleteCustomSplashscreen()
            .then(() => {
                setSplashscreenUrl(api.getUri(SPLASHSCREEN_URL, { t: Date.now() }));
            })
            .catch(e => {
                console.error('[BrandingPage] error deleting image', e);
                setError('ImageDeleteFailed');
            });
    }, [ api ]);

    const onSplashscreenUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setError(undefined);

        const files = event.target.files;

        if (!api || !files) return false;

        const file = files[0];
        const reader = new FileReader();
        reader.onerror = e => {
            console.error('[BrandingPage] error reading file', e);
            setError('ImageUploadFailed');
        };
        reader.onabort = e => {
            console.warn('[BrandingPage] aborted reading file', e);
            setError('ImageUploadCancelled');
        };
        reader.onload = () => {
            if (!reader.result) return;

            const dataUrl = reader.result as string; // readAsDataURL produces a string
            // FIXME: TypeScript SDK thinks body should be a File but in reality it is a Base64 string
            const body = dataUrl.split(',')[1] as never;
            getImageApi(api)
                .uploadCustomSplashscreen(
                    { body },
                    { headers: { ['Content-Type']: file.type } }
                )
                .then(() => {
                    setSplashscreenUrl(dataUrl);
                })
                .catch(e => {
                    console.error('[BrandingPage] error uploading splashscreen', e);
                    setError('ImageUploadFailed');
                });
        };

        reader.readAsDataURL(file);
    }, [ api ]);

    const setSplashscreenEnabled = useCallback(async (_: React.ChangeEvent<HTMLInputElement>, isEnabled: boolean) => {
        setIsSplashscreenEnabled(isEnabled);

        await getSystemApi(api!)
            .updateNamedConfiguration({
                key: BRANDING_CONFIG_KEY,
                body: JSON.stringify({
                    ...defaultBrandingOptions,
                    SplashscreenEnabled: isEnabled
                })
            });

        void queryClient.invalidateQueries({
            queryKey: [ QUERY_KEY ]
        });
    }, [ api, defaultBrandingOptions ]);

    const setBrandingOption = useCallback((event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (Object.keys(BrandingOption).includes(event.target.name)) {
            setBrandingOptions({
                ...brandingOptions,
                [event.target.name]: event.target.value
            });
        }
    }, [ brandingOptions ]);

    const onSubmit = useCallback(() => {
        setError(undefined);
    }, []);

    const onScriptEnabledChange = useCallback((_: React.ChangeEvent<HTMLInputElement>, enabled: boolean) => {
        setCustomScript(current => ({ ...current, enabled }));
    }, []);

    const onScriptChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const code = event.target.value;
        setCustomScript(current => ({ ...current, code }));
    }, []);

    const onScriptUrlChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const url = event.target.value;
        setCustomScript(current => ({ ...current, url }));
    }, []);

    if (isPending) return <Loading />;

    return (
        <Page
            id='brandingPage'
            title={globalize.translate('HeaderBranding')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Form
                    method='POST'
                    onSubmit={onSubmit}
                >
                    {isError ? (
                        <Alert severity='error'>{globalize.translate('BrandingLoadError')}</Alert>
                    ) : (
                        <Stack spacing={3}>
                            <Typography variant='h1'>
                                {globalize.translate('HeaderBranding')}
                            </Typography>

                            {!isSubmitting && actionData?.isSaved && (
                                <Alert severity='success'>
                                    {globalize.translate('SettingsSaved')}
                                </Alert>
                            )}

                            {(error || actionData?.error) && (
                                <Alert severity='error'>
                                    {globalize.translate(error || actionData!.error!)}
                                </Alert>
                            )}

                            <Stack
                                direction={{
                                    xs: 'column',
                                    sm: 'row'
                                }}
                                spacing={3}
                            >
                                <Box sx={{ flex: '1 1 0' }}>
                                    <Image
                                        isLoading={false}
                                        url={
                                            isSplashscreenEnabled ?
                                                splashscreenUrl :
                                                undefined
                                        }
                                    />
                                </Box>

                                <Stack
                                    spacing={{ xs: 3, sm: 2 }}
                                    sx={{ flex: '1 1 0' }}
                                >
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                name={BrandingOption.SplashscreenEnabled}
                                                checked={isSplashscreenEnabled}
                                                onChange={setSplashscreenEnabled}
                                            />
                                        }
                                        label={globalize.translate('EnableSplashScreen')}
                                    />

                                    <Typography variant='body2'>
                                        {globalize.translate('CustomSplashScreenSize')}
                                    </Typography>

                                    <Button
                                        component='label'
                                        variant='outlined'
                                        startIcon={<Upload />}
                                        disabled={!isSplashscreenEnabled}
                                    >
                                        <input
                                            type='file'
                                            accept='image/*'
                                            hidden
                                            onChange={onSplashscreenUpload}
                                        />
                                        {globalize.translate('UploadCustomImage')}
                                    </Button>

                                    <Button
                                        variant='outlined'
                                        color='error'
                                        startIcon={<Delete />}
                                        disabled={!isSplashscreenEnabled}
                                        onClick={onSplashscreenDelete}
                                    >
                                        {globalize.translate('DeleteCustomImage')}
                                    </Button>
                                </Stack>
                            </Stack>

                            <TextField
                                fullWidth
                                multiline
                                minRows={5}
                                maxRows={5}
                                name={BrandingOption.LoginDisclaimer}
                                label={globalize.translate('LabelLoginDisclaimer')}
                                helperText={globalize.translate('LabelLoginDisclaimerHelp')}
                                value={brandingOptions?.LoginDisclaimer || ''}
                                onChange={setBrandingOption}
                                slotProps={{
                                    input: {
                                        className: 'textarea-mono'
                                    }
                                }}
                            />

                            <TextField
                                fullWidth
                                multiline
                                minRows={5}
                                maxRows={20}
                                name={BrandingOption.CustomCss}
                                label={globalize.translate('LabelCustomCss')}
                                helperText={globalize.translate('LabelCustomCssHelp')}
                                spellCheck={false}
                                value={brandingOptions?.CustomCss || ''}
                                onChange={setBrandingOption}
                                slotProps={{
                                    input: {
                                        className: 'textarea-mono'
                                    }
                                }}
                            />

                            <FormControlLabel
                                control={(
                                    <Switch
                                        name='FinwebCustomJsEnabled'
                                        checked={customScript.enabled}
                                        onChange={onScriptEnabledChange}
                                    />
                                )}
                                label={globalize.translate('FinwebCustomJsEnabled')}
                            />
                            {customScript.enabled ? <TextField
                                fullWidth
                                multiline
                                minRows={6}
                                maxRows={24}
                                name='FinwebCustomJs'
                                label={globalize.translate('FinwebCustomJs')}
                                value={customScript.code}
                                spellCheck={false}
                                onChange={onScriptChange}
                                slotProps={{ input: { className: 'textarea-mono' } }}
                            /> : <input type='hidden' name='FinwebCustomJs' value={customScript.code} />}
                            {customScript.enabled ? <TextField
                                fullWidth
                                multiline
                                minRows={3}
                                maxRows={12}
                                name='FinwebCustomJsUrl'
                                label={globalize.translate('FinwebCustomJsUrl')}
                                helperText={globalize.translate('FinwebCustomJsUrlHelp')}
                                value={customScript.url}
                                onChange={onScriptUrlChange}
                                spellCheck={false}
                                slotProps={{ input: { className: 'textarea-mono' } }}
                            /> : <input type='hidden' name='FinwebCustomJsUrl' value={customScript.url} />}
                            {customScript.enabled && <Alert severity='warning'>
                                {globalize.translate('FinwebCustomJsWarning')}
                            </Alert>}
                            {customScript.enabled && <Typography variant='body2' sx={{ overflowWrap: 'anywhere' }}>
                                {globalize.translate('FinwebCustomJsRecovery')}
                                {' '}
                                <a href={`${window.location.pathname}?finwebSafeMode=1#/dashboard/branding`}>
                                    {globalize.translate('FinwebEnterSafeMode')}
                                </a>
                            </Typography>}
                            {invalidScriptSettings && (
                                <Alert severity='error'>{globalize.translate('FinwebCustomJsInvalid')}</Alert>
                            )}

                            <Button
                                type='submit'
                                size='large'
                            >
                                {globalize.translate('Save')}
                            </Button>
                        </Stack>
                    )}
                </Form>
            </Box>
        </Page>
    );
};

Component.displayName = 'BrandingPage';
