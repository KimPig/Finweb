import { createContext, useContext } from 'react';

export const HomePlaybackVisibility = createContext(true);
export const useHomePlaybackVisibility = () => useContext(HomePlaybackVisibility);
