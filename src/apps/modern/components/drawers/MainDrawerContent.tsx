import Close from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import Dvr from '@mui/icons-material/Dvr';
import Edit from '@mui/icons-material/Edit';
import Favorite from '@mui/icons-material/Favorite';
import Home from '@mui/icons-material/Home';
import Logout from '@mui/icons-material/Logout';
import Settings from '@mui/icons-material/Settings';
import Storage from '@mui/icons-material/Storage';
import Icon from '@mui/material/Icon';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import React, { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { appHost } from 'components/apphost';
import { appRouter } from 'components/router/appRouter';
import { AppFeature } from 'constants/appFeature';
import { useUserViews } from 'hooks/api/useUserViews';
import { useApi } from 'hooks/useApi';
import useCurrentTab from 'hooks/useCurrentTab';
import { useWebConfig } from 'hooks/useWebConfig';
import globalize from 'lib/globalize';
import Dashboard from 'utils/dashboard';

import LibraryIcon from '../LibraryIcon';
import DrawerHeaderLink from './DrawerHeaderLink';
import { useSelectedUserView } from './useSelectedUserView';

interface DrawerOptionProps {
    label: string;
    icon: ReactNode;
    selected?: boolean;
    to?: string;
    href?: string;
    onClick?: () => void;
}

const selectServer = () => Dashboard.selectServer();
const logout = () => Dashboard.logout();
const exitApp = () => appHost.exit();

function DrawerOption({ label, icon, selected = false, to, href, onClick }: Readonly<DrawerOptionProps>) {
    const className = `navMenuOption${selected ? ' navMenuOption-selected' : ''}`;
    const content = <>
        <span className='navMenuOptionIcon' aria-hidden='true'>{icon}</span>
        <span className='navMenuOptionText'>{label}</span>
    </>;

    if (to) return <Link className={className} to={to} aria-current={selected ? 'page' : undefined}>{content}</Link>;
    if (href) return <a className={className} href={href} target='_blank' rel='noopener noreferrer'>{content}</a>;
    return <button className={className} type='button' onClick={onClick}>{content}</button>;
}

const MainDrawerContent = () => {
    const { user } = useApi();
    const { pathname } = useLocation();
    const { activeTab } = useCurrentTab();
    const { data: userViewsData } = useUserViews({ userId: user?.Id });
    const userViews = userViewsData?.Items || [];
    const selectedView = useSelectedUserView(userViews);
    const { menuLinks } = useWebConfig();
    const isGuideSelected = pathname === '/livetv' && activeTab === 1;

    return (
        <>
            <DrawerHeaderLink />
            <nav className='finweb-navigation' aria-label={globalize.translate('Menu')}>
                <DrawerOption to='/home' label={globalize.translate('Home')} icon={<Home />} />
                <DrawerOption to='/home?tab=1' label={globalize.translate('Favorites')} icon={<Favorite />}
                    selected={pathname === '/home' && activeTab === 1} />

                {menuLinks?.map(link => (
                    <DrawerOption key={`${link.name}_${link.url}`} href={link.url} label={link.name} icon={<Icon>{link.icon || 'link'}</Icon>} />
                ))}

                {userViews.length > 0 && <section aria-labelledby='finweb-media-heading'>
                    <h3 className='sidebarHeader' id='finweb-media-heading'>{globalize.translate('HeaderMedia')}</h3>
                    {userViews.map(view => (
                        <React.Fragment key={view.Id}>
                            <DrawerOption
                                to={appRouter.getRouteUrl(view, { context: view.CollectionType }).substring(1)}
                                label={view.Name || ''}
                                icon={<LibraryIcon item={view} />}
                                selected={Boolean(view.Id) && view.Id === selectedView?.Id && !isGuideSelected}
                            />
                            {view.CollectionType === CollectionType.Livetv && <DrawerOption
                                to='/livetv?tab=1'
                                label={globalize.translate('Guide')}
                                icon={<Dvr />}
                                selected={isGuideSelected}
                            />}
                        </React.Fragment>
                    ))}
                </section>}

                {user?.Policy?.IsAdministrator && <section aria-labelledby='finweb-admin-heading'>
                    <h3 className='sidebarHeader' id='finweb-admin-heading'>{globalize.translate('HeaderAdmin')}</h3>
                    <DrawerOption to='/dashboard' label={globalize.translate('TabDashboard')} icon={<DashboardIcon />} />
                    <DrawerOption to='/metadata' label={globalize.translate('MetadataManager')} icon={<Edit />} />
                </section>}

                {user && <section aria-labelledby='finweb-user-heading'>
                    <h3 className='sidebarHeader' id='finweb-user-heading'>{globalize.translate('HeaderUser')}</h3>
                    {appHost.supports(AppFeature.MultiServer) && <DrawerOption
                        label={globalize.translate('SelectServer')} icon={<Storage />} onClick={selectServer}
                    />}
                    <DrawerOption
                        to='/mypreferencesmenu' label={globalize.translate('Settings')} icon={<Settings />}
                        selected={pathname.startsWith('/mypreferences') || pathname === '/userprofile' || pathname === '/quickconnect'}
                    />
                    <DrawerOption label={globalize.translate('ButtonSignOut')} icon={<Logout />} onClick={logout} />
                    {appHost.supports(AppFeature.ExitMenu) && <DrawerOption
                        label={globalize.translate('ButtonExitApp')} icon={<Close />} onClick={exitApp}
                    />}
                </section>}
            </nav>
        </>
    );
};

export default MainDrawerContent;
